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
})

export const env = envSchema.parse(process.env)
export const isProd = env.NODE_ENV === 'production'
