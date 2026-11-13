import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'
import {
  CONDITIONS,
  GENRES,
  LISTING_STATUSES,
  ORDER_STATUSES,
  ROLES,
  type Condition,
  type Genre,
  type ListingStatus,
  type OrderStatus,
  type Role,
} from '@deadwax/shared'

export const roleEnum = pgEnum('role', ROLES)
export const conditionEnum = pgEnum('condition', CONDITIONS)
export const genreEnum = pgEnum('genre', GENRES)
export const listingStatusEnum = pgEnum('listing_status', LISTING_STATUSES)
export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES)

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    email: varchar('email', { length: 254 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: varchar('display_name', { length: 60 }).notNull(),
    role: roleEnum('role').notNull().default('buyer').$type<Role>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
)

export const sessions = pgTable(
  'sessions',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
)

export const listings = pgTable(
  'listings',
  {
    id: serial('id').primaryKey(),
    sellerId: integer('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 160 }).notNull(),
    artist: varchar('artist', { length: 120 }).notNull(),
    label: varchar('label', { length: 120 }).notNull().default(''),
    catalogNumber: varchar('catalog_number', { length: 60 }).notNull().default(''),
    releaseYear: integer('release_year'),
    genre: genreEnum('genre').notNull().$type<Genre>(),
    condition: conditionEnum('condition').notNull().$type<Condition>(),
    priceCents: integer('price_cents').notNull(),
    stock: integer('stock').notNull().default(1),
    description: text('description').notNull().default(''),
    coverImageUrl: text('cover_image_url').notNull().default(''),
    status: listingStatusEnum('status').notNull().default('active').$type<ListingStatus>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check('listings_stock_non_negative', sql`${t.stock} >= 0`),
    index('listings_seller_idx').on(t.sellerId),
    index('listings_status_idx').on(t.status),
    index('listings_genre_idx').on(t.genre),
    index('listings_price_idx').on(t.priceCents),
  ],
)

export const cartItems = pgTable(
  'cart_items',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    listingId: integer('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    quantity: integer('quantity').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('cart_items_user_listing_unique').on(t.userId, t.listingId)],
)

export const orders = pgTable(
  'orders',
  {
    id: serial('id').primaryKey(),
    buyerId: integer('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: orderStatusEnum('status').notNull().default('pending').$type<OrderStatus>(),
    // Set only when a payment is confirmed. An order can move to paid from
    // nowhere else, which is what makes the two states auditable.
    paidAt: timestamp('paid_at', { withTimezone: true }),
    // The moment stock was taken for this order. Cleared when an expired
    // order releases it back to the listing.
    stockReservedAt: timestamp('stock_reserved_at', { withTimezone: true }),
    subtotalCents: integer('subtotal_cents').notNull(),
    shippingCents: integer('shipping_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    shippingName: varchar('shipping_name', { length: 120 }).notNull(),
    shippingAddress1: varchar('shipping_address1', { length: 160 }).notNull(),
    shippingAddress2: varchar('shipping_address2', { length: 160 }).notNull().default(''),
    shippingCity: varchar('shipping_city', { length: 80 }).notNull(),
    shippingRegion: varchar('shipping_region', { length: 80 }).notNull().default(''),
    shippingPostal: varchar('shipping_postal', { length: 20 }).notNull(),
    shippingCountry: varchar('shipping_country', { length: 60 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('orders_buyer_idx').on(t.buyerId), index('orders_status_idx').on(t.status)],
)

export const orderItems = pgTable(
  'order_items',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    listingId: integer('listing_id').references(() => listings.id, {
      onDelete: 'set null',
    }),
    sellerId: integer('seller_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    titleSnapshot: varchar('title_snapshot', { length: 160 }).notNull(),
    artistSnapshot: varchar('artist_snapshot', { length: 120 }).notNull().default(''),
    priceCents: integer('price_cents').notNull(),
    quantity: integer('quantity').notNull(),
    status: orderStatusEnum('status').notNull().default('paid').$type<OrderStatus>(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId), index('order_items_seller_idx').on(t.sellerId)],
)

export const payments = pgTable(
  'payments',
  {
    id: serial('id').primaryKey(),
    orderId: integer('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 40 }).notNull().default('simulated'),
    providerRef: varchar('provider_ref', { length: 120 }).notNull(),
    status: varchar('status', { length: 30 }).notNull(),
    amountCents: integer('amount_cents').notNull(),
    cardLast4: varchar('card_last4', { length: 4 }).notNull().default(''),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('payments_order_idx').on(t.orderId)],
)

export const reviews = pgTable(
  'reviews',
  {
    id: serial('id').primaryKey(),
    orderItemId: integer('order_item_id')
      .notNull()
      .references(() => orderItems.id, { onDelete: 'cascade' }),
    listingId: integer('listing_id')
      .notNull()
      .references(() => listings.id, { onDelete: 'cascade' }),
    buyerId: integer('buyer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    body: text('body').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('reviews_order_item_unique').on(t.orderItemId),
    index('reviews_listing_idx').on(t.listingId),
  ],
)

export const webhookEvents = pgTable(  'webhook_events',
  {
    id: serial('id').primaryKey(),
    provider: varchar('provider', { length: 40 }).notNull(),
    providerEventId: varchar('provider_event_id', { length: 120 }).notNull(),
    type: varchar('type', { length: 120 }).notNull(),
    payload: jsonb('payload').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    outcome: varchar('outcome', { length: 40 }),
  },
  (t) => [
    uniqueIndex('webhook_events_provider_event_unique').on(t.provider, t.providerEventId),
  ],
)

export const outbox = pgTable(
  'outbox',
  {
    id: serial('id').primaryKey(),
    kind: varchar('kind', { length: 60 }).notNull(),
    payload: jsonb('payload').notNull(),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    deadLetteredAt: timestamp('dead_lettered_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('outbox_due_idx').on(t.nextAttemptAt)],
)

/**
 * Where a delivery lands. A real provider would be an HTTP call; this keeps
 * the message so the demo can show exactly what would have been sent.
 */
export const mailOutbox = pgTable(
  'mail_outbox',
  {
    id: serial('id').primaryKey(),
    outboxId: integer('outbox_id')
      .notNull()
      .references(() => outbox.id, { onDelete: 'cascade' }),
    recipient: varchar('recipient', { length: 254 }).notNull(),
    subject: varchar('subject', { length: 200 }).notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('mail_outbox_outbox_unique').on(t.outboxId)],
)
