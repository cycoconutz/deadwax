import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../src/db'
import { listings, orders, payments } from '../src/db/schema'
import { authHeaders, createListing, createUser, makeApp, resetDb } from './helpers'

const CHECKOUT_PAYLOAD = {
  shippingName: 'Ada Lovelace',
  shippingAddress1: '12 Marylebone Road',
  shippingCity: 'London',
  shippingPostal: 'NW1 5LA',
  shippingCountry: 'GB',
  cardNumber: '4242 4242 4242 4242',
  cardExpiry: '12/30',
  cardCvc: '123',
  nameOnCard: 'Ada Lovelace',
}

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

describe('POST /api/checkout', () => {
  it('sells a single copy to a single buyer', async () => {
    const seller = await createUser('seller@example.com', { role: 'seller' })
    const buyer = await createUser('buyer@example.com')
    const listing = await createListing(seller.id, { stock: 1, priceCents: 2499 })

    const cart = await app.inject({
      method: 'POST',
      url: '/api/cart',
      headers: authHeaders(buyer),
      payload: { listingId: listing.id, quantity: 1 },
    })
    expect(cart.statusCode).toBe(200)

    const response = await app.inject({
      method: 'POST',
      url: '/api/checkout',
      headers: authHeaders(buyer),
      payload: CHECKOUT_PAYLOAD,
    })

    expect(response.statusCode).toBe(201)

    const [remaining] = await db
      .select({ stock: listings.stock })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(remaining?.stock).toBe(0)
  })

  it('sells the last copy exactly once when twenty buyers race for it', async () => {
    const seller = await createUser('seller@example.com', { role: 'seller' })
    const listing = await createListing(seller.id, { stock: 1, priceCents: 2499 })

    const buyers = await Promise.all(
      Array.from({ length: 20 }, (_, index) => createUser(`buyer${index}@example.com`)),
    )

    for (const buyer of buyers) {
      const cart = await app.inject({
        method: 'POST',
        url: '/api/cart',
        headers: authHeaders(buyer),
        payload: { listingId: listing.id, quantity: 1 },
      })
      expect(cart.statusCode).toBe(200)
    }

    const responses = await Promise.all(
      buyers.map((buyer) =>
        app.inject({
          method: 'POST',
          url: '/api/checkout',
          headers: authHeaders(buyer),
          payload: CHECKOUT_PAYLOAD,
        }),
      ),
    )

    const created = responses.filter((response) => response.statusCode === 201)
    const rejected = responses.filter((response) => response.statusCode === 409)

    expect(created).toHaveLength(1)
    expect(rejected).toHaveLength(19)

    const [remaining] = await db
      .select({ stock: listings.stock })
      .from(listings)
      .where(eq(listings.id, listing.id))
    expect(remaining?.stock).toBe(0)

    const orderRows = await db.select({ id: orders.id }).from(orders)
    expect(orderRows).toHaveLength(1)

    const paymentRows = await db.select({ id: payments.id }).from(payments)
    expect(paymentRows).toHaveLength(1)
  })
})
