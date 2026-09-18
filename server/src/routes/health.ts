import type { FastifyPluginAsync } from 'fastify'
import { sql } from 'drizzle-orm'
import { db } from '../db/index'

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    let database = 'up'
    try {
      await db.execute(sql`select 1`)
    } catch {
      database = 'down'
    }
    return { status: 'ok', database, time: new Date().toISOString() }
  })
}

export default healthRoutes
