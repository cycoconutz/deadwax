import './env'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify, { type FastifyError } from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import { env, isProd } from './env'
import { getSessionUser, SESSION_COOKIE, type SessionUser } from './lib/session'
import authRoutes from './routes/auth'
import healthRoutes from './routes/health'
import listingRoutes from './routes/listings'

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null
  }
}

const clientDistCandidates = [
  resolve(process.cwd(), '../client/dist'),
  resolve(process.cwd(), 'client/dist'),
]
const clientDist = clientDistCandidates.find((candidate) => existsSync(candidate))

const app = Fastify({
  logger: isProd ? true : { level: 'info', transport: { target: 'pino-pretty' } },
  trustProxy: true,
})

await app.register(cookie, { secret: env.SESSION_SECRET })
await app.register(helmet, { contentSecurityPolicy: false })

app.decorateRequest('user', null)

app.addHook('onRequest', async (request) => {
  request.user = null
  const token = request.cookies[SESSION_COOKIE]
  if (!token) return
  request.user = await getSessionUser(token)
})

await app.register(healthRoutes, { prefix: '/api' })
await app.register(authRoutes, { prefix: '/api' })
await app.register(listingRoutes, { prefix: '/api' })

if (clientDist) {
  await app.register(fastifyStatic, { root: clientDist, index: ['index.html'] })
}

app.setErrorHandler((error: FastifyError, request, reply) => {
  request.log.error(error)
  const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500
  reply.status(status).send({
    error: error.code ?? 'internal_error',
    message: status >= 500 ? 'Something went wrong.' : error.message,
  })
})

app.setNotFoundHandler((request, reply) => {
  if (clientDist && request.method === 'GET' && !request.url.startsWith('/api')) {
    return reply.sendFile('index.html')
  }
  reply.status(404).send({
    error: 'not_found',
    message: `No route for ${request.method} ${request.url}`,
  })
})

async function start(): Promise<void> {
  try {
    await app.listen({ port: env.PORT, host: isProd ? '0.0.0.0' : '127.0.0.1' })
    if (clientDist) app.log.info(`Serving client from ${clientDist}`)
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

await start()
