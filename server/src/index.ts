import { startTracing } from './lib/tracing'
import { env, isProd } from './env'

// Tracing must start before Fastify is loaded so the instrumentation can patch
// it, which is why the app is imported dynamically.
const shutdownTracing = await startTracing()
const { buildApp } = await import('./app')
const {
  markMigrationsApplied,
  markMigrationsPending,
  runMigrations,
} = await import('./db/migrate-runner')

// A failed boot migration used to exit before the server ever listened, which
// turned a database outage into a crash loop with nothing behind the port; a
// suspended free-tier database took the demo down for days that way. The server
// now starts degraded, reports it on /api/health, and retries in the background
// so a transient outage heals itself on a later attempt.
const MIGRATION_RETRY_MS = 60_000
let migrationRetryTimer: ReturnType<typeof setInterval> | undefined

// Tests migrate in their own global setup; every other environment applies
// pending migrations before it starts answering requests.
if (env.NODE_ENV !== 'test') {
  try {
    await runMigrations()
  } catch (error) {
    markMigrationsPending()
    console.error(
      `boot migrations failed; starting degraded and retrying every ${MIGRATION_RETRY_MS / 1000}s`,
      error,
    )

    const retry = (): void => {
      runMigrations()
        .then(() => {
          markMigrationsApplied()
          console.info('migrations applied; server recovered')
          if (migrationRetryTimer) clearInterval(migrationRetryTimer)
          migrationRetryTimer = undefined
        })
        .catch((retryError: unknown) => {
          console.error('migration retry failed; still serving degraded', retryError)
        })
    }

    migrationRetryTimer = setInterval(retry, MIGRATION_RETRY_MS)
    migrationRetryTimer.unref()
  }
}

const app = await buildApp()

async function start(): Promise<void> {
  try {
    await app.listen({ port: env.PORT, host: isProd ? '0.0.0.0' : '127.0.0.1' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

process.once('SIGTERM', () => {
  if (migrationRetryTimer) clearInterval(migrationRetryTimer)
  void app
    .close()
    .catch(() => undefined)
    .finally(() => shutdownTracing().finally(() => process.exit(0)))
})

await start()
