import type { FastifyPluginAsync } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  cartItemSchema,
  shippingFlatCents,
  type CartLine,
  type CartResponse,
} from '@deadwax/shared'
import { db } from '../db/index'
import { cartItems, listings } from '../db/schema'

const quantitySchema = z.object({
  quantity: z.coerce.number().int().min(1).max(99),
})

async function loadCart(userId: number): Promise<CartResponse> {
  const rows = await db
    .select({
      listingId: cartItems.listingId,
      quantity: cartItems.quantity,
      title: listings.title,
      artist: listings.artist,
      coverImageUrl: listings.coverImageUrl,
      priceCents: listings.priceCents,
      stock: listings.stock,
      sellerId: listings.sellerId,
      status: listings.status,
    })
    .from(cartItems)
    .innerJoin(listings, eq(listings.id, cartItems.listingId))
    .where(eq(cartItems.userId, userId))
    .orderBy(cartItems.createdAt)

  const lines: CartLine[] = rows.map((row) => ({
    ...row,
    lineTotalCents: row.priceCents * row.quantity,
  }))
  const subtotalCents = lines.reduce((sum, line) => sum + line.lineTotalCents, 0)
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0)
  const shippingCents = lines.length > 0 ? shippingFlatCents : 0

  return {
    lines,
    subtotalCents,
    shippingCents,
    totalCents: subtotalCents + shippingCents,
    itemCount,
  }
}

const cartRoutes: FastifyPluginAsync = async (app) => {
  app.get('/cart', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    return loadCart(request.user.id)
  })

  app.post('/cart', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    const parsed = cartItemSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Invalid cart item.',
        details: parsed.error.flatten(),
      })
    }

    const { listingId, quantity } = parsed.data
    const listingRows = await db
      .select({ stock: listings.stock, status: listings.status })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)
    const listing = listingRows[0]
    if (!listing || listing.status !== 'active') {
      return reply
        .status(404)
        .send({ error: 'not_found', message: 'That record is not available.' })
    }
    if (listing.stock < 1) {
      return reply.status(409).send({ error: 'sold_out', message: 'That record just sold out.' })
    }

    const existingRows = await db
      .select({ quantity: cartItems.quantity })
      .from(cartItems)
      .where(and(eq(cartItems.userId, request.user.id), eq(cartItems.listingId, listingId)))
      .limit(1)
    const existing = existingRows[0]
    const desired = Math.min(listing.stock, (existing?.quantity ?? 0) + quantity)

    if (existing) {
      await db
        .update(cartItems)
        .set({ quantity: desired })
        .where(and(eq(cartItems.userId, request.user.id), eq(cartItems.listingId, listingId)))
    } else {
      await db.insert(cartItems).values({
        userId: request.user.id,
        listingId,
        quantity: desired,
      })
    }

    return loadCart(request.user.id)
  })

  app.patch('/cart/:listingId', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    const listingId = Number((request.params as { listingId?: string }).listingId)
    if (!Number.isInteger(listingId) || listingId <= 0) {
      return reply.status(404).send({ error: 'not_found', message: 'No such cart item.' })
    }
    const parsed = quantitySchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Invalid quantity.',
        details: parsed.error.flatten(),
      })
    }

    const listingRows = await db
      .select({ stock: listings.stock })
      .from(listings)
      .where(eq(listings.id, listingId))
      .limit(1)
    const stock = listingRows[0]?.stock ?? 0
    const quantity = Math.max(1, Math.min(stock, parsed.data.quantity))

    await db
      .update(cartItems)
      .set({ quantity })
      .where(and(eq(cartItems.userId, request.user.id), eq(cartItems.listingId, listingId)))

    return loadCart(request.user.id)
  })

  app.delete('/cart/:listingId', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    const listingId = Number((request.params as { listingId?: string }).listingId)
    if (!Number.isInteger(listingId) || listingId <= 0) {
      return reply.status(404).send({ error: 'not_found', message: 'No such cart item.' })
    }
    await db
      .delete(cartItems)
      .where(and(eq(cartItems.userId, request.user.id), eq(cartItems.listingId, listingId)))
    return loadCart(request.user.id)
  })

  app.delete('/cart', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    await db.delete(cartItems).where(eq(cartItems.userId, request.user.id))
    return reply.status(204).send()
  })
}

export default cartRoutes
