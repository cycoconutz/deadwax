import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CartResponse } from '@deadwax/shared'
import { api } from './api'

export const CART_KEY = ['cart'] as const

export function useCart(enabled: boolean) {
  return useQuery({
    queryKey: CART_KEY,
    enabled,
    queryFn: ({ signal }) => api<CartResponse>('/cart', { signal }),
    staleTime: 30_000,
  })
}

export function useAddToCart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { listingId: number; quantity?: number }) =>
      api<CartResponse>('/cart', { method: 'POST', body: input }),
    onSuccess: (data) => queryClient.setQueryData(CART_KEY, data),
  })
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { listingId: number; quantity: number }) =>
      api<CartResponse>(`/cart/${input.listingId}`, {
        method: 'PATCH',
        body: { quantity: input.quantity },
      }),
    onSuccess: (data) => queryClient.setQueryData(CART_KEY, data),
  })
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (listingId: number) =>
      api<CartResponse>(`/cart/${listingId}`, { method: 'DELETE' }),
    onSuccess: (data) => queryClient.setQueryData(CART_KEY, data),
  })
}

export function useClearCart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/cart', { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CART_KEY }),
  })
}
