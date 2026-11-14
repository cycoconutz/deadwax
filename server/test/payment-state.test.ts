import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../src/db'
import { listings, orderItems, orders, payments } from '../src/db/schema'
import { createPendingOrder } from '../src/lib/checkout'
import { confirmPayment, expireStaleOrders, PAYMENT_TTL_MS } from '../src/lib/payment'
import {
  addToCart,
  authHeaders,
  CHECKOUT_PAYLOAD,
  createListing,
  createUser,
  makeApp,
  resetDb,
} from './helpers'

let app: FastifyInstance

beforeAll(async () => {
  app = await makeApp()
})

afterAll(async () => {
  await app.close()
})

beforeEach(async () => {
  await resetDb()
})

async function orderRow(orderId: number) {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  const row = rows[0]
  if (!row) throw new Error(`order ${orderId} not found`)
  return row
}

async function paymentRow(orderId: number) {
  const rows = await db.select().from(payments).where(eq(payments.orderId, orderId)).limit(1)
  const row = rows[0]
  if (!row) throw new Error(`payment for ${orderId} not found`)
  return row
}

async function stockOf(listingId: number): Promise<number> {
  const rows = await db
    .select({ stock: listings.stock })
    .from(listings)
    .where(eq(listings.id, listingId))
    .limit(1)
  return rows[0]?.stock ?? -1
}

describe('order lifecycle', () => {
  it('creates an order that is waiting for money, with the stock held', async () => {
    const seller = await createUser('seller@example.com', { role: 'seller' })
    const buyer = await createUser('buyer@example.com')
    const listing = await createListing(seller.id, { stock: 1, priceCents: 2499 })
    await addToCart(buyer.id, listing.id)

    const created = await createPendingOrder(buyer.id, CHECKOUT_PAYLOAD, 'simulated')
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const order = await orderRow(created.orderId)
    expect(order.status).toBe('pending')
    expect(order.paidAt).toBeNull()
    expect(order.stockReservedAt).not.toBeNull()
    expect(await stockOf(listing.id)).toBe(0)

    const payment = await paymentRow(created.orderId)
    expect(payment.status).toBe('requires_payment')

    const items = await db
      .select({ status: orderItems.status })
      .from(orderItems)
      .where(eq(orderItems.orderId, created.orderId))
    expect(items.map((item) => item.status)).toEqual(['pending'])
  })

  it('moves payment, order and items together, and is safe to call twice', async () => {
    const seller = await createUser('seller@example.com', { role: 'seller' })
    const buyer = await createUser('buyer@example.com')
    const listing = await createListing(seller.id, { stock: 1 })
    await addToCart(buyer.id, listing.id)

    const created = await createPendingOrder(buyer.id, CHECKOUT_PAYLOAD, 'simulated')
    expect(created.ok).toBe(true)
    if (!created.ok) return

    expect(await confirmPayment(created.orderId)).toBe('confirmed')

    const paid = await orderRow(created.orderId)
    expect(paid.status).toBe('paid')
    expect(paid.paidAt).not.toBeNull()
    expect((await paymentRow(created.orderId)).status).toBe('succeeded')

    const items = await db
      .select({ status: orderItems.status })
      .from(orderItems)
      .where(eq(orderItems.orderId, created.orderId))
    expect(items.map((item) => item.status)).toEqual(['paid'])

    const firstPaidAt = paid.paidAt?.getTime()
    expect(await confirmPayment(created.orderId)).toBe('already_paid')
    expect((await orderRow(created.orderId)).paidAt?.getTime()).toBe(firstPaidAt)
  })

  it('releases the stock and cancels the order when payment never arrives', async () => {
    const seller = await createUser('seller@example.com', { role: 'seller' })
    const buyer = await createUser('buyer@example.com')
    const listing = await createListing(seller.id, { stock: 2 })
    await addToCart(buyer.id, listing.id)

    const created = await createPendingOrder(buyer.id, CHECKOUT_PAYLOAD, 'simulated')
    expect(created.ok).toBe(true)
    if (!created.ok) return
    expect(await stockOf(listing.id)).toBe(1)

    // Nothing has run yet: a sweep inside the window must not touch it.
    expect(await expireStaleOrders(new Date(Date.now() + PAYMENT_TTL_MS / 2))).toBe(0)
    expect(await stockOf(listing.id)).toBe(1)

    const later = new Date(Date.now() + PAYMENT_TTL_MS + 60_000)
    expect(await expireStaleOrders(later)).toBe(1)

    const cancelled = await orderRow(created.orderId)
    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.stockReservedAt).toBeNull()
    expect(await stockOf(listing.id)).toBe(2)

    expect((await paymentRow(created.orderId)).status).toBe('failed')

    const items = await db
      .select({ status: orderItems.status })
      .from(orderItems)
      .where(eq(orderItems.orderId, created.orderId))
    expect(items.map((item) => item.status)).toEqual(['cancelled'])
  })

  it('leaves a normal checkout with a satisfied payment behind it', async () => {
    const seller = await createUser('seller@example.com', { role: 'seller' })
    const buyer = await createUser('buyer@example.com')
    const listing = await createListing(seller.id, { stock: 1 })
    await addToCart(buyer.id, listing.id)

    const response = await app.inject({
      method: 'POST',
      url: '/api/checkout',
      headers: authHeaders(buyer),
      payload: CHECKOUT_PAYLOAD,
    })
    expect(response.statusCode).toBe(201)

    const paidOrders = await db
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.status, ['paid', 'shipped', 'delivered']))
    expect(paidOrders.length).toBeGreaterThan(0)

    const settled = await db
      .select({ orderId: payments.orderId })
      .from(payments)
      .where(
        and(
          eq(payments.status, 'succeeded'),
          inArray(
            payments.orderId,
            paidOrders.map((order) => order.id),
          ),
        ),
      )

    expect(new Set(settled.map((row) => row.orderId))).toEqual(
      new Set(paidOrders.map((order) => order.id)),
    )
  })

  it('does not let a seller ship an order that has not been paid', async () => {
    const seller = await createUser('seller@example.com', { role: 'seller' })
    const buyer = await createUser('buyer@example.com')
    const listing = await createListing(seller.id, { stock: 1 })
    await addToCart(buyer.id, listing.id)

    const created = await createPendingOrder(buyer.id, CHECKOUT_PAYLOAD, 'simulated')
    expect(created.ok).toBe(true)
    if (!created.ok) return

    const itemRows = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(eq(orderItems.orderId, created.orderId))
    const itemId = itemRows[0]?.id
    expect(itemId).toBeDefined()

    const ship = await app.inject({
      method: 'PATCH',
      url: `/api/seller/orders/items/${itemId}`,
      headers: authHeaders(seller),
      payload: { status: 'shipped' },
    })
    expect(ship.statusCode).toBe(409)
    expect(ship.json()).toMatchObject({ error: 'order_not_paid' })

    const markPaid = await app.inject({
      method: 'PATCH',
      url: `/api/seller/orders/items/${itemId}`,
      headers: authHeaders(seller),
      payload: { status: 'paid' },
    })
    expect(markPaid.statusCode).toBe(400)
    expect(markPaid.json()).toMatchObject({ error: 'invalid_transition' })
  })
})
