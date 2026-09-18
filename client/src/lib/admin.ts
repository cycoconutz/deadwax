import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { AdminReview, AdminSummary, AdminUser, ListingSummary } from '@deadwax/shared'
import { api } from './api'

export function useAdminSummary(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'summary'],
    enabled,
    queryFn: ({ signal }) => api<AdminSummary>('/admin/summary', { signal }),
  })
}

export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'users'],
    enabled,
    queryFn: ({ signal }) => api<{ data: AdminUser[] }>('/admin/users', { signal }),
  })
}

export function useAdminListings(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'listings'],
    enabled,
    queryFn: ({ signal }) => api<{ data: ListingSummary[] }>('/admin/listings', { signal }),
  })
}

export function useAdminReviews(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'reviews'],
    enabled,
    queryFn: ({ signal }) => api<{ data: AdminReview[] }>('/admin/reviews', { signal }),
  })
}

export function useArchiveListing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (listingId: number) =>
      api<void>(`/listings/${listingId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.invalidateQueries({ queryKey: ['listings'] })
    },
  })
}

export function useModerateReview() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (reviewId: number) => api<void>(`/reviews/${reviewId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      queryClient.invalidateQueries({ queryKey: ['listings'] })
    },
  })
}
