#!/usr/bin/env node
/**
 * Open-loop load generator: fires requests at a target rate and reports the
 * latency distribution. No dependencies, so anyone cloning the repo can rerun
 * the numbers in the README.
 *
 *   node scripts/load.mjs --url http://127.0.0.1:3001 --rate 50 --seconds 30
 */
const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
}

const base = (args.get('url') ?? 'http://127.0.0.1:3001').replace(/\/$/, '')
const rate = Number(args.get('rate') ?? 50)
const seconds = Number(args.get('seconds') ?? 30)
const maxInFlight = Number(args.get('inflight') ?? 50)

const paths = [
  '/api/health',
  '/api/listings?pageSize=24&sort=newest',
  '/api/listings?pageSize=24&sort=price_asc',
  '/api/listings?q=blue',
]

const durations = []
const statuses = new Map()
let dispatched = 0
let inFlight = 0
let failures = 0

const planned = Math.floor(rate * seconds)

function record(status, ms) {
  durations.push(ms)
  statuses.set(status, (statuses.get(status) ?? 0) + 1)
  if (status >= 400) failures += 1
}

async function fire() {
  const path = paths[dispatched % paths.length]
  const started = performance.now()
  inFlight += 1
  try {
    const response = await fetch(base + path)
    await response.arrayBuffer()
    record(response.status, performance.now() - started)
  } catch {
    record(0, performance.now() - started)
  } finally {
    inFlight -= 1
  }
}

const pending = []

async function main() {
  const health = await fetch(base + '/api/health').catch(() => null)
  if (!health?.ok) {
    console.error(`No server at ${base}. Start it first.`)
    process.exit(1)
  }

  console.log(`${base}  target ${rate} rps for ${seconds}s  max ${maxInFlight} in flight`)

  // Schedule against absolute time and catch up in batches. Sleeping for
  // 1000/rate between requests loses to the 15ms Windows timer and quietly
  // measures the generator instead of the server.
  const started = performance.now()
  const deadline = started + seconds * 1000

  while (true) {
    const elapsedMs = performance.now() - started
    const due = Math.min(Math.floor((elapsedMs / 1000) * rate), planned)

    while (dispatched < due && inFlight < maxInFlight) {
      dispatched += 1
      pending.push(fire())
    }

    if (elapsedMs >= seconds * 1000 && dispatched >= due) break
    await new Promise((resolve) => setTimeout(resolve, 5))
  }

  await Promise.all(pending)

  const elapsed = (performance.now() - started) / 1000
  const sorted = [...durations].sort((a, b) => a - b)
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0
  const errorRate = durations.length === 0 ? 0 : (failures / durations.length) * 100

  console.log('')
  console.log(`requests   ${durations.length} of ${planned} planned`)
  console.log(`throughput ${(durations.length / elapsed).toFixed(1)} rps`)
  console.log(
    `latency    p50 ${at(50).toFixed(0)}ms  p95 ${at(95).toFixed(0)}ms  ` +
      `p99 ${at(99).toFixed(0)}ms  max ${(sorted.at(-1) ?? 0).toFixed(0)}ms`,
  )
  console.log(`errors     ${failures} (${errorRate.toFixed(2)}%)`)
  console.log(
    `statuses   ${[...statuses.entries()].map(([status, count]) => `${status}:${count}`).join(' ')}`,
  )
}

await main()
