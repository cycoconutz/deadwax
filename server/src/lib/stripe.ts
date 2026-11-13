import Stripe from 'stripe'
import { env } from '../env'

let client: Stripe | null = null

/**
 * The Stripe SDK is only constructed when something actually needs it, so the
 * simulated mode can run with no key at all.
 */
export function getStripe(): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is required when PAYMENTS_MODE=stripe')
  }
  client ??= new Stripe(env.STRIPE_SECRET_KEY)
  return client
}
