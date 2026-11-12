import type { FastifyInstance, LightMyRequestResponse } from 'fastify'
import { sql } from 'drizzle-orm'
import { buildApp } from '../src/app'
import { db } from '../src/db'
import { listings, users } from '../src/db/schema'
import { hashPassword } from '../src/lib/password'
import { createSession, SESSION_COOKIE } from '../src/lib/session'

export async function makeApp(): Promise<FastifyInstance> {
  const app = await buildApp({ logger: false })
  await app.ready()
  return app
}

const TRUNCATE = sql`
  truncate table
    reviews,
    payments,
    order_items,
    orders,
    cart_items,
    listings,
    sessions,
    users
  restart identity cascade
`

export async function resetDb(): Promise<void> {
  await db.execute(TRUNCATE)
}

export function sessionCookieHeader(response: LightMyRequestResponse): string {
  const raw = response.headers['set-cookie']
  const first = Array.isArray(raw) ? raw[0] : raw
  if (!first) {
    throw new Error(
      `Expected a Set-Cookie header on ${response.statusCode}: ${response.body}`,
    )
  }
  return first.split(';')[0] ?? ''
}

export interface TestUser {
  id: number
  email: string
  displayName: string
  role: 'buyer' | 'seller' | 'admin'
  cookie: string
}

export interface RegisterOptions {
  password?: string
  displayName?: string
  wantsToSell?: boolean
}

export async function register(
  app: FastifyInstance,
  email: string,
  options: RegisterOptions = {},
): Promise<TestUser> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: {
      email,
      password: options.password ?? 'correct horse battery staple',
      displayName: options.displayName ?? 'Test Buyer',
      wantsToSell: options.wantsToSell ?? false,
    },
  })

  if (response.statusCode !== 201) {
    throw new Error(`register failed: ${response.statusCode} ${response.body}`)
  }

  const body = response.json() as {
    user: { id: number; email: string; displayName: string; role: TestUser['role'] }
  }

  return { ...body.user, cookie: sessionCookieHeader(response) }
}

export function authHeaders(user: TestUser): Record<string, string> {
  return { cookie: user.cookie }
}

export const CHECKOUT_PAYLOAD = {
  shippingName: 'Ada Lovelace',
  shippingAddress1: '12 Marylebone Road',
  shippingCity: 'London',
  shippingPostal: 'NW1 5LA',
  shippingCountry: 'GB',
  cardNumber: '4242 4242 4242 4242',
  cardExpiry: '12/30',
  cardCvc: '123',
  nameOnCard: 'Ada Lovelace',
}

let cachedPasswordHash: Promise<string> | null = null

function testPasswordHash(): Promise<string> {
  cachedPasswordHash ??= hashPassword('correct horse battery staple')
  return cachedPasswordHash
}

export interface CreateUserOptions {
  displayName?: string
  role?: TestUser['role']
}

/**
 * Inserts a user and a live session directly, so a suite that needs twenty
 * accounts does not pay twenty scrypt hashes.
 */
export async function createUser(
  email: string,
  options: CreateUserOptions = {},
): Promise<TestUser> {
  const passwordHash = await testPasswordHash()
  const rows = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      displayName: options.displayName ?? 'Test Buyer',
      role: options.role ?? 'buyer',
    })
    .returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
    })

  const row = rows[0]
  if (!row) throw new Error('Failed to insert user fixture')

  const { token } = await createSession(row.id)
  return { ...row, cookie: `${SESSION_COOKIE}=${token}` }
}

export interface ListingOverrides {
  title?: string
  artist?: string
  genre?: (typeof listings.$inferInsert)['genre']
  condition?: (typeof listings.$inferInsert)['condition']
  priceCents?: number
  stock?: number
  status?: (typeof listings.$inferInsert)['status']
}

export async function createListing(
  sellerId: number,
  overrides: ListingOverrides = {},
): Promise<typeof listings.$inferSelect> {
  const rows = await db
    .insert(listings)
    .values({
      sellerId,
      title: 'Blue Train',
      artist: 'John Coltrane',
      genre: 'Jazz',
      condition: 'VG+',
      priceCents: 2499,
      stock: 1,
      ...overrides,
    })
    .returning()

  const row = rows[0]
  if (!row) throw new Error('Failed to insert listing fixture')
  return row
}
