import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CheckoutInput, OrderDetail, OrderSummary } from '@deadwax/shared'
import { api } from './api'
import { CART_KEY } from './cart'

export function useOrders(enabled: boolean) {
  return useQuery({
    queryKey: ['orders'],
    enabled,
    queryFn: ({ signal }) => api<{ data: OrderSummary[] }>('/orders', { signal }),
  })
}

export function useOrder(id: number | undefined) {
  return useQuery({
    queryKey: ['orders', id ?? 0],
    enabled: typeof id === 'number' && Number.isInteger(id) && id > 0,
    queryFn: ({ signal }) => api<{ order: OrderDetail }>(`/orders/${id}`, { signal }),
  })
}

export interface CheckoutResult {
  orderId: number
  clientSecret?: string
}

export function useCheckout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CheckoutInput) =>
      api<CheckoutResult>('/checkout', { method: 'POST', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CART_KEY })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['listings'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
    },
  })
}
