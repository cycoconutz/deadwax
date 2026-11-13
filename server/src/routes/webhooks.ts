import type { FastifyPluginAsync } from 'fastify'
import type Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { env, isProd } from '../env'
import { db } from '../db/index'
import { webhookEvents } from '../db/schema'
import { confirmPaymentInTx } from '../lib/payment'
import { getStripe } from '../lib/stripe'

declare module 'fastify' {
  interface FastifyRequest {
    /** The exact bytes received, needed for signature verification. */
    rawBody?: Buffer
  }
}

const webhookRoutes: FastifyPluginAsync = async (app) => {
  // Scoped to this plugin. Fastify's parsers are encapsulated, so the rest of
  // the API still receives parsed objects while this route keeps the raw bytes
  // the signature was computed over.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const raw = body as Buffer
    request.rawBody = raw
    try {
      done(null, JSON.parse(raw.toString('utf8')))
    } catch (error) {
      done(error as Error, undefined)
    }
  })

  app.post('/webhooks/stripe', async (request, reply) => {
    if (env.PAYMENTS_MODE !== 'stripe') {
      return reply.status(503).send({
        error: 'stripe_disabled',
        message: 'Stripe webhooks are disabled while PAYMENTS_MODE is simulated.',
      })
    }

    const signature = request.headers['stripe-signature']
    if (typeof signature !== 'string' || !request.rawBody) {
      return reply.status(400).send({
        error: 'invalid_signature',
        message: 'Missing Stripe signature.',
      })
    }

    let event: Stripe.Event
    try {
      event = getStripe().webhooks.constructEvent(
        request.rawBody,
        signature,
        env.PAYMENT_WEBHOOK_SECRET,
      )
    } catch (error) {
      request.log.warn({ err: error }, 'rejected a Stripe webhook with a bad signature')
      return reply.status(400).send({
        error: 'invalid_signature',
        message: 'Signature verification failed.',
      })
    }

    // The event row and the state change commit together. A crash in between
    // leaves neither, so Stripe's retry is treated as new work rather than a
    // duplicate of work that never happened.
    let result: { duplicate: boolean; outcome?: string }
    try {
      result = await db.transaction(async (tx) => {
        const inserted = await tx
          .insert(webhookEvents)
          .values({
            provider: 'stripe',
            providerEventId: event.id,
            type: event.type,
            payload: event,
          })
          .onConflictDoNothing()
          .returning({ id: webhookEvents.id })

        const row = inserted[0]
        if (!row) return { duplicate: true as const }

        let outcome = 'ignored'
        if (event.type === 'payment_intent.succeeded') {
          const intent = event.data.object as Stripe.PaymentIntent
          const orderId = Number(intent.metadata?.orderId)
          outcome =
            Number.isInteger(orderId) && orderId > 0
              ? await confirmPaymentInTx(tx, orderId, { providerRef: intent.id })
              : 'no_order'
        }

        await tx
          .update(webhookEvents)
          .set({ processedAt: new Date(), outcome })
          .where(eq(webhookEvents.id, row.id))

        return { duplicate: false as const, outcome }
      })
    } catch {
      // Deliberately not logging the error object: database errors embed the
      // row parameters in their message, and the row carries the whole event,
      // including the payment intent's client secret.
      request.log.error({ eventId: event.id, type: event.type }, 'webhook processing failed')
      return reply.status(500).send({
        error: 'processing_failed',
        message: 'Could not process the event.',
      })
    }

    return reply.status(200).send({ received: true, ...result })

    return reply.status(200).send({ received: true, ...result })
  })

  // Fail at boot rather than at the first payment when the mode is on but the
  // keys are not.
  if (env.PAYMENTS_MODE === 'stripe') {
    getStripe()
    if (isProd && env.PAYMENT_WEBHOOK_SECRET === 'dev-webhook-secret') {
      throw new Error('PAYMENT_WEBHOOK_SECRET must be set when PAYMENTS_MODE=stripe')
    }
  }
}

export default webhookRoutes
