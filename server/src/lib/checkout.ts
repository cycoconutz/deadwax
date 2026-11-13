import { randomUUID } from 'node:crypto'
import { and, eq, gte, sql } from 'drizzle-orm'
import { shippingFlatCents, type CheckoutShippingInput } from '@deadwax/shared'
import { db } from '../db'
import { cartItems, listings, orderItems, orders, payments } from '../db/schema'

export type PaymentProvider = 'simulated' | 'stripe'

export type CreateOrderFailure =
  | { ok: false; reason: 'empty_cart' }
  | { ok: false; reason: 'unavailable'; items: Array<{ listingId: number; title: string }> }

export type CreateOrderResult =
  | { ok: true; orderId: number; totalCents: number }
  | CreateOrderFailure

/**
 * Thrown when the guarded stock update matches no row: another checkout took
 * the last copy between the availability read and the transaction.
 */
class StockConflictError extends Error {
  constructor(
    readonly listingId: number,
    readonly title: string,
  ) {
    super(`Listing ${listingId} no longer has enough stock`)
    this.name = 'StockConflictError'
  }
}

/**
 * Creates an order that is waiting for money, and holds its stock.
 *
 * Nothing here marks an order paid. That is `confirmPayment`'s job, so a
 * buyer, a webhook and a test all go through one transition.
 */
export async function createPendingOrder(
  buyerId: number,
  shipping: CheckoutShippingInput,
  provider: PaymentProvider,
): Promise<CreateOrderResult> {
  const cartRows = await db
    .select({
      listingId: cartItems.listingId,
      quantity: cartItems.quantity,
      priceCents: listings.priceCents,
      stock: listings.stock,
      status: listings.status,
      sellerId: listings.sellerId,
      title: listings.title,
      artist: listings.artist,
    })
    .from(cartItems)
    .innerJoin(listings, eq(listings.id, cartItems.listingId))
    .where(eq(cartItems.userId, buyerId))

  if (cartRows.length === 0) {
    return { ok: false, reason: 'empty_cart' }
  }

  const unavailable = cartRows.filter(
    (row) => row.status !== 'active' || row.stock < row.quantity,
  )
  if (unavailable.length > 0) {
    return {
      ok: false,
      reason: 'unavailable',
      items: unavailable.map((row) => ({ listingId: row.listingId, title: row.title })),
    }
  }

  const subtotalCents = cartRows.reduce((sum, row) => sum + row.priceCents * row.quantity, 0)
  const shippingCents = shippingFlatCents
  const totalCents = subtotalCents + shippingCents

  try {
    const orderId = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(orders)
        .values({
          buyerId,
          status: 'pending',
          stockReservedAt: new Date(),
          subtotalCents,
          shippingCents,
          totalCents,
          shippingName: shipping.shippingName,
          shippingAddress1: shipping.shippingAddress1,
          shippingAddress2: shipping.shippingAddress2 ?? '',
          shippingCity: shipping.shippingCity,
          shippingRegion: shipping.shippingRegion ?? '',
          shippingPostal: shipping.shippingPostal,
          shippingCountry: shipping.shippingCountry,
        })
        .returning({ id: orders.id })

      const order = inserted[0]
      if (!order) throw new Error('Failed to create order')

      await tx.insert(orderItems).values(
        cartRows.map((row) => ({
          orderId: order.id,
          listingId: row.listingId,
          sellerId: row.sellerId,
          titleSnapshot: row.title,
          artistSnapshot: row.artist,
          priceCents: row.priceCents,
          quantity: row.quantity,
          status: 'pending' as const,
        })),
      )

      await tx.insert(payments).values({
        orderId: order.id,
        provider,
        providerRef: `${provider === 'simulated' ? 'sim' : 'stripe_pending'}_${randomUUID()}`,
        status: 'requires_payment',
        amountCents: totalCents,
        cardLast4: '',
      })

      // Claim the stock with a conditional update instead of writing the
      // arithmetic result blindly. If another checkout got there first, no
      // row matches, the whole transaction rolls back, and the buyer is told
      // the record is gone. A blind decrement would drive stock negative and
      // sell the same copy twice.
      for (const row of cartRows) {
        const claimed = await tx
          .update(listings)
          .set({ stock: sql`${listings.stock} - ${row.quantity}`, updatedAt: new Date() })
          .where(
            and(
              eq(listings.id, row.listingId),
              eq(listings.status, 'active'),
              gte(listings.stock, row.quantity),
            ),
          )
          .returning({ id: listings.id })

        if (claimed.length === 0) {
          throw new StockConflictError(row.listingId, row.title)
        }
      }

      await tx.delete(cartItems).where(eq(cartItems.userId, buyerId))
      return order.id
    })

    return { ok: true, orderId, totalCents }
  } catch (error) {
    if (error instanceof StockConflictError) {
      return {
        ok: false,
        reason: 'unavailable',
        items: [{ listingId: error.listingId, title: error.title }],
      }
    }
    throw error
  }
}
