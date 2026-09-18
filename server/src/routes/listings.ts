import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import {
  CONDITIONS,
  GENRES,
  listingCreateSchema,
  listingQuerySchema,
  listingUpdateSchema,
  type Condition,
  type Genre,
  type ListingDetail,
  type ListingStatus,
  type ListingSummary,
  type PublicReview,
} from '@deadwax/shared'
import { db } from '../db/index'
import { listings, reviews, users } from '../db/schema'

interface ListingRow {
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
  createdAt: Date
}

const listingColumns = {
  id: listings.id,
  sellerId: listings.sellerId,
  sellerName: users.displayName,
  title: listings.title,
  artist: listings.artist,
  label: listings.label,
  catalogNumber: listings.catalogNumber,
  releaseYear: listings.releaseYear,
  genre: listings.genre,
  condition: listings.condition,
  priceCents: listings.priceCents,
  stock: listings.stock,
  coverImageUrl: listings.coverImageUrl,
  status: listings.status,
  createdAt: listings.createdAt,
}

function toSummary(row: ListingRow): ListingSummary {
  return { ...row, createdAt: row.createdAt.toISOString() }
}

const ftsExpression = sql`to_tsvector('english', coalesce(${listings.title}, '') || ' ' || coalesce(${listings.artist}, '') || ' ' || coalesce(${listings.label}, ''))`

function parseCsv<T extends string>(value: string | undefined, allowed: readonly T[]): T[] {
  if (!value) return []
  const allowedSet = new Set<string>(allowed)
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part): part is T => allowedSet.has(part))
}

function parseId(request: FastifyRequest): number | null {
  const raw = (request.params as { id?: string }).id
  const id = Number(raw)
  return Number.isInteger(id) && id > 0 ? id : null
}

function badRequest(reply: FastifyReply, message: string, details: unknown) {
  return reply.status(400).send({ error: 'validation_error', message, details })
}

const listingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/listings/mine', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    const rows = await db
      .select(listingColumns)
      .from(listings)
      .innerJoin(users, eq(users.id, listings.sellerId))
      .where(eq(listings.sellerId, request.user.id))
      .orderBy(desc(listings.createdAt))
    return { data: rows.map(toSummary) }
  })

  app.get('/listings', async (request, reply) => {
    const parsed = listingQuerySchema.safeParse(request.query)
    if (!parsed.success) {
      return badRequest(reply, 'Invalid search parameters.', parsed.error.flatten())
    }

    const { q, sort, page, pageSize, minPrice, maxPrice, sellerId } = parsed.data
    const genres = parseCsv(parsed.data.genre, GENRES)
    const conditions = parseCsv(parsed.data.condition, CONDITIONS)

    const filters: SQL[] = [eq(listings.status, 'active')]
    const trimmed = q?.trim()
    if (trimmed) {
      const term = `%${trimmed}%`
      const match = or(
        sql`${ftsExpression} @@ websearch_to_tsquery('english', ${trimmed})`,
        ilike(listings.title, term),
        ilike(listings.artist, term),
      )
      if (match) filters.push(match)
    }
    if (genres.length > 0) filters.push(inArray(listings.genre, genres))
    if (conditions.length > 0) filters.push(inArray(listings.condition, conditions))
    if (typeof minPrice === 'number') filters.push(gte(listings.priceCents, minPrice))
    if (typeof maxPrice === 'number') filters.push(lte(listings.priceCents, maxPrice))
    if (typeof sellerId === 'number') filters.push(eq(listings.sellerId, sellerId))

    const where = and(...filters)

    const countRows = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(listings)
      .where(where)
    const total = countRows[0]?.value ?? 0
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const currentPage = Math.min(page, totalPages)
    const offset = (currentPage - 1) * pageSize

    const base = db
      .select(listingColumns)
      .from(listings)
      .innerJoin(users, eq(users.id, listings.sellerId))
      .where(where)

    const ordered =
      sort === 'price_asc'
        ? base.orderBy(asc(listings.priceCents), desc(listings.id))
        : sort === 'price_desc'
          ? base.orderBy(desc(listings.priceCents), desc(listings.id))
          : sort === 'year_asc'
            ? base.orderBy(sql`${listings.releaseYear} asc nulls last`, desc(listings.id))
            : sort === 'year_desc'
              ? base.orderBy(sql`${listings.releaseYear} desc nulls last`, desc(listings.id))
              : base.orderBy(desc(listings.createdAt), desc(listings.id))

    const rows = await ordered.limit(pageSize).offset(offset)

    return {
      data: rows.map(toSummary),
      page: currentPage,
      pageSize,
      total,
      totalPages,
    }
  })

  app.get('/listings/:id', async (request, reply) => {
    const id = parseId(request)
    if (!id) return reply.status(404).send({ error: 'not_found', message: 'No such listing.' })

    const rows = await db
      .select({
        ...listingColumns,
        description: listings.description,
        ratingAverage: sql<number | null>`(
          select avg(r.rating)::float from reviews r where r.listing_id = ${listings.id}
        )`,
        reviewCount: sql<number>`(
          select count(*)::int from reviews r where r.listing_id = ${listings.id}
        )`,
      })
      .from(listings)
      .innerJoin(users, eq(users.id, listings.sellerId))
      .where(eq(listings.id, id))
      .limit(1)

    const row = rows[0]
    if (!row) return reply.status(404).send({ error: 'not_found', message: 'No such listing.' })

    const isOwner = request.user?.id === row.sellerId
    const isAdmin = request.user?.role === 'admin'
    if (row.status !== 'active' && !isOwner && !isAdmin) {
      return reply.status(404).send({ error: 'not_found', message: 'No such listing.' })
    }

    const reviewRows = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        body: reviews.body,
        createdAt: reviews.createdAt,
        buyerName: users.displayName,
      })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.buyerId))
      .where(eq(reviews.listingId, id))
      .orderBy(desc(reviews.createdAt))

    const listing: ListingDetail = {
      ...toSummary(row),
      description: row.description,
      ratingAverage: row.ratingAverage,
      reviewCount: row.reviewCount,
    }

    const reviewList: PublicReview[] = reviewRows.map((review) => ({
      id: review.id,
      rating: review.rating,
      body: review.body,
      createdAt: review.createdAt.toISOString(),
      buyerName: review.buyerName,
    }))

    return { listing, reviews: reviewList }
  })

  app.post('/listings', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    if (request.user.role === 'buyer') {
      return reply
        .status(403)
        .send({ error: 'forbidden', message: 'Only sellers can create listings.' })
    }

    const parsed = listingCreateSchema.safeParse(request.body)
    if (!parsed.success) {
      return badRequest(reply, 'Check the listing fields.', parsed.error.flatten())
    }

    const input = parsed.data
    const inserted = await db
      .insert(listings)
      .values({
        sellerId: request.user.id,
        title: input.title,
        artist: input.artist,
        label: input.label ?? '',
        catalogNumber: input.catalogNumber ?? '',
        releaseYear: input.releaseYear ?? null,
        genre: input.genre,
        condition: input.condition,
        priceCents: input.priceCents,
        stock: input.stock,
        description: input.description ?? '',
        coverImageUrl: input.coverImageUrl ?? '',
      })
      .returning({ id: listings.id })

    const created = inserted[0]
    if (!created) {
      return reply.status(500).send({ error: 'internal_error', message: 'Could not save listing.' })
    }
    return reply.status(201).send({ id: created.id })
  })

  app.patch('/listings/:id', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    const id = parseId(request)
    if (!id) return reply.status(404).send({ error: 'not_found', message: 'No such listing.' })

    const existingRows = await db
      .select({ sellerId: listings.sellerId })
      .from(listings)
      .where(eq(listings.id, id))
      .limit(1)
    const existing = existingRows[0]
    if (!existing) {
      return reply.status(404).send({ error: 'not_found', message: 'No such listing.' })
    }
    if (existing.sellerId !== request.user.id && request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'forbidden', message: 'Not your listing.' })
    }

    const parsed = listingUpdateSchema.safeParse(request.body)
    if (!parsed.success) {
      return badRequest(reply, 'Check the listing fields.', parsed.error.flatten())
    }

    const input = parsed.data
    const patch: Partial<typeof listings.$inferInsert> = { updatedAt: new Date() }
    if (input.title !== undefined) patch.title = input.title
    if (input.artist !== undefined) patch.artist = input.artist
    if (input.label !== undefined) patch.label = input.label
    if (input.catalogNumber !== undefined) patch.catalogNumber = input.catalogNumber
    if (input.releaseYear !== undefined) patch.releaseYear = input.releaseYear ?? null
    if (input.genre !== undefined) patch.genre = input.genre
    if (input.condition !== undefined) patch.condition = input.condition
    if (input.priceCents !== undefined) patch.priceCents = input.priceCents
    if (input.stock !== undefined) patch.stock = input.stock
    if (input.description !== undefined) patch.description = input.description
    if (input.coverImageUrl !== undefined) patch.coverImageUrl = input.coverImageUrl ?? ''
    if (input.status !== undefined) patch.status = input.status

    await db.update(listings).set(patch).where(eq(listings.id, id))
    return { ok: true }
  })

  app.delete('/listings/:id', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    const id = parseId(request)
    if (!id) return reply.status(404).send({ error: 'not_found', message: 'No such listing.' })

    const existingRows = await db
      .select({ sellerId: listings.sellerId })
      .from(listings)
      .where(eq(listings.id, id))
      .limit(1)
    const existing = existingRows[0]
    if (!existing) {
      return reply.status(404).send({ error: 'not_found', message: 'No such listing.' })
    }
    if (existing.sellerId !== request.user.id && request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'forbidden', message: 'Not your listing.' })
    }

    await db
      .update(listings)
      .set({ status: 'archived', updatedAt: new Date() })
      .where(eq(listings.id, id))
    return reply.status(204).send()
  })
}

export default listingRoutes
