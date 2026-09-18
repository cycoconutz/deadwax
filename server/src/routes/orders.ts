import type { FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import { desc, eq, inArray, sql } from 'drizzle-orm'
import {
  checkoutSchema,
  shippingFlatCents,
  type OrderDetail,
  type OrderItemPublic,
  type OrderSummary,
} from '@deadwax/shared'
import { db } from '../db/index'
import { cartItems, listings, orderItems, orders, payments, users } from '../db/schema'

interface OrderRow {
  id: number
  status: OrderSummary['status']
  subtotalCents: number
  shippingCents: number
  totalCents: number
  createdAt: Date
  shippingName: string
  shippingAddress1: string
  shippingAddress2: string
  shippingCity: string
  shippingRegion: string
  shippingPostal: string
  shippingCountry: string
}

async function loadItems(orderIds: number[]): Promise<Map<number, OrderItemPublic[]>> {
  const grouped = new Map<number, OrderItemPublic[]>()
  if (orderIds.length === 0) return grouped

  const rows = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      listingId: orderItems.listingId,
      title: orderItems.titleSnapshot,
      artist: orderItems.artistSnapshot,
      priceCents: orderItems.priceCents,
      quantity: orderItems.quantity,
      sellerId: orderItems.sellerId,
      sellerName: users.displayName,
      status: orderItems.status,
    })
    .from(orderItems)
    .innerJoin(users, eq(users.id, orderItems.sellerId))
    .where(inArray(orderItems.orderId, orderIds))

  for (const row of rows) {
    const list = grouped.get(row.orderId) ?? []
    list.push({
      id: row.id,
      listingId: row.listingId,
      title: row.title,
      artist: row.artist,
      priceCents: row.priceCents,
      quantity: row.quantity,
      sellerId: row.sellerId,
      sellerName: row.sellerName,
      status: row.status,
    })
    grouped.set(row.orderId, list)
  }
  return grouped
}

function toSummary(row: OrderRow, items: OrderItemPublic[]): OrderSummary {
  return {
    id: row.id,
    status: row.status,
    subtotalCents: row.subtotalCents,
    shippingCents: row.shippingCents,
    totalCents: row.totalCents,
    createdAt: row.createdAt.toISOString(),
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
  }
}

const orderRoutes: FastifyPluginAsync = async (app) => {
  app.post('/checkout', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    const parsed = checkoutSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Check your payment and shipping details.',
        details: parsed.error.flatten(),
      })
    }
    const input = parsed.data
    const buyerId = request.user.id

    const cartRows = await db
      .select({
        listingId: cartItems.listingId,
        quantity: cartItems.quantity,
        priceCents: listings.priceCents,
        stock: listings.stock,
        status: listings.status,
        sellerId: listings.sellerId,
        title: listings.title,
        artist: listings.artist,
      })
      .from(cartItems)
      .innerJoin(listings, eq(listings.id, cartItems.listingId))
      .where(eq(cartItems.userId, buyerId))

    if (cartRows.length === 0) {
      return reply.status(400).send({ error: 'empty_cart', message: 'Your cart is empty.' })
    }

    const unavailable = cartRows.filter(
      (row) => row.status !== 'active' || row.stock < row.quantity,
    )
    if (unavailable.length > 0) {
      return reply.status(409).send({
        error: 'unavailable',
        message: 'Some records are no longer available in that quantity.',
        details: unavailable.map((row) => ({ listingId: row.listingId, title: row.title })),
      })
    }

    const subtotalCents = cartRows.reduce((sum, row) => sum + row.priceCents * row.quantity, 0)
    const shippingCents = shippingFlatCents
    const totalCents = subtotalCents + shippingCents

    const cardNumber = input.cardNumber.replace(/[\s-]+/g, '')
    const cardLast4 = cardNumber.slice(-4)
    if (cardLast4 === '0002') {
      return reply.status(402).send({
        error: 'payment_declined',
        message: 'Card declined. This demo rejects any card ending in 0002.',
      })
    }

    const orderId = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(orders)
        .values({
          buyerId,
          status: 'paid',
          subtotalCents,
          shippingCents,
          totalCents,
          shippingName: input.shippingName,
          shippingAddress1: input.shippingAddress1,
          shippingAddress2: input.shippingAddress2 ?? '',
          shippingCity: input.shippingCity,
          shippingRegion: input.shippingRegion ?? '',
          shippingPostal: input.shippingPostal,
          shippingCountry: input.shippingCountry,
        })
        .returning({ id: orders.id })

      const order = inserted[0]
      if (!order) throw new Error('Failed to create order')

      await tx.insert(orderItems).values(
        cartRows.map((row) => ({
          orderId: order.id,
          listingId: row.listingId,
          sellerId: row.sellerId,
          titleSnapshot: row.title,
          artistSnapshot: row.artist,
          priceCents: row.priceCents,
          quantity: row.quantity,
        })),
      )

      await tx.insert(payments).values({
        orderId: order.id,
        provider: 'simulated',
        providerRef: `sim_${randomUUID()}`,
        status: 'succeeded',
        amountCents: totalCents,
        cardLast4,
      })

      for (const row of cartRows) {
        await tx
          .update(listings)
          .set({ stock: sql`${listings.stock} - ${row.quantity}`, updatedAt: new Date() })
          .where(eq(listings.id, row.listingId))
      }

      await tx.delete(cartItems).where(eq(cartItems.userId, buyerId))
      return order.id
    })

    return reply.status(201).send({ orderId })
  })

  app.get('/orders', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    const orderRows = await db
      .select()
      .from(orders)
      .where(eq(orders.buyerId, request.user.id))
      .orderBy(desc(orders.createdAt))

    const grouped = await loadItems(orderRows.map((row) => row.id))
    return { data: orderRows.map((row) => toSummary(row, grouped.get(row.id) ?? [])) }
  })

  app.get('/orders/:id', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    const orderId = Number((request.params as { id?: string }).id)
    if (!Number.isInteger(orderId) || orderId <= 0) {
      return reply.status(404).send({ error: 'not_found', message: 'No such order.' })
    }

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
    const order = orderRows[0]
    if (!order) {
      return reply.status(404).send({ error: 'not_found', message: 'No such order.' })
    }

    const grouped = await loadItems([orderId])
    const items = grouped.get(orderId) ?? []
    const isBuyer = order.buyerId === request.user.id
    const isSeller = items.some((item) => item.sellerId === request.user?.id)
    if (!isBuyer && !isSeller && request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'forbidden', message: 'Not your order.' })
    }

    const paymentRows = await db
      .select({
        provider: payments.provider,
        status: payments.status,
        amountCents: payments.amountCents,
        cardLast4: payments.cardLast4,
        failureReason: payments.failureReason,
      })
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(desc(payments.createdAt))
      .limit(1)

    const detail: OrderDetail = {
      ...toSummary(order, items),
      shippingName: order.shippingName,
      shippingAddress1: order.shippingAddress1,
      shippingAddress2: order.shippingAddress2,
      shippingCity: order.shippingCity,
      shippingRegion: order.shippingRegion,
      shippingPostal: order.shippingPostal,
      shippingCountry: order.shippingCountry,
      payment: paymentRows[0] ?? null,
    }

    return { order: detail }
  })
}

export default orderRoutes
