import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { client, db } from './index'

async function main() {
  await migrate(db, { migrationsFolder: 'drizzle' })
  await client.end()
  console.log('Migrations complete.')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
