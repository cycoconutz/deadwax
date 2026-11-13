import { sql } from 'drizzle-orm'
import { db, client } from './index'

async function main() {
  await db.execute(sql`
    truncate table
      webhook_events,
      reviews,
      payments,
      order_items,
      orders,
      cart_items,
      listings,
      sessions,
      users
    restart identity cascade
  `)
  console.log('Database reset: all tables truncated.')
  await client.end()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
