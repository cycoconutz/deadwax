import type { FastifyPluginAsync } from 'fastify'
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import type { AdminReview, AdminSummary, AdminUser, ListingSummary } from '@deadwax/shared'
import { db } from '../db/index'
import { listings, mailOutbox, orders, outbox, reviews, users, webhookEvents } from '../db/schema'

const adminRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ error: 'unauthorized', message: 'Sign in first.' })
    }
    if (request.user.role !== 'admin') {
      return reply.status(403).send({ error: 'forbidden', message: 'Admins only.' })
    }
  })

  app.get('/admin/webhooks', async () => {
    const rows = await db
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.id))
      .limit(20)

    return {
      data: rows.map((row) => ({
        id: row.id,
        eventId: row.providerEventId,
        type: row.type,
        outcome: row.outcome,
        receivedAt: row.receivedAt.toISOString(),
        processedAt: row.processedAt?.toISOString() ?? null,
      })),
    }
  })

  app.get('/admin/jobs', async () => {
    const pending = and(isNull(outbox.sentAt), isNull(outbox.deadLetteredAt))

    const [pendingRows, deadRows, sentRows, oldestRows, recentRows] = await Promise.all([
      db.select({ value: sql<number>`count(*)::int` }).from(outbox).where(pending),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(outbox)
        .where(isNotNull(outbox.deadLetteredAt)),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(outbox)
        .where(isNotNull(outbox.sentAt)),
      db
        .select({ value: outbox.createdAt })
        .from(outbox)
        .where(pending)
        .orderBy(asc(outbox.createdAt))
        .limit(1),
      db.select().from(outbox).orderBy(desc(outbox.id)).limit(20),
    ])

    return {
      pending: pendingRows[0]?.value ?? 0,
      dead: deadRows[0]?.value ?? 0,
      sent: sentRows[0]?.value ?? 0,
      oldestPendingAt: oldestRows[0]?.value?.toISOString() ?? null,
      recent: recentRows.map((job) => ({
        id: job.id,
        kind: job.kind,
        recipient: (job.payload as { recipient?: string }).recipient ?? '',
        attempts: job.attempts,
        lastError: job.lastError,
        createdAt: job.createdAt.toISOString(),
        sentAt: job.sentAt?.toISOString() ?? null,
        deadLetteredAt: job.deadLetteredAt?.toISOString() ?? null,
      })),
    }
  })

  app.get('/admin/mail', async () => {
    const rows = await db
      .select({
        id: mailOutbox.id,
        recipient: mailOutbox.recipient,
        subject: mailOutbox.subject,
        body: mailOutbox.body,
        createdAt: mailOutbox.createdAt,
      })
      .from(mailOutbox)
      .orderBy(desc(mailOutbox.id))
      .limit(20)

    return {
      data: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    }
  })

  app.get('/admin/summary', async () => {
    const [userRows, sellerRows, listingRows, activeRows, orderRows, reviewRows] = await Promise.all([
      db.select({ value: sql<number>`count(*)::int` }).from(users),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.role, 'seller')),
      db.select({ value: sql<number>`count(*)::int` }).from(listings),
      db
        .select({ value: sql<number>`count(*)::int` })
        .from(listings)
        .where(eq(listings.status, 'active')),
      db
        .select({
          value: sql<number>`count(*)::int`,
          gross: sql<number>`coalesce(sum(${orders.totalCents}) filter (where ${orders.status} <> 'cancelled'), 0)::int`,
        })
        .from(orders),
      db.select({ value: sql<number>`count(*)::int` }).from(reviews),
    ])

    const summary: AdminSummary = {
      users: userRows[0]?.value ?? 0,
      sellers: sellerRows[0]?.value ?? 0,
      listings: listingRows[0]?.value ?? 0,
      activeListings: activeRows[0]?.value ?? 0,
      orders: orderRows[0]?.value ?? 0,
      grossSalesCents: orderRows[0]?.gross ?? 0,
      reviews: reviewRows[0]?.value ?? 0,
    }
    return summary
  })

  app.get('/admin/users', async () => {
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
        listingCount: sql<number>`(
          select count(*)::int from ${listings} where ${listings.sellerId} = ${users.id}
        )`,
        orderCount: sql<number>`(
          select count(*)::int from ${orders} where ${orders.buyerId} = ${users.id}
        )`,
      })
      .from(users)
      .orderBy(desc(users.createdAt))

    const data: AdminUser[] = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }))
    return { data }
  })

  app.get('/admin/listings', async () => {
    const rows = await db
      .select({
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
      })
      .from(listings)
      .innerJoin(users, eq(users.id, listings.sellerId))
      .orderBy(desc(listings.createdAt))

    const data: ListingSummary[] = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }))
    return { data }
  })

  app.get('/admin/reviews', async () => {
    const rows = await db
      .select({
        id: reviews.id,
        rating: reviews.rating,
        body: reviews.body,
        createdAt: reviews.createdAt,
        buyerName: users.displayName,
        listingId: reviews.listingId,
        listingTitle: listings.title,
      })
      .from(reviews)
      .innerJoin(users, eq(users.id, reviews.buyerId))
      .innerJoin(listings, eq(listings.id, reviews.listingId))
      .orderBy(desc(reviews.createdAt))

    const data: AdminReview[] = rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }))
    return { data }
  })
}

export default adminRoutes
