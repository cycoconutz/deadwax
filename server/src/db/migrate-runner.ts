import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db } from './index'

/**
 * Applies pending migrations at boot.
 *
 * A deploy that ships code ahead of its schema is a deploy that answers 500 on
 * every new query, which is exactly what happened the first time this project
 * shipped the admin panels. The migrator is idempotent, so running it on every
 * start costs a few milliseconds when the schema is already current.
 *
 * The folder is looked up relative to the working directory because the built
 * server can be started from the repo root or from `server/`.
 */
export async function runMigrations(): Promise<void> {
  const folder = [
    resolve(process.cwd(), 'drizzle'),
    resolve(process.cwd(), 'server/drizzle'),
  ].find((candidate) => existsSync(candidate))

  if (!folder) {
    console.warn('No drizzle migrations folder found; skipping migrations')
    return
  }

  await migrate(db, { migrationsFolder: folder })
}
