import type { FastifyPluginAsync } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { reviewSchema, type ReviewableItem } from '@deadwax/shared'
import { db } from '../db/index'
import { orderItems, orders, reviews } from '../db/schema'

const reviewRoutes: FastifyPluginAsync = async (app) => {
  app.get('/reviews/eligible', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }

    const rows = await db
      .select({
        orderItemId: orderItems.id,
        orderId: orderItems.orderId,
        listingId: orderItems.listingId,
        title: orderItems.titleSnapshot,
        artist: orderItems.artistSnapshot,
        status: orderItems.status,
        reviewedId: reviews.id,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .leftJoin(reviews, eq(reviews.orderItemId, orderItems.id))
      .where(and(eq(orders.buyerId, request.user.id), eq(orderItems.status, 'delivered')))

    const data: ReviewableItem[] = rows
      .filter((row) => row.reviewedId === null && row.listingId !== null)
      .map((row) => ({
        orderItemId: row.orderItemId,
        orderId: row.orderId,
        listingId: row.listingId as number,
        title: row.title,
        artist: row.artist,
        status: row.status,
      }))

    return { data }
  })

  app.post('/reviews', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }

    const parsed = reviewSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Choose a rating from 1 to 5.',
        details: parsed.error.flatten(),
      })
    }

    const input = parsed.data
    const rows = await db
      .select({
        id: orderItems.id,
        buyerId: orders.buyerId,
        listingId: orderItems.listingId,
        status: orderItems.status,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(eq(orderItems.id, input.orderItemId))
      .limit(1)

    const item = rows[0]
    if (!item) {
      return reply.status(404).send({ error: 'not_found', message: 'No such order item.' })
    }
    if (item.buyerId !== request.user.id) {
      return reply
        .status(403)
        .send({ error: 'forbidden', message: 'You did not buy this record.' })
    }
    if (item.status !== 'delivered') {
      return reply.status(409).send({
        error: 'not_delivered',
        message: 'You can review a record once it has been delivered.',
      })
    }
    if (item.listingId === null) {
      return reply
        .status(409)
        .send({ error: 'listing_gone', message: 'This record is no longer listed.' })
    }

    const existing = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.orderItemId, input.orderItemId))
      .limit(1)
    if (existing[0]) {
      return reply
        .status(409)
        .send({ error: 'already_reviewed', message: 'You already reviewed this record.' })
    }

    const inserted = await db
      .insert(reviews)
      .values({
        orderItemId: input.orderItemId,
        listingId: item.listingId,
        buyerId: request.user.id,
        rating: input.rating,
        body: input.body ?? '',
      })
      .returning({ id: reviews.id })

    const created = inserted[0]
    if (!created) {
      return reply.status(500).send({ error: 'internal_error', message: 'Could not save review.' })
    }
    return reply.status(201).send({ id: created.id })
  })

  app.delete('/reviews/:id', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    const id = Number((request.params as { id?: string }).id)
    if (!Number.isInteger(id) || id <= 0) {
      return reply.status(404).send({ error: 'not_found', message: 'No such review.' })
    }

    const rows = await db
      .select({ buyerId: reviews.buyerId })
      .from(reviews)
      .where(eq(reviews.id, id))
      .limit(1)
    const review = rows[0]
    if (!review) {
      return reply.status(404).send({ error: 'not_found', message: 'No such review.' })
    }
    if (review.buyerId !== request.user.id && request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'forbidden', message: 'Not your review.' })
    }

    await db.delete(reviews).where(eq(reviews.id, id))
    return reply.status(204).send()
  })
}

export default reviewRoutes
