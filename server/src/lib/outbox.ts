import { and, asc, eq, isNull, lte } from 'drizzle-orm'
import { formatPrice } from '@deadwax/shared'
import { db } from '../db'
import { mailOutbox, orderItems, orders, outbox, users } from '../db/schema'
import type { Transaction } from './payment'
import { withSpan } from './tracing'

export const MAX_ATTEMPTS = 5
const BACKOFF_BASE_MS = 5_000

export interface OutboxMessage {
  recipient: string
  subject: string
  body: string
}

export interface OutboxPayload extends OutboxMessage {
  orderId: number
}

/**
 * Writes the messages a paid order should produce, inside the transaction that
 * marks it paid. Either the order is paid and the messages are queued, or
 * neither happened. A worker delivers them afterwards.
 */
export async function enqueueOrderMessages(tx: Transaction, orderId: number): Promise<void> {
  const orderRows = await tx
    .select({ buyerId: orders.buyerId, totalCents: orders.totalCents })
    .from(orders)
    .where(eq(orders.id, orderId))

  const order = orderRows[0]
  if (!order) return

  const buyerRows = await tx
    .select({ email: users.email, displayName: users.displayName })
    .from(users)
    .where(eq(users.id, order.buyerId))
  const buyer = buyerRows[0]

  const itemRows = await tx
    .select({
      sellerId: orderItems.sellerId,
      sellerEmail: users.email,
      sellerName: users.displayName,
      title: orderItems.titleSnapshot,
      artist: orderItems.artistSnapshot,
      quantity: orderItems.quantity,
      priceCents: orderItems.priceCents,
    })
    .from(orderItems)
    .innerJoin(users, eq(users.id, orderItems.sellerId))
    .where(eq(orderItems.orderId, orderId))

  if (itemRows.length === 0) return

  const messages: Array<{ kind: string; payload: OutboxPayload }> = []

  if (buyer) {
    const lines = itemRows
      .map(
        (item) =>
          `  ${item.quantity}x ${item.title} (${item.artist})  ${formatPrice(item.priceCents * item.quantity)}`,
      )
      .join('\n')

    messages.push({
      kind: 'buyer.receipt',
      payload: {
        orderId,
        recipient: buyer.email,
        subject: `Deadwax receipt for order #${orderId}`,
        body: [
          `Thanks, ${buyer.displayName}.`,
          '',
          `Order #${orderId}`,
          lines,
          '',
          `Total paid: ${formatPrice(order.totalCents)}`,
          '',
          'Each seller marks a record shipped as it goes out.',
        ].join('\n'),
      },
    })
  }

  const bySeller = new Map<
    number,
    { email: string; name: string; lines: string[]; subtotal: number }
  >()

  for (const item of itemRows) {
    const entry = bySeller.get(item.sellerId) ?? {
      email: item.sellerEmail,
      name: item.sellerName,
      lines: [],
      subtotal: 0,
    }
    entry.lines.push(
      `  ${item.quantity}x ${item.title} (${item.artist})  ${formatPrice(item.priceCents * item.quantity)}`,
    )
    entry.subtotal += item.priceCents * item.quantity
    bySeller.set(item.sellerId, entry)
  }

  for (const entry of bySeller.values()) {
    messages.push({
      kind: 'seller.notice',
      payload: {
        orderId,
        recipient: entry.email,
        subject: `You sold ${entry.lines.length} record(s) on Deadwax`,
        body: [
          `Order #${orderId}`,
          ...entry.lines,
          '',
          `Your share: ${formatPrice(entry.subtotal)}`,
          buyer ? `Buyer: ${buyer.displayName}` : '',
          '',
          'Mark it shipped from your seller dashboard.',
        ]
          .filter((line) => line !== '')
          .join('\n'),
      },
    })
  }

  if (messages.length > 0) {
    await tx.insert(outbox).values(messages)
  }
}

export type OutboxSender = (message: OutboxPayload, outboxId: number) => Promise<void>

export interface DrainResult {
  sent: number
  failed: number
  dead: number
}

/**
 * Delivers due messages. The default sender writes to mail_outbox in the same
 * transaction that marks the job sent, so a crash cannot both deliver and
 * forget: it either commits both or neither.
 *
 * Locks are skipped, so two workers can run without stepping on each other.
 */
export async function drainOutbox(
  options: { now?: Date; limit?: number; sender?: OutboxSender } = {},
): Promise<DrainResult> {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 25

  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(outbox)
      .where(
        and(isNull(outbox.sentAt), isNull(outbox.deadLetteredAt), lte(outbox.nextAttemptAt, now)),
      )
      .orderBy(asc(outbox.id))
      .limit(limit)
      .for('update', { skipLocked: true })

    const sender: OutboxSender =
      options.sender ??
      (async (message, outboxId) => {
        await tx
          .insert(mailOutbox)
          .values({
            outboxId,
            recipient: message.recipient,
            subject: message.subject,
            body: message.body,
          })
          .onConflictDoNothing()
      })

    return withSpan('outbox.drain', { 'outbox.batch': due.length }, async (span) => {
      let sent = 0
      let failed = 0
      let dead = 0

      for (const job of due) {
        const payload = job.payload as OutboxPayload
        try {
          await sender(payload, job.id)
          await tx
            .update(outbox)
            .set({ sentAt: now, attempts: job.attempts + 1, lastError: null })
            .where(eq(outbox.id, job.id))
          sent += 1
        } catch (error) {
          const attempts = job.attempts + 1
          const isDead = attempts >= MAX_ATTEMPTS
          await tx
            .update(outbox)
            .set({
              attempts,
              lastError: error instanceof Error ? error.message : 'unknown error',
              deadLetteredAt: isDead ? now : null,
              nextAttemptAt: isDead
                ? job.nextAttemptAt
                : new Date(now.getTime() + BACKOFF_BASE_MS * 2 ** (attempts - 1)),
            })
            .where(eq(outbox.id, job.id))
          failed += 1
          if (isDead) dead += 1
        }
      }

      span.setAttributes({ 'outbox.sent': sent, 'outbox.failed': failed, 'outbox.dead': dead })
      return { sent, failed, dead }
    })
  })
}
