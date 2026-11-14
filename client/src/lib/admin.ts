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

export interface AdminWebhookEvent {
  id: number
  eventId: string
  type: string
  outcome: string | null
  receivedAt: string
  processedAt: string | null
}

export interface AdminJob {
  id: number
  kind: string
  recipient: string
  attempts: number
  lastError: string | null
  createdAt: string
  sentAt: string | null
  deadLetteredAt: string | null
}

export interface AdminJobs {
  pending: number
  dead: number
  sent: number
  oldestPendingAt: string | null
  recent: AdminJob[]
}

export interface AdminMail {
  id: number
  recipient: string
  subject: string
  body: string
  createdAt: string
}

export function useAdminWebhooks(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'webhooks'],
    enabled,
    refetchInterval: 15_000,
    queryFn: ({ signal }) => api<{ data: AdminWebhookEvent[] }>('/admin/webhooks', { signal }),
  })
}

export function useAdminJobs(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'jobs'],
    enabled,
    refetchInterval: 10_000,
    queryFn: ({ signal }) => api<AdminJobs>('/admin/jobs', { signal }),
  })
}

export function useAdminMail(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'mail'],
    enabled,
    refetchInterval: 30_000,
    queryFn: ({ signal }) => api<{ data: AdminMail[] }>('/admin/mail', { signal }),
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
