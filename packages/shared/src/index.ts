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

/* --------------------------- api payloads -------------------------- */

export interface PublicUser {
  id: number
  displayName: string
}

export interface ListingSummary {
  id: number
  sellerId: number
  sellerName: string
  title: string
  artist: string
  label: string
  catalogNumber: string
  releaseYear: number | null
  genre: Genre
  condition: Condition
  priceCents: number
  stock: number
  coverImageUrl: string
  status: ListingStatus
  createdAt: string
}

export interface ListingDetail extends ListingSummary {
  description: string
  ratingAverage: number | null
  reviewCount: number
}

export interface PublicReview {
  id: number
  rating: number
  body: string
  createdAt: string
  buyerName: string
}

export interface Paginated<T> {
  data: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/* ------------------------------- cart --------------------------------- */

export interface CartLine {
  listingId: number
  quantity: number
  title: string
  artist: string
  coverImageUrl: string
  priceCents: number
  stock: number
  sellerId: number
  status: ListingStatus
  lineTotalCents: number
}

export interface CartResponse {
  lines: CartLine[]
  subtotalCents: number
  shippingCents: number
  totalCents: number
  itemCount: number
}

/* ------------------------------ orders -------------------------------- */

export interface OrderItemPublic {
  id: number
  listingId: number | null
  title: string
  artist: string
  priceCents: number
  quantity: number
  sellerId: number
  sellerName: string
  status: OrderStatus
  reviewed: boolean
}

/* ------------------------------ reviews -------------------------------- */

export interface ReviewableItem {
  orderItemId: number
  orderId: number
  listingId: number
  title: string
  artist: string
  status: OrderStatus
}

/* ------------------------------- admin --------------------------------- */

export interface AdminSummary {
  users: number
  sellers: number
  listings: number
  activeListings: number
  orders: number
  grossSalesCents: number
  reviews: number
}

export interface AdminUser {
  id: number
  email: string
  displayName: string
  role: Role
  createdAt: string
  listingCount: number
  orderCount: number
}

export interface AdminReview {
  id: number
  rating: number
  body: string
  createdAt: string
  buyerName: string
  listingId: number
  listingTitle: string
}

export interface OrderSummary {
  id: number
  status: OrderStatus
  subtotalCents: number
  shippingCents: number
  totalCents: number
  createdAt: string
  itemCount: number
  items: OrderItemPublic[]
}

export interface OrderPayment {
  provider: string
  status: string
  amountCents: number
  cardLast4: string
  failureReason: string | null
}

export interface OrderDetail extends OrderSummary {
  shippingName: string
  shippingAddress1: string
  shippingAddress2: string
  shippingCity: string
  shippingRegion: string
  shippingPostal: string
  shippingCountry: string
  payment: OrderPayment | null
}

/* ------------------------------ seller --------------------------------- */

export interface SellerOrderItem {
  id: number
  listingId: number | null
  title: string
  artist: string
  priceCents: number
  quantity: number
  status: OrderStatus
}

export interface SellerOrder {
  id: number
  orderStatus: OrderStatus
  buyerName: string
  createdAt: string
  shippingName: string
  shippingCity: string
  shippingRegion: string
  shippingCountry: string
  sellerTotalCents: number
  items: SellerOrderItem[]
}

export interface SellerSummary {
  activeListings: number
  archivedListings: number
  unitsSold: number
  ordersToShip: number
  grossSalesCents: number
}
