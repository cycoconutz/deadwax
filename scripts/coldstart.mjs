#!/usr/bin/env node
/**
 * Measures time to first byte for a cold host. Free tiers sleep, so a demo
 * that takes 20 seconds to answer is a demo nobody sees.
 *
 *   node scripts/coldstart.mjs https://deadwax-exee.onrender.com 3 120
 *
 * Arguments: url, samples (default 3), seconds between samples (default 60).
 */
const url = process.argv[2]
const samples = Number(process.argv[3] ?? 3)
const gapSeconds = Number(process.argv[4] ?? 60)

if (!url) {
  console.error('usage: node scripts/coldstart.mjs <url> [samples] [gapSeconds]')
  process.exit(1)
}

const target = url.replace(/\/$/, '') + '/api/health'
const results = []

for (let i = 0; i < samples; i++) {
  const started = performance.now()
  let status = 0
  try {
    const response = await fetch(target, { cache: 'no-store' })
    status = response.status
    await response.arrayBuffer()
  } catch {
    status = 0
  }
  const ms = performance.now() - started
  results.push({ status, ms })
  console.log(`sample ${i + 1}: ${status} in ${(ms / 1000).toFixed(2)}s`)

  if (i < samples - 1) {
    await new Promise((resolve) => setTimeout(resolve, gapSeconds * 1000))
  }
}

const warm = results.slice(1)
if (warm.length > 0) {
  const average = warm.reduce((sum, result) => sum + result.ms, 0) / warm.length
  console.log(`warm average: ${(average / 1000).toFixed(2)}s over ${warm.length} samples`)
}
