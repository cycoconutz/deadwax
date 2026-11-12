import { buildApp } from './app'
import { env, isProd } from './env'

const app = await buildApp()

async function start(): Promise<void> {
  try {
    await app.listen({ port: env.PORT, host: isProd ? '0.0.0.0' : '127.0.0.1' })
  } catch (error) {
    app.log.error(error)
    process.exit(1)
  }
}

await start()
