import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { env } from '../env'
import { db } from '../db'
import { payments } from '../db/schema'

let client: Stripe | null = null

/**
 * The Stripe SDK is only constructed when something actually needs it, so the
 * simulated mode can run with no key at all.
 */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is required to talk to Stripe')
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY)
  return client
}

export interface CreatedPaymentIntent {
  id: string
  clientSecret: string
}

/**
 * Creates the intent for an existing order and attaches its id to the payment
 * row. The idempotency key means a retried request returns the same intent
 * instead of charging twice.
 */
export async function createPaymentIntentForOrder(
  orderId: number,
  amountCents: number,
): Promise<CreatedPaymentIntent> {
  const intent = await getStripe().paymentIntents.create(
    {
      amount: amountCents,
      currency: 'usd',
      // The 2026 API manages payment methods from the dashboard; redirects are
      // off because this checkout never leaves the page.
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: { orderId: String(orderId) },
    },
    { idempotencyKey: `order-${orderId}` },
  )

  if (!intent.client_secret) {
    throw new Error(`PaymentIntent ${intent.id} was created without a client secret`)
  }

  await db
    .update(payments)
    .set({ provider: 'stripe', providerRef: intent.id, updatedAt: new Date() })
    .where(eq(payments.orderId, orderId))

  return { id: intent.id, clientSecret: intent.client_secret }
}
