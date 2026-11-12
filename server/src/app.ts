import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import fastifyStatic from '@fastify/static'
import { env, isProd } from './env'
import { getSessionUser, SESSION_COOKIE, type SessionUser } from './lib/session'
import { expireStaleOrders } from './lib/payment'
import authRoutes from './routes/auth'
import adminRoutes from './routes/admin'
import cartRoutes from './routes/cart'
import healthRoutes from './routes/health'
import listingRoutes from './routes/listings'
import orderRoutes from './routes/orders'
import reviewRoutes from './routes/reviews'
import sellerRoutes from './routes/seller'

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null
  }
}

export interface BuildAppOptions {
  /**
   * Override logging. Tests pass false so the suite output stays readable.
   */
  logger?: boolean
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const clientDistCandidates = [
    resolve(process.cwd(), '../client/dist'),
    resolve(process.cwd(), 'client/dist'),
  ]
  const clientDist = clientDistCandidates.find((candidate) => existsSync(candidate))

  const app = Fastify({
    logger: options.logger ?? (isProd ? true : { level: 'info', transport: { target: 'pino-pretty' } }),
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
  await app.register(cartRoutes, { prefix: '/api' })
  await app.register(orderRoutes, { prefix: '/api' })
  await app.register(sellerRoutes, { prefix: '/api' })
  await app.register(reviewRoutes, { prefix: '/api' })
  await app.register(adminRoutes, { prefix: '/api' })

  if (env.ORDER_SWEEP_INTERVAL_MS > 0) {
    const sweep = (): void => {
      expireStaleOrders()
        .then((expired) => {
          if (expired > 0) {
            app.log.info({ expired }, 'released stock from abandoned orders')
          }
        })
        .catch((error: unknown) => {
          app.log.error(error, 'order sweep failed')
        })
    }

    // Sweep once at boot. A host that slept through the timer is the exact
    // case this protects against.
    sweep()
    const timer = setInterval(sweep, env.ORDER_SWEEP_INTERVAL_MS)
    timer.unref()
    app.addHook('onClose', async () => {
      clearInterval(timer)
    })
  }

  if (clientDist) {
    await app.register(fastifyStatic, { root: clientDist, index: ['index.html'] })
    app.log.info(`Serving client from ${clientDist}`)
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

  return app
}
