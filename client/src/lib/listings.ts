import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ListingCreateInput,
  ListingDetail,
  ListingSummary,
  ListingUpdateInput,
  Paginated,
  PublicReview,
} from '@deadwax/shared'
import { api } from './api'

export interface ListingFilters {
  q?: string
  genre?: string
  condition?: string
  minPrice?: number
  maxPrice?: number
  sort?: string
  page?: number
}

export interface ListingDetailResponse {
  listing: ListingDetail
  reviews: PublicReview[]
}

function toSearchParams(filters: ListingFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

export const listingKeys = {
  all: ['listings'] as const,
  list: (filters: ListingFilters) => ['listings', 'list', filters] as const,
  detail: (id: number) => ['listings', 'detail', id] as const,
  mine: ['listings', 'mine'] as const,
}

export function useListings(filters: ListingFilters) {
  return useQuery({
    queryKey: listingKeys.list(filters),
    queryFn: ({ signal }) =>
      api<Paginated<ListingSummary>>(`/listings${toSearchParams(filters)}`, { signal }),
    placeholderData: (previous) => previous,
  })
}

export function useListing(id: number | undefined) {
  return useQuery({
    queryKey: listingKeys.detail(id ?? 0),
    enabled: typeof id === 'number' && Number.isFinite(id) && id > 0,
    queryFn: ({ signal }) => api<ListingDetailResponse>(`/listings/${id}`, { signal }),
  })
}

export function useMyListings() {
  return useQuery({
    queryKey: listingKeys.mine,
    queryFn: ({ signal }) =>
      api<{ data: ListingSummary[] }>('/listings/mine', { signal }),
  })
}

export function useCreateListing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ListingCreateInput) =>
      api<{ id: number }>('/listings', { method: 'POST', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listingKeys.all })
      queryClient.invalidateQueries({ queryKey: ['seller'] })
    },
  })
}

export function useUpdateListing(id: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ListingUpdateInput) =>
      api<{ ok: true }>(`/listings/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listingKeys.all })
      queryClient.invalidateQueries({ queryKey: ['seller'] })
    },
  })
}

export function useDeleteListing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api<void>(`/listings/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listingKeys.all })
      queryClient.invalidateQueries({ queryKey: ['seller'] })
    },
  })
}
