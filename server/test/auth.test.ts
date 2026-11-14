import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { authHeaders, makeApp, register, resetDb, sessionCookieHeader } from './helpers'

let app: FastifyInstance

beforeAll(async () => {
  app = await makeApp()
})

afterAll(async () => {
  await app.close()
})

beforeEach(async () => {
  await resetDb()
})

describe('POST /api/auth/register', () => {
  it('creates a buyer and sets an httpOnly session cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'buyer@example.com',
        password: 'correct horse battery staple',
        displayName: 'Ada',
        wantsToSell: false,
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      user: { email: 'buyer@example.com', displayName: 'Ada', role: 'buyer' },
    })

    const setCookie = response.headers['set-cookie']
    const header = Array.isArray(setCookie) ? setCookie[0] : setCookie
    expect(header).toContain('dw_session=')
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
  })

  it('refuses a second account on the same email', async () => {
    await register(app, 'taken@example.com')

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'TAKEN@example.com',
        password: 'correct horse battery staple',
        displayName: 'Impostor',
      },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ error: 'email_taken' })
  })
})

describe('GET /api/auth/me', () => {
  it('resolves the session back to the user', async () => {
    const user = await register(app, 'session@example.com', { displayName: 'Grace' })

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: authHeaders(user),
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      user: { id: user.id, email: 'session@example.com', role: 'buyer' },
    })
  })

  it('returns a null user without a cookie', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/auth/me' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ user: null })
  })
})

describe('POST /api/auth/login', () => {
  it('rejects a wrong password without leaking whether the email exists', async () => {
    await register(app, 'login@example.com')

    const wrong = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'login@example.com', password: 'not the password' },
    })

    expect(wrong.statusCode).toBe(401)
    expect(wrong.json()).toMatchObject({ error: 'invalid_credentials' })
    expect(wrong.headers['set-cookie']).toBeUndefined()
  })

  it('issues a fresh session for the right password', async () => {
    const user = await register(app, 'welcome@example.com', { displayName: 'Linus' })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'welcome@example.com', password: 'correct horse battery staple' },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ user: { id: user.id, displayName: 'Linus' } })
    expect(sessionCookieHeader(response)).toContain('dw_session=')
  })
})
