import { startTracing } from './lib/tracing'
import { env, isProd } from './env'

// Tracing must start before Fastify is loaded so the instrumentation can patch
// it, which is why the app is imported dynamically.
const shutdownTracing = await startTracing()
const { buildApp } = await import('./app')
const { runMigrations } = await import('./db/migrate-runner')

// Tests migrate in their own global setup; every other environment applies
// pending migrations before it starts answering requests.
if (env.NODE_ENV !== 'test') {
  await runMigrations()
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
  void app
    .close()
    .catch(() => undefined)
    .finally(() => shutdownTracing().finally(() => process.exit(0)))
})

await start()
