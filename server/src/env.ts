import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { z } from 'zod'

// An explicit environment always wins. Tests and CI set DATABASE_URL directly
// and must not be redirected by a developer's local .env file.
if (!process.env.DATABASE_URL) {
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
    resolve(process.cwd(), '../../.env'),
  ]
  for (const path of candidates) {
    if (existsSync(path)) {
      process.loadEnvFile(path)
      break
    }
  }
}

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  SESSION_SECRET: z.string().min(16).default('dev-only-change-me-please-32-chars-min'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  PAYMENT_WEBHOOK_SECRET: z.string().default('dev-webhook-secret'),
  // simulated clears a payment inside the checkout request. stripe waits for
  // the provider's webhook, which is the path the live demo uses.
  PAYMENTS_MODE: z.enum(['simulated', 'stripe']).default('simulated'),
  STRIPE_SECRET_KEY: z.string().default(''),
  // How often the payment sweeper looks for abandoned orders. 0 disables the
  // timer, which is what the test suite uses so the suite stays deterministic.
  ORDER_SWEEP_INTERVAL_MS: z.coerce.number().int().min(0).default(300_000),
  // How often the outbox worker looks for messages to deliver. 0 disables it.
  OUTBOX_INTERVAL_MS: z.coerce.number().int().min(0).default(10_000),
  // Tracing is off unless an OTLP endpoint is configured.
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default(''),
  OTEL_SERVICE_NAME: z.string().default('deadwax'),
})

export const env = envSchema.parse(process.env)
export const isProd = env.NODE_ENV === 'production'
