import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { db } from './index'

/**
 * Whether the schema this process serves is known to be applied.
 *
 * Defaults to `true`: the entry point applies migrations before it listens,
 * and the test suite migrates in its own global setup, so anything that is
 * answering requests is serving an applied schema unless a boot attempt
 * failed. When one does, the entry point marks it pending, /api/health
 * reports degraded, and the retry loop marks it applied again on recovery.
 */
let applied = true

export function migrationsApplied(): boolean {
  return applied
}

export function markMigrationsPending(): void {
  applied = false
}

export function markMigrationsApplied(): void {
  applied = true
}

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
    // A missing folder is a broken deploy, not a skip: the schema this process
    // serves is unknown, so it must take the degraded path instead of
    // reporting healthy while every query 500s.
    throw new Error(
      `No drizzle migrations folder found (looked for drizzle/ and server/drizzle/ under ${process.cwd()})`,
    )
  }

  await migrate(db, { migrationsFolder: folder })
}
