import type { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { db } from '../db/index'
import { migrationsApplied } from '../db/migrate-runner'

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_request, reply) => {
    let database: 'up' | 'down' = 'up'
    try {
      await db.execute(sql`select 1`)
    } catch {
      database = 'down'
    }

    const migrations = migrationsApplied() ? 'applied' : 'pending'
    const healthy = database === 'up' && migrations === 'applied'
    if (!healthy) {
      reply.status(503)
    }

    return {
      status: healthy ? 'ok' : 'degraded',
      database,
      migrations,
      time: new Date().toISOString(),
    }
  })
}

export default healthRoutes
