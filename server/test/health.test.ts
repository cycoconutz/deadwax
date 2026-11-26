import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { markMigrationsApplied, markMigrationsPending } from '../src/db/migrate-runner'
import { makeApp, resetDb } from './helpers'

let app: FastifyInstance

beforeAll(async () => {
  await resetDb()
  app = await makeApp()
})

afterAll(async () => {
  await app.close()
})

describe('GET /api/health', () => {
  it('reports the process and the database as up', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'ok',
      database: 'up',
      migrations: 'applied',
    })
  })

  it('lets other origins load this route and no other', async () => {
    const health = await app.inject({ method: 'GET', url: '/api/health' })
    const other = await app.inject({ method: 'GET', url: '/api/listings' })

    expect(health.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(health.headers['x-content-type-options']).toBe('nosniff')
    expect(health.headers['strict-transport-security']).toBeDefined()
    expect(other.headers['cross-origin-resource-policy']).toBe('same-origin')
  })

  it('reports degraded when the schema is not applied', async () => {
    markMigrationsPending()
    try {
      const response = await app.inject({ method: 'GET', url: '/api/health' })

      expect(response.statusCode).toBe(503)
      expect(response.json()).toMatchObject({
        status: 'degraded',
        database: 'up',
        migrations: 'pending',
      })
    } finally {
      markMigrationsApplied()
    }
  })
})
