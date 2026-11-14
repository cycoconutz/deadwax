import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { asc } from 'drizzle-orm'
import { db } from '../src/db'
import { mailOutbox, outbox } from '../src/db/schema'
import { createPendingOrder } from '../src/lib/checkout'
import { drainOutbox, MAX_ATTEMPTS } from '../src/lib/outbox'
import { confirmPayment, expireStaleOrders, PAYMENT_TTL_MS } from '../src/lib/payment'
import {
  addToCart,
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

async function paidOrder(email = 'buyer@example.com'): Promise<{ orderId: number }> {
  const seller = await createUser(`seller.${email}`, { role: 'seller' })
  const buyer = await createUser(email)
  const listing = await createListing(seller.id, { stock: 2, priceCents: 2499 })
  await addToCart(buyer.id, listing.id)

  const created = await createPendingOrder(buyer.id, CHECKOUT_PAYLOAD, 'simulated')
  if (!created.ok) throw new Error(`could not create order: ${created.reason}`)

  await confirmPayment(created.orderId)
  return { orderId: created.orderId }
}

async function jobs() {
  return db.select().from(outbox).orderBy(asc(outbox.id))
}

describe('transactional outbox', () => {
  it('queues a receipt and a seller notice with the payment', async () => {
    const { orderId } = await paidOrder()

    const rows = await jobs()
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => row.kind).sort()).toEqual(['buyer.receipt', 'seller.notice'])
    expect(rows.every((row) => row.sentAt === null)).toBe(true)
    expect(rows.every((row) => row.attempts === 0)).toBe(true)

    const receipt = rows.find((row) => row.kind === 'buyer.receipt')
    expect(receipt).toBeDefined()
    if (!receipt) return

    const payload = receipt.payload as { orderId: number; recipient: string }
    expect(payload.orderId).toBe(orderId)
    expect(payload.recipient).toBe('buyer@example.com')
  })

  it('delivers the messages and records what was sent', async () => {
    await paidOrder()

    const result = await drainOutbox()
    expect(result).toEqual({ sent: 2, failed: 0, dead: 0 })

    const sent = await db.select().from(mailOutbox)
    expect(sent).toHaveLength(2)
    expect(sent.map((mail) => mail.subject).sort()).toEqual(
      expect.arrayContaining([
        expect.stringContaining('receipt'),
        expect.stringContaining('You sold'),
      ]),
    )

    const rows = await jobs()
    expect(rows.every((row) => row.sentAt !== null)).toBe(true)
    expect(rows.every((row) => row.attempts === 1)).toBe(true)
  })

  it('does not deliver the same message twice', async () => {
    await paidOrder()

    expect((await drainOutbox()).sent).toBe(2)
    expect((await drainOutbox()).sent).toBe(0)

    expect(await db.select().from(mailOutbox)).toHaveLength(2)
  })

  it('backs off and dead-letters a message that keeps failing', async () => {
    await paidOrder()

    const start = new Date(Date.now() + 60_000)
    const sender = async (): Promise<void> => {
      throw new Error('smtp down')
    }

    const attempts = [
      start,
      new Date(start.getTime() + 6_000),
      new Date(start.getTime() + 17_000),
      new Date(start.getTime() + 38_000),
      new Date(start.getTime() + 80_000),
    ]

    for (const now of attempts) {
      await drainOutbox({ sender, now })
    }

    const rows = await jobs()
    expect(rows.every((row) => row.attempts === MAX_ATTEMPTS)).toBe(true)
    expect(rows.every((row) => row.deadLetteredAt !== null)).toBe(true)
    expect(rows.every((row) => row.lastError === 'smtp down')).toBe(true)
    expect(await db.select().from(mailOutbox)).toHaveLength(0)

    // A dead job is never picked up again.
    const later = new Date(start.getTime() + 10 * 60_000)
    expect(await drainOutbox({ sender, now: later })).toEqual({ sent: 0, failed: 0, dead: 0 })
  })

  it('queues nothing for an order that is never paid', async () => {
    const seller = await createUser('seller@example.com', { role: 'seller' })
    const buyer = await createUser('unpaid@example.com')
    const listing = await createListing(seller.id, { stock: 1 })
    await addToCart(buyer.id, listing.id)

    const created = await createPendingOrder(buyer.id, CHECKOUT_PAYLOAD, 'simulated')
    expect(created.ok).toBe(true)

    expect(await jobs()).toHaveLength(0)

    await expireStaleOrders(new Date(Date.now() + PAYMENT_TTL_MS + 60_000))
    expect(await jobs()).toHaveLength(0)
  })
})
