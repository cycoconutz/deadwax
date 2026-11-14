import type { FastifyPluginAsync } from 'fastify'
import { desc, eq, inArray } from 'drizzle-orm'
import {
  checkoutSchema,
  checkoutShippingSchema,
  type CheckoutInput,
  type OrderDetail,
  type OrderItemPublic,
  type OrderSummary,
} from '@deadwax/shared'
import { env } from '../env'
import { db } from '../db/index'
import { orderItems, orders, payments, reviews, users } from '../db/schema'
import { createPendingOrder } from '../lib/checkout'
import { confirmPayment } from '../lib/payment'
import { createPaymentIntentForOrder } from '../lib/stripe'
import { validTraceId, withSpan } from '../lib/tracing'

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
      reviewedId: reviews.id,
    })
    .from(orderItems)
    .innerJoin(users, eq(users.id, orderItems.sellerId))
    .leftJoin(reviews, eq(reviews.orderItemId, orderItems.id))
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
      reviewed: row.reviewedId !== null,
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
    const buyerId = request.user.id
    const mode = env.PAYMENTS_MODE
    const parsed =
      mode === 'stripe'
        ? checkoutShippingSchema.safeParse(request.body)
        : checkoutSchema.safeParse(request.body)

    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Check your payment and shipping details.',
        details: parsed.error.flatten(),
      })
    }

    if (mode === 'simulated') {
      const cardNumber = (parsed.data as CheckoutInput).cardNumber.replace(/[\s-]+/g, '')
      if (cardNumber.slice(-4) === '0002') {
        return reply.status(402).send({
          error: 'payment_declined',
          message: 'Card declined. This demo rejects any card ending in 0002.',
        })
      }
    }

    // One span covers the whole request: order creation, the stock claim and
    // whichever confirmation path this deployment uses. Every outcome returns
    // through it, so a failed checkout is traceable too.
    let traceId = ''
    const result = await withSpan(
      'checkout',
      { 'payment.mode': mode, 'buyer.id': buyerId },
      async (span) => {
        traceId = span.spanContext().traceId

        const created = await createPendingOrder(buyerId, parsed.data, mode)

        if (!created.ok) {
          if (created.reason === 'empty_cart') {
            return {
              status: 400,
              body: { error: 'empty_cart', message: 'Your cart is empty.' },
            }
          }
          return {
            status: 409,
            body: {
              error: 'unavailable',
              message: 'Some records are no longer available in that quantity.',
              details: created.items,
            },
          }
        }

        span.setAttribute('order.id', created.orderId)

        if (mode === 'stripe') {
          try {
            const intent = await createPaymentIntentForOrder(created.orderId, created.totalCents)
            return {
              status: 201,
              body: { orderId: created.orderId, clientSecret: intent.clientSecret },
            }
          } catch {
            // The order stays pending and the sweeper releases its stock.
            request.log.error({ orderId: created.orderId }, 'could not create a payment intent')
            return {
              status: 502,
              body: {
                error: 'payment_unavailable',
                message: 'The payment provider is unavailable. Nothing was charged.',
              },
            }
          }
        }

        // Simulated payments clear immediately. With Stripe the webhook
        // confirms later, through the same function, so the state machine is
        // identical.
        const confirmed = await confirmPayment(created.orderId)
        if (confirmed !== 'confirmed') {
          request.log.warn(
            { orderId: created.orderId, outcome: confirmed },
            'checkout order was not confirmed',
          )
        }
        span.setAttribute('payment.outcome', confirmed)

        return { status: 201, body: { orderId: created.orderId } }
      },
    )

    const headerTraceId = validTraceId(traceId)
    if (headerTraceId) reply.header('x-trace-id', headerTraceId)
    return reply.status(result.status).send(result.body)
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
