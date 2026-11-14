import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { withSpan, withTraceContext } from '../src/lib/tracing'
import { spanExporter } from './otel'
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
  spanExporter.reset()
})

describe('tracing', () => {
  it('spans the checkout, the stock claim and the confirmation', async () => {
    const seller = await createUser('seller@example.com', { role: 'seller' })
    const buyer = await createUser('buyer@example.com')
    const listing = await createListing(seller.id, { stock: 1, priceCents: 2499 })
    await addToCart(buyer.id, listing.id)

    const response = await app.inject({
      method: 'POST',
      url: '/api/checkout',
      headers: authHeaders(buyer),
      payload: CHECKOUT_PAYLOAD,
    })

    expect(response.statusCode).toBe(201)

    const spans = spanExporter.getFinishedSpans()
    const byName = new Map(spans.map((span) => [span.name, span]))

    expect(byName.has('checkout')).toBe(true)
    expect(byName.has('stock.claim')).toBe(true)
    expect(byName.has('payment.confirm')).toBe(true)

    const root = byName.get('checkout')
    const stock = byName.get('stock.claim')
    const confirm = byName.get('payment.confirm')
    if (!root || !stock || !confirm) return

    // The response carries the trace the work belongs to.
    expect(response.headers['x-trace-id']).toBe(root.spanContext().traceId)

    // The stock claim and the confirmation belong to the same trace.
    expect(stock.parentSpanContext?.spanId).toBe(root.spanContext().spanId)
    expect(confirm.parentSpanContext?.spanId).toBe(root.spanContext().spanId)

    expect(root.attributes['payment.mode']).toBe('simulated')
    expect(root.attributes['order.id']).toBe(1)
    expect(stock.attributes['stock.items']).toBe(1)
    expect(confirm.attributes['payment.outcome']).toBe('confirmed')
  })

  it('stamps log lines with the active trace and leaves the rest alone', async () => {
    await withSpan('log.scope', {}, async () => {
      const line = withTraceContext({ msg: 'inside a span' })
      expect(line.traceId).toMatch(/^[0-9a-f]{32}$/)
      expect(line.spanId).toMatch(/^[0-9a-f]{16}$/)
    })

    const outside = withTraceContext({ msg: 'no span' })
    expect(outside.traceId).toBeUndefined()
    expect(outside.msg).toBe('no span')
  })
})
