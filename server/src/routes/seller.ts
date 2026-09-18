import type { FastifyPluginAsync } from 'fastify'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  ORDER_STATUSES,
  type OrderStatus,
  type SellerOrder,
  type SellerSummary,
} from '@deadwax/shared'
import { db } from '../db/index'
import { listings, orderItems, orders, users } from '../db/schema'

const statusSchema = z.object({ status: z.enum(ORDER_STATUSES) })

function reduceOrderStatus(statuses: OrderStatus[]): OrderStatus {
  const active = statuses.filter((status) => status !== 'cancelled')
  if (statuses.length > 0 && active.length === 0) return 'cancelled'
  if (active.length === 0) return 'pending'
  if (active.every((status) => status === 'delivered')) return 'delivered'
  if (active.some((status) => status === 'shipped' || status === 'delivered')) return 'shipped'
  if (active.some((status) => status === 'paid')) return 'paid'
  return 'pending'
}

const sellerRoutes: FastifyPluginAsync = async (app) => {
  app.get('/seller/summary', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    if (request.user.role === 'buyer') {
      return reply.status(403).send({ error: 'forbidden', message: 'Seller account required.' })
    }
    const sellerId = request.user.id

    const listingCounts = await db
      .select({ status: listings.status, value: sql<number>`count(*)::int` })
      .from(listings)
      .where(eq(listings.sellerId, sellerId))
      .groupBy(listings.status)

    const salesRows = await db
      .select({
        units: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::int`,
        gross: sql<number>`coalesce(sum(${orderItems.priceCents} * ${orderItems.quantity}), 0)::int`,
      })
      .from(orderItems)
      .where(eq(orderItems.sellerId, sellerId))

    const toShipRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(orderItems)
      .where(and(eq(orderItems.sellerId, sellerId), eq(orderItems.status, 'paid')))

    const summary: SellerSummary = {
      activeListings: listingCounts.find((row) => row.status === 'active')?.value ?? 0,
      archivedListings: listingCounts.find((row) => row.status === 'archived')?.value ?? 0,
      unitsSold: salesRows[0]?.units ?? 0,
      grossSalesCents: salesRows[0]?.gross ?? 0,
      ordersToShip: toShipRows[0]?.value ?? 0,
    }
    return summary
  })

  app.get('/seller/orders', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    if (request.user.role === 'buyer') {
      return reply.status(403).send({ error: 'forbidden', message: 'Seller account required.' })
    }
    const sellerId = request.user.id

    const rows = await db
      .select({
        itemId: orderItems.id,
        listingId: orderItems.listingId,
        title: orderItems.titleSnapshot,
        artist: orderItems.artistSnapshot,
        priceCents: orderItems.priceCents,
        quantity: orderItems.quantity,
        itemStatus: orderItems.status,
        orderId: orders.id,
        orderStatus: orders.status,
        buyerName: users.displayName,
        createdAt: orders.createdAt,
        shippingName: orders.shippingName,
        shippingCity: orders.shippingCity,
        shippingRegion: orders.shippingRegion,
        shippingCountry: orders.shippingCountry,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(users, eq(users.id, orders.buyerId))
      .where(eq(orderItems.sellerId, sellerId))
      .orderBy(desc(orders.createdAt), desc(orderItems.id))

    const grouped = new Map<number, SellerOrder>()
    for (const row of rows) {
      let order = grouped.get(row.orderId)
      if (!order) {
        order = {
          id: row.orderId,
          orderStatus: row.orderStatus,
          buyerName: row.buyerName,
          createdAt: row.createdAt.toISOString(),
          shippingName: row.shippingName,
          shippingCity: row.shippingCity,
          shippingRegion: row.shippingRegion,
          shippingCountry: row.shippingCountry,
          sellerTotalCents: 0,
          items: [],
        }
        grouped.set(row.orderId, order)
      }
      order.items.push({
        id: row.itemId,
        listingId: row.listingId,
        title: row.title,
        artist: row.artist,
        priceCents: row.priceCents,
        quantity: row.quantity,
        status: row.itemStatus,
      })
      order.sellerTotalCents += row.priceCents * row.quantity
    }

    return { data: [...grouped.values()] }
  })

  app.patch('/seller/orders/items/:itemId', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    if (request.user.role === 'buyer') {
      return reply.status(403).send({ error: 'forbidden', message: 'Seller account required.' })
    }
    const itemId = Number((request.params as { itemId?: string }).itemId)
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return reply.status(404).send({ error: 'not_found', message: 'No such order item.' })
    }
    const parsed = statusSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Invalid status.',
        details: parsed.error.flatten(),
      })
    }

    const itemRows = await db
      .select({ sellerId: orderItems.sellerId, orderId: orderItems.orderId })
      .from(orderItems)
      .where(eq(orderItems.id, itemId))
      .limit(1)
    const item = itemRows[0]
    if (!item) {
      return reply.status(404).send({ error: 'not_found', message: 'No such order item.' })
    }
    if (item.sellerId !== request.user.id && request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'forbidden', message: 'Not your sale.' })
    }

    await db.update(orderItems).set({ status: parsed.data.status }).where(eq(orderItems.id, itemId))

    const siblingRows = await db
      .select({ status: orderItems.status })
      .from(orderItems)
      .where(eq(orderItems.orderId, item.orderId))
    const orderStatus = reduceOrderStatus(siblingRows.map((row) => row.status))

    await db
      .update(orders)
      .set({ status: orderStatus, updatedAt: new Date() })
      .where(eq(orders.id, item.orderId))

    return { ok: true, status: parsed.data.status, orderStatus }
  })
}

export default sellerRoutes
