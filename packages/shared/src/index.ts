import { z } from 'zod'

export const ROLES = ['buyer', 'seller', 'admin'] as const
export type Role = (typeof ROLES)[number]

export const CONDITIONS = ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'P'] as const
export type Condition = (typeof CONDITIONS)[number]

export const CONDITION_LABELS: Record<Condition, string> = {
  M: 'Mint',
  NM: 'Near Mint',
  'VG+': 'Very Good Plus',
  VG: 'Very Good',
  'G+': 'Good Plus',
  G: 'Good',
  P: 'Poor',
}

export const GENRES = [
  'Rock',
  'Jazz',
  'Soul',
  'Funk',
  'Hip-Hop',
  'Electronic',
  'Pop',
  'Blues',
  'Classical',
  'Folk',
  'Reggae',
  'Country',
  'Punk',
  'Metal',
  'Other',
] as const
export type Genre = (typeof GENRES)[number]

export const LISTING_STATUSES = ['active', 'archived'] as const
export type ListingStatus = (typeof LISTING_STATUSES)[number]

export const ORDER_STATUSES = [
  'pending',
  'paid',
  'shipped',
  'delivered',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

export const SORT_OPTIONS = [
  'newest',
  'price_asc',
  'price_desc',
  'year_asc',
  'year_desc',
] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

export const DEFAULT_PAGE_SIZE = 24
export const MAX_PAGE_SIZE = 60

export const shippingFlatCents = 600

export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/* ------------------------------ auth ------------------------------ */

export const registerSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(60),
  wantsToSell: z.boolean().default(false),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
})
export type LoginInput = z.infer<typeof loginSchema>

/* ---------------------------- listings ---------------------------- */

export const listingCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  artist: z.string().trim().min(1).max(120),
  label: z.string().trim().max(120).optional().or(z.literal('')),
  catalogNumber: z.string().trim().max(60).optional().or(z.literal('')),
  releaseYear: z.coerce.number().int().min(1900).max(2100).optional(),
  genre: z.enum(GENRES),
  condition: z.enum(CONDITIONS),
  priceCents: z.coerce.number().int().min(0).max(10_000_00),
  stock: z.coerce.number().int().min(0).max(999),
  description: z.string().trim().max(4000).optional().or(z.literal('')),
  coverImageUrl: z.union([z.url(), z.literal('')]).optional(),
})
export type ListingCreateInput = z.infer<typeof listingCreateSchema>

export const listingUpdateSchema = listingCreateSchema.partial().extend({
  status: z.enum(LISTING_STATUSES).optional(),
})
export type ListingUpdateInput = z.infer<typeof listingUpdateSchema>

export const listingQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  genre: z.string().optional(),
  condition: z.string().optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  sellerId: z.coerce.number().int().positive().optional(),
  sort: z.enum(SORT_OPTIONS).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
})
export type ListingQuery = z.infer<typeof listingQuerySchema>

/* ------------------------------ cart ------------------------------ */

export const cartItemSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
})
export type CartItemInput = z.infer<typeof cartItemSchema>

/* ---------------------------- checkout ---------------------------- */

export const checkoutSchema = z.object({
  shippingName: z.string().trim().min(1).max(120),
  shippingAddress1: z.string().trim().min(1).max(160),
  shippingAddress2: z.string().trim().max(160).optional().or(z.literal('')),
  shippingCity: z.string().trim().min(1).max(80),
  shippingRegion: z.string().trim().max(80).optional().or(z.literal('')),
  shippingPostal: z.string().trim().min(1).max(20),
  shippingCountry: z.string().trim().min(2).max(60),
  cardNumber: z.string().trim().min(12).max(23),
  cardExpiry: z.string().trim().min(4).max(7),
  cardCvc: z.string().trim().min(3).max(4),
  nameOnCard: z.string().trim().min(1).max(120),
})
export type CheckoutInput = z.infer<typeof checkoutSchema>

/* ----------------------------- reviews ---------------------------- */

export const reviewSchema = z.object({
  orderItemId: z.coerce.number().int().positive(),
  rating: z.coerce.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional().or(z.literal('')),
})
export type ReviewInput = z.infer<typeof reviewSchema>

/* --------------------------- api errors --------------------------- */

export interface ApiErrorBody {
  error: string
  message: string
  details?: unknown
}
