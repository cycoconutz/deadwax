const DEFAULT_TEST_DATABASE_URL =
  'postgresql://deadwax:deadwax@127.0.0.1:5432/deadwax_test'

/**
 * The test database is deliberately separate from the development one so a
 * `npm test` run can truncate tables without touching seeded demo data.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL

/**
 * Applied in `setupFiles`, before any application module is imported.
 * `server/src/env.ts` only reads a .env file when DATABASE_URL is unset, so
 * these values win over a developer's local configuration.
 */
export function applyTestEnv(): void {
  process.env.NODE_ENV = 'test'
  process.env.DATABASE_URL = TEST_DATABASE_URL
  process.env.SESSION_SECRET = 'test-session-secret-at-least-32-chars'
  process.env.PAYMENT_WEBHOOK_SECRET = 'whsec_test_only'
  process.env.PAYMENTS_MODE = 'simulated'
  process.env.STRIPE_SECRET_KEY = 'rkcs_test_unit_test_key'
  process.env.CLIENT_ORIGIN = 'http://localhost:5173'
  // The sweeper is exercised directly in tests, never on a timer.
  process.env.ORDER_SWEEP_INTERVAL_MS = '0'
}
