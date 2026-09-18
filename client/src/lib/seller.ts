import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrderStatus, SellerOrder, SellerSummary } from '@deadwax/shared'
import { api } from './api'

export function useSellerSummary(enabled: boolean) {
  return useQuery({
    queryKey: ['seller', 'summary'],
    enabled,
    queryFn: ({ signal }) => api<SellerSummary>('/seller/summary', { signal }),
  })
}

export function useSellerOrders(enabled: boolean) {
  return useQuery({
    queryKey: ['seller', 'orders'],
    enabled,
    queryFn: ({ signal }) => api<{ data: SellerOrder[] }>('/seller/orders', { signal }),
  })
}

export function useUpdateItemStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { itemId: number; status: OrderStatus }) =>
      api<{ ok: true; status: OrderStatus; orderStatus: OrderStatus }>(
        `/seller/orders/items/${input.itemId}`,
        { method: 'PATCH', body: { status: input.status } },
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}
