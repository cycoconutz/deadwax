import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { env } from '../src/env'
import { db } from '../src/db'
import { orders, payments, webhookEvents } from '../src/db/schema'
import { createPendingOrder } from '../src/lib/checkout'
import { getStripe } from '../src/lib/stripe'
import {
  addToCart,
  CHECKOUT_PAYLOAD,
  createListing,
  createUser,
  makeApp,
  resetDb,
} from './helpers'

let app: FastifyInstance
let secret: string

beforeAll(async () => {
  app = await makeApp()
  secret = env.PAYMENT_WEBHOOK_SECRET
})

afterAll(async () => {
  await app.close()
})

beforeEach(async () => {
  await resetDb()
})

function paymentIntentEvent(orderId: number, eventId: string) {
  return {
    id: eventId,
    object: 'event',
    api_version: '2026-01-01',
    created: Math.floor(Date.now() / 1000),
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: `pi_${eventId}`,
        object: 'payment_intent',
        metadata: { orderId: String(orderId) },
      },
    },
  }
}

function signedBody(event: unknown, signingSecret = secret): { payload: string; header: string } {
  const payload = JSON.stringify(event)
  const header = getStripe().webhooks.generateTestHeaderString({
    payload,
    secret: signingSecret,
  })
  return { payload, header }
}

async function postWebhook(payload: string, header: string) {
  return app.inject({
    method: 'POST',
    url: '/api/webhooks/stripe',
    payload,
    headers: { 'content-type': 'application/json', 'stripe-signature': header },
  })
}

async function pendingOrderFor(email: string): Promise<number> {
  const seller = await createUser(`seller.${email}`, { role: 'seller' })
  const buyer = await createUser(email)
  const listing = await createListing(seller.id, { stock: 1, priceCents: 2499 })
  await addToCart(buyer.id, listing.id)

  const created = await createPendingOrder(buyer.id, CHECKOUT_PAYLOAD, 'simulated')
  if (!created.ok) throw new Error(`could not create order: ${created.reason}`)
  return created.orderId
}

async function orderById(orderId: number) {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1)
  const row = rows[0]
  if (!row) throw new Error(`order ${orderId} not found`)
  return row
}

describe('GET /api/payments/config', () => {
  it('tells the client which payment mode this deployment uses', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/payments/config' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ mode: 'simulated' })
  })
})

describe('POST /api/webhooks/stripe', () => {
  it('confirms the order behind a successful payment intent', async () => {
    const orderId = await pendingOrderFor('webhook@example.com')
    const event = paymentIntentEvent(orderId, 'evt_confirm_1')
    const { payload, header } = signedBody(event)

    const response = await postWebhook(payload, header)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ received: true, duplicate: false, outcome: 'confirmed' })

    const order = await orderById(orderId)
    expect(order.status).toBe('paid')
    expect(order.paidAt).not.toBeNull()

    const paymentRows = await db.select().from(payments).where(eq(payments.orderId, orderId))
    expect(paymentRows).toHaveLength(1)
    expect(paymentRows[0]?.status).toBe('succeeded')
    expect(paymentRows[0]?.providerRef).toBe('pi_evt_confirm_1')

    const eventRows = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.providerEventId, 'evt_confirm_1'))
    expect(eventRows).toHaveLength(1)
    expect(eventRows[0]?.outcome).toBe('confirmed')
    expect(eventRows[0]?.processedAt).not.toBeNull()
  })

  it('processes a replayed event once and answers every retry', async () => {
    const orderId = await pendingOrderFor('replay@example.com')
    const { payload, header } = signedBody(paymentIntentEvent(orderId, 'evt_replay_1'))

    const responses = []
    for (let i = 0; i < 5; i++) {
      responses.push(await postWebhook(payload, header))
    }

    for (const response of responses) {
      expect(response.statusCode).toBe(200)
      expect(response.json().received).toBe(true)
    }

    expect(responses[0]?.json().duplicate).toBe(false)
    for (const response of responses.slice(1)) {
      expect(response.json().duplicate).toBe(true)
    }

    const eventRows = await db
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.providerEventId, 'evt_replay_1'))
    expect(eventRows).toHaveLength(1)

    const paymentRows = await db.select().from(payments).where(eq(payments.orderId, orderId))
    expect(paymentRows).toHaveLength(1)

    const order = await orderById(orderId)
    expect(order.status).toBe('paid')

    console.log(
      `\n  idempotency: ${responses.length} deliveries -> ` +
        `1 processed, ${responses.length - 1} duplicates, ` +
        `${eventRows.length} event row, ${paymentRows.length} payment\n`,
    )
  })

  it('rejects a payload whose signature does not match, and writes nothing', async () => {
    const orderId = await pendingOrderFor('forged@example.com')
    const { payload, header } = signedBody(
      paymentIntentEvent(orderId, 'evt_forged_1'),
      'whsec_not_the_right_secret',
    )

    const response = await postWebhook(payload, header)

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'invalid_signature' })

    const eventRows = await db.select().from(webhookEvents)
    expect(eventRows).toHaveLength(0)

    const order = await orderById(orderId)
    expect(order.status).toBe('pending')
  })

  it('records an event it does not act on', async () => {
    const event = {
      id: 'evt_refund_1',
      object: 'event',
      type: 'charge.refunded',
      data: { object: { id: 'ch_1', object: 'charge' } },
    }
    const { payload, header } = signedBody(event)

    const response = await postWebhook(payload, header)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ duplicate: false, outcome: 'ignored' })

    const eventRows = await db.select().from(webhookEvents)
    expect(eventRows).toHaveLength(1)
    expect(eventRows[0]?.outcome).toBe('ignored')
  })

  it('records a payment it cannot attach to an order instead of guessing', async () => {
    const event = {
      id: 'evt_orphan_1',
      object: 'event',
      type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_orphan', object: 'payment_intent', metadata: {} } },
    }
    const { payload, header } = signedBody(event)

    const response = await postWebhook(payload, header)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ duplicate: false, outcome: 'no_order' })
  })
})
