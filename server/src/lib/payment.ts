import { and, desc, eq, lt, sql } from 'drizzle-orm'
import { db } from '../db'
import { listings, orderItems, orders, payments } from '../db/schema'

/**
 * How long a buyer has to finish paying before the reservation is released.
 * Long enough to type a card, short enough that an abandoned cart does not
 * hide a record from the next buyer.
 */
export const PAYMENT_TTL_MS = 30 * 60 * 1000

export type ConfirmOutcome = 'confirmed' | 'already_paid' | 'cancelled' | 'not_found'

export interface ConfirmPaymentInput {
  providerRef?: string
  cardLast4?: string
}

/** A handle inside an open transaction, so callers can compose work with it. */
export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The only path from pending to paid. Payment row, order and line items move
 * in one transaction, so a half-paid order cannot exist. Calling it twice is
 * safe and reports `already_paid`.
 *
 * Takes a transaction so a webhook can record the event that caused the change
 * in the same commit. Either both land or neither does.
 */
export async function confirmPaymentInTx(
  tx: Transaction,
  orderId: number,
  input: ConfirmPaymentInput = {},
): Promise<ConfirmOutcome> {
  const now = new Date()

  const orderRows = await tx
    .select({ id: orders.id, status: orders.status })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for('update')

  const order = orderRows[0]
  if (!order) return 'not_found'
  if (order.status === 'cancelled') return 'cancelled'
  if (order.status !== 'pending') return 'already_paid'

  const paymentRows = await tx
    .select({
      id: payments.id,
      providerRef: payments.providerRef,
      cardLast4: payments.cardLast4,
    })
    .from(payments)
    .where(eq(payments.orderId, orderId))
    .orderBy(desc(payments.createdAt))
    .limit(1)

  const payment = paymentRows[0]
  if (!payment) {
    throw new Error(`Order ${orderId} has no payment record to confirm`)
  }

  await tx
    .update(payments)
    .set({
      status: 'succeeded',
      providerRef: input.providerRef ?? payment.providerRef,
      cardLast4: input.cardLast4 ?? payment.cardLast4,
      failureReason: null,
      updatedAt: now,
    })
    .where(eq(payments.id, payment.id))

  await tx
    .update(orders)
    .set({ status: 'paid', paidAt: now, updatedAt: now })
    .where(eq(orders.id, orderId))

  await tx.update(orderItems).set({ status: 'paid' }).where(eq(orderItems.orderId, orderId))

  return 'confirmed'
}

export async function confirmPayment(
  orderId: number,
  input: ConfirmPaymentInput = {},
): Promise<ConfirmOutcome> {
  return db.transaction((tx) => confirmPaymentInTx(tx, orderId, input))
}

/**
 * Cancels orders that were created but never paid, and puts their stock back.
 * Runs on a timer and once at boot, because a sleeping host is exactly when
 * buyers abandon checkouts.
 */
export async function expireStaleOrders(
  now: Date = new Date(),
  ttlMs: number = PAYMENT_TTL_MS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - ttlMs)

  return db.transaction(async (tx) => {
    const stale = await tx
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, 'pending'), lt(orders.createdAt, cutoff)))
      .for('update', { skipLocked: true })

    for (const order of stale) {
      const items = await tx
        .select({ listingId: orderItems.listingId, quantity: orderItems.quantity })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id))

      for (const item of items) {
        if (item.listingId === null) continue
        await tx
          .update(listings)
          .set({ stock: sql`${listings.stock} + ${item.quantity}`, updatedAt: now })
          .where(eq(listings.id, item.listingId))
      }

      await tx
        .update(orderItems)
        .set({ status: 'cancelled' })
        .where(eq(orderItems.orderId, order.id))

      await tx
        .update(payments)
        .set({
          status: 'failed',
          failureReason: 'Payment was not completed before the reservation expired',
          updatedAt: now,
        })
        .where(eq(payments.orderId, order.id))

      await tx
        .update(orders)
        .set({ status: 'cancelled', stockReservedAt: null, updatedAt: now })
        .where(eq(orders.id, order.id))
    }

    return stale.length
  })
}
