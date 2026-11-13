import { useQuery } from '@tanstack/react-query'
import { loadStripe } from '@stripe/stripe-js'
import { api } from './api'

const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? ''

/**
 * Null when the build has no publishable key. The checkout page then keeps the
 * demo card form, so a clone without keys still works.
 */
export const stripePromise = publishableKey ? loadStripe(publishableKey) : null

export interface PaymentsConfig {
  mode: 'simulated' | 'stripe'
}

export function usePaymentsConfig() {
  return useQuery({
    queryKey: ['payments', 'config'],
    queryFn: ({ signal }) => api<PaymentsConfig>('/payments/config', { signal }),
    staleTime: 5 * 60 * 1000,
  })
}
