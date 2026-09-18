import type { FastifyPluginAsync } from 'fastify'
import { eq } from 'drizzle-orm'
import { loginSchema, registerSchema } from '@deadwax/shared'
import { db } from '../db/index'
import { users } from '../db/schema'
import { hashPassword, verifyPassword } from '../lib/password'
import {
  clearSessionCookie,
  createSession,
  deleteSession,
  setSessionCookie,
  SESSION_COOKIE,
  type SessionUser,
} from '../lib/session'

let dummyHashPromise: Promise<string> | null = null
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword('timing-equalizer-placeholder')
  return dummyHashPromise
}

function toSessionUser(row: {
  id: number
  email: string
  displayName: string
  role: SessionUser['role']
}): SessionUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
  }
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/me', async (request) => {
    return { user: request.user }
  })

  app.post('/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Please check the form and try again.',
        details: parsed.error.flatten(),
      })
    }

    const { password, displayName, wantsToSell } = parsed.data
    const email = parsed.data.email.trim().toLowerCase()

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (existing.length > 0) {
      return reply.status(409).send({
        error: 'email_taken',
        message: 'That email is already registered.',
      })
    }

    const passwordHash = await hashPassword(password)
    const inserted = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        displayName: displayName.trim(),
        role: wantsToSell ? 'seller' : 'buyer',
      })
      .returning({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: users.role,
      })

    const created = inserted[0]
    if (!created) {
      return reply.status(500).send({
        error: 'internal_error',
        message: 'Could not create the account.',
      })
    }

    const user = toSessionUser(created)
    const { token, expiresAt } = await createSession(user.id)
    setSessionCookie(reply, token, expiresAt)
    return reply.status(201).send({ user })
  })

  app.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'validation_error',
        message: 'Enter your email and password.',
        details: parsed.error.flatten(),
      })
    }

    const email = parsed.data.email.trim().toLowerCase()
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1)
    const found = rows[0]

    const passwordOk = found
      ? await verifyPassword(parsed.data.password, found.passwordHash)
      : await verifyPassword(parsed.data.password, await getDummyHash())

    if (!found || !passwordOk) {
      return reply.status(401).send({
        error: 'invalid_credentials',
        message: 'Email or password is incorrect.',
      })
    }

    const user = toSessionUser(found)
    const { token, expiresAt } = await createSession(user.id)
    setSessionCookie(reply, token, expiresAt)
    return { user }
  })

  app.post('/auth/logout', async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE]
    if (token) await deleteSession(token)
    clearSessionCookie(reply)
    return reply.status(204).send()
  })
}

export default authRoutes
