import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import { TEST_DATABASE_URL } from './test-env'

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url))

function databaseName(url: string): string {
  const name = new URL(url).pathname.replace(/^\//, '')
  if (!name) throw new Error(`No database name in ${url}`)
  return name
}

/**
 * A safety catch. The setup below drops the public schema, so it must never
 * run against anything that is not obviously a scratch database.
 */
function assertScratchDatabase(url: string): void {
  const name = databaseName(url)
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to reset "${name}": TEST_DATABASE_URL must point at a database ending in _test.`,
    )
  }
}

/**
 * Creates the test database when it is missing. If the role cannot create
 * databases, this fails with a message that says what to run instead.
 */
async function ensureDatabase(url: string): Promise<void> {
  const parsed = new URL(url)
  const name = databaseName(url)
  parsed.pathname = '/postgres'

  const admin = postgres(parsed.toString(), { max: 1, onnotice: () => {} })
  try {
    const rows = await admin`select 1 from pg_database where datname = ${name}`
    if (rows.length > 0) return
    const safeName = name.replace(/"/g, '')
    await admin.unsafe(`create database "${safeName}"`)
  } catch (error) {
    throw new Error(
      `Could not create the test database "${name}". Create it once, then rerun:\n` +
        `  createdb -U deadwax ${name}\n` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`,
    )
  } finally {
    await admin.end({ timeout: 5 })
  }
}

export default async function globalSetup(): Promise<void> {
  assertScratchDatabase(TEST_DATABASE_URL)
  await ensureDatabase(TEST_DATABASE_URL)

  const client = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    // Rebuild from nothing on every run. This wipes the wreckage a failed test
    // can leave behind and proves the whole migration chain still applies.
    await client.unsafe(`
      drop schema if exists public cascade;
      drop schema if exists drizzle cascade;
      create schema public;
    `)
    await migrate(drizzle(client), { migrationsFolder })
  } finally {
    await client.end({ timeout: 5 })
  }
}
