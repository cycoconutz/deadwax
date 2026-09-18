import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ReviewableItem } from '@deadwax/shared'
import { api } from './api'

export function useReviewableItems(enabled: boolean) {
  return useQuery({
    queryKey: ['reviews', 'eligible'],
    enabled,
    queryFn: ({ signal }) => api<{ data: ReviewableItem[] }>('/reviews/eligible', { signal }),
  })
}

export function useCreateReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { orderItemId: number; rating: number; body: string }) =>
      api<{ id: number }>('/reviews', { method: 'POST', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['listings'] })
    },
  })
}

export function useDeleteReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/reviews/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] })
      queryClient.invalidateQueries({ queryKey: ['listings'] })
      queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })
}
