import { randomUUID } from 'node:crypto'
import { eq, inArray, sql } from 'drizzle-orm'
import { db, client } from './index'
import { listings, orderItems, orders, payments, reviews, users } from './schema'
import { hashPassword } from '../lib/password'
import { shippingFlatCents, type Condition, type Genre, type Role } from '@deadwax/shared'

interface SeedAccount {
  email: string
  displayName: string
  password: string
  role: Role
}

interface SeedListing {
  seller: number
  title: string
  artist: string
  label: string
  catalogNumber: string
  releaseYear: number
  genre: Genre
  condition: Condition
  priceCents: number
  stock: number
  note: string
}

const SELLERS: SeedAccount[] = [
  { email: 'groove.merchant@deadwax.test', displayName: 'Groove Merchant', password: 'spinthis33', role: 'seller' },
  { email: 'needle.drop@deadwax.test', displayName: 'Needle Drop Records', password: 'spinthis33', role: 'seller' },
  { email: 'basement.tapes@deadwax.test', displayName: 'Basement Tapes', password: 'spinthis33', role: 'seller' },
  {
    email: 'first.pressings@deadwax.test',
    displayName: 'First Pressings Only',
    password: 'spinthis33',
    role: 'seller',
  },
  {
    email: 'both.sides@deadwax.test',
    displayName: 'Both Sides',
    password: 'spinthis33',
    role: 'seller',
  },
]

const ADMIN: SeedAccount = {
  email: 'admin@deadwax.test',
  displayName: 'Deadwax Admin',
  password: 'spinthis33',
  role: 'admin',
}

const DEMO_BUYER: SeedAccount = {
  email: 'crate.digger@deadwax.test',
  displayName: 'Crate Digger',
  password: 'spinthis33',
  role: 'buyer',
}

const LISTINGS: SeedListing[] = [
  { seller: 3, title: 'Kind of Blue', artist: 'Miles Davis', label: 'Columbia', catalogNumber: 'CS 8163', releaseYear: 1959, genre: 'Jazz', condition: 'NM', priceCents: 4500, stock: 1, note: 'Six-eye pressing, deep groove. Vinyl glossy, plays dead quiet. Jacket still in shrink with original price sticker.' },
  { seller: 0, title: 'Bitches Brew', artist: 'Miles Davis', label: 'Columbia', catalogNumber: 'GP 26', releaseYear: 1970, genre: 'Jazz', condition: 'VG+', priceCents: 3200, stock: 1, note: 'Gatefold with the full psychedelic spread. Some shelf wear at corners, discs are clean.' },
  { seller: 2, title: 'Blue Train', artist: 'John Coltrane', label: 'Blue Note', catalogNumber: 'BST 81577', releaseYear: 1958, genre: 'Jazz', condition: 'NM', priceCents: 6800, stock: 1, note: 'Liberty-era stereo reissue. Van Gelder stamp in the deadwax. Practically unplayed.' },
  { seller: 1, title: 'A Love Supreme', artist: 'John Coltrane', label: 'Impulse!', catalogNumber: 'AS-77', releaseYear: 1965, genre: 'Jazz', condition: 'VG+', priceCents: 5400, stock: 1, note: 'Orange and black labels, gatefold intact. Light hairlines that do not affect playback.' },
  { seller: 0, title: 'Head Hunters', artist: 'Herbie Hancock', label: 'Columbia', catalogNumber: 'KC 32731', releaseYear: 1973, genre: 'Jazz', condition: 'VG+', priceCents: 2600, stock: 2, note: 'The funk-jazz crossover record. Sleeve has a small seam split on the bottom, media is solid.' },
  { seller: 1, title: 'Rumours', artist: 'Fleetwood Mac', label: 'Warner Bros.', catalogNumber: 'BSK 3010', releaseYear: 1977, genre: 'Rock', condition: 'VG+', priceCents: 1800, stock: 3, note: 'Palm-tree label pressing. Played but well cared for. Includes original inner sleeve.' },
  { seller: 2, title: 'The Dark Side of the Moon', artist: 'Pink Floyd', label: 'Harvest', catalogNumber: 'SHVL 804', releaseYear: 1973, genre: 'Rock', condition: 'VG', priceCents: 2200, stock: 1, note: 'Solid blue triangle label. Posters and stickers long gone, but the record itself is honest VG.' },
  { seller: 0, title: 'Led Zeppelin IV', artist: 'Led Zeppelin', label: 'Atlantic', catalogNumber: 'SD 7208', releaseYear: 1971, genre: 'Rock', condition: 'VG+', priceCents: 2800, stock: 1, note: 'Unledded cover, winged logo inner. A few scuffs, plays with light surface noise between tracks.' },
  { seller: 3, title: 'Abbey Road', artist: 'The Beatles', label: 'Apple', catalogNumber: 'SO-383', releaseYear: 1969, genre: 'Rock', condition: 'VG', priceCents: 2400, stock: 1, note: 'Green Apple label. Jacket shows ring wear; vinyl has a visible mark on side two that is inaudible.' },
  { seller: 1, title: 'Unknown Pleasures', artist: 'Joy Division', label: 'Factory', catalogNumber: 'FACT 10', releaseYear: 1979, genre: 'Punk', condition: 'NM', priceCents: 4200, stock: 1, note: 'Textured Peter Saville sleeve in remarkable shape. No spindle marks, the blackest of black vinyl.' },
  { seller: 2, title: 'Remain in Light', artist: 'Talking Heads', label: 'Sire', catalogNumber: 'SRK 6095', releaseYear: 1980, genre: 'Rock', condition: 'VG+', priceCents: 1900, stock: 2, note: 'Original pressing with the full lyric inner. Once Bitten, twice shy.' },
  { seller: 0, title: 'London Calling', artist: 'The Clash', label: 'CBS', catalogNumber: 'CLASH 3', releaseYear: 1979, genre: 'Punk', condition: 'VG', priceCents: 2500, stock: 1, note: 'Double LP, Ray Lowry sleeve with the pink/blue lettering. Some corner wear, both discs VG.' },
  { seller: 3, title: "What's Going On", artist: 'Marvin Gaye', label: 'Tamla', catalogNumber: 'TS310', releaseYear: 1971, genre: 'Soul', condition: 'VG+', priceCents: 3600, stock: 1, note: 'Original gatefold with the Detroit skyline spread. Light shelf wear, plays beautifully.' },
  { seller: 1, title: 'Innervisions', artist: 'Stevie Wonder', label: 'Tamla', catalogNumber: 'T326L', releaseYear: 1973, genre: 'Soul', condition: 'NM', priceCents: 3900, stock: 1, note: 'Embossed braille cover, sharp and clean. Still in the original loose bag.' },
  { seller: 2, title: 'Songs in the Key of Life', artist: 'Stevie Wonder', label: 'Tamla', catalogNumber: 'T13-340C2', releaseYear: 1976, genre: 'Soul', condition: 'VG+', priceCents: 3000, stock: 1, note: 'Complete double LP with the bonus 7-inch and lyric booklet. Bonus disc is NM.' },
  { seller: 0, title: 'Back to Black', artist: 'Amy Winehouse', label: 'Island', catalogNumber: '1714211', releaseYear: 2006, genre: 'Soul', condition: 'NM', priceCents: 2800, stock: 2, note: 'Modern classic, 180g pressing. Opened but essentially unplayed.' },
  { seller: 3, title: 'Maggot Brain', artist: 'Funkadelic', label: 'Westbound', catalogNumber: 'WB 2007', releaseYear: 1971, genre: 'Funk', condition: 'VG', priceCents: 3400, stock: 1, note: 'The ten-minute guitar sermon. Sleeve has edge wear, vinyl has some groove wear but still hits.' },
  { seller: 1, title: 'Mothership Connection', artist: 'Parliament', label: 'Casablanca', catalogNumber: 'NBLP 7022', releaseYear: 1975, genre: 'Funk', condition: 'VG+', priceCents: 2400, stock: 1, note: 'Original spaceship gatefold. Includes the printed inner sleeve. Tear the roof off.' },
  { seller: 2, title: 'The Payback', artist: 'James Brown', label: 'Polydor', catalogNumber: 'PD 2-3007', releaseYear: 1973, genre: 'Funk', condition: 'VG', priceCents: 2100, stock: 1, note: 'Double LP. Strong VG, some surface noise on the quiet passages. Priced to move.' },
  { seller: 0, title: 'Illmatic', artist: 'Nas', label: 'Columbia', catalogNumber: 'C 57684', releaseYear: 1994, genre: 'Hip-Hop', condition: 'VG+', priceCents: 3200, stock: 1, note: 'Original press with the full-color inner sleeve. Light sleeve scuffing only.' },
  { seller: 3, title: 'Ready to Die', artist: 'The Notorious B.I.G.', label: 'Bad Boy', catalogNumber: '78612-73000-1', releaseYear: 1994, genre: 'Hip-Hop', condition: 'VG', priceCents: 2900, stock: 1, note: 'Double LP, clean labels. Jacket has a crease near the spine, discs are honest VG.' },
  { seller: 1, title: 'Enter the Wu-Tang (36 Chambers)', artist: 'Wu-Tang Clan', label: 'Loud/RCA', catalogNumber: '66336-1', releaseYear: 1993, genre: 'Hip-Hop', condition: 'VG', priceCents: 2700, stock: 1, note: 'Original yellow/black labels. Rugged but playable, which suits the record.' },
  { seller: 2, title: 'Madvillainy', artist: 'Madvillain', label: 'Stones Throw', catalogNumber: 'STH2065', releaseYear: 2004, genre: 'Hip-Hop', condition: 'NM', priceCents: 4600, stock: 1, note: 'MF DOOM and Madlib at their peak. Both discs flawless, gatefold crisp.' },
  { seller: 0, title: 'Selected Ambient Works 85-92', artist: 'Aphex Twin', label: 'R&S', catalogNumber: 'AMB 3922 LP', releaseYear: 1992, genre: 'Electronic', condition: 'NM', priceCents: 5800, stock: 1, note: 'Belgian original. The blueprint for ambient techno. Clean vinyl, clean sleeve.' },
  { seller: 3, title: 'Music Has the Right to Children', artist: 'Boards of Canada', label: 'Warp', catalogNumber: 'WARP LP 55', releaseYear: 1998, genre: 'Electronic', condition: 'VG+', priceCents: 5200, stock: 1, note: 'Original Warp pressing with the family photo sleeve. Minor creasing, discs excellent.' },
  { seller: 1, title: 'Dummy', artist: 'Portishead', label: 'Go! Beat', catalogNumber: '828 522-1', releaseYear: 1994, genre: 'Electronic', condition: 'VG+', priceCents: 3400, stock: 1, note: 'Trip-hop cornerstone. Sleeve has light storage wear, vinyl plays with full bass weight.' },
  { seller: 2, title: 'Homework', artist: 'Daft Punk', label: 'Virgin', catalogNumber: 'V 2821', releaseYear: 1997, genre: 'Electronic', condition: 'VG+', priceCents: 3800, stock: 1, note: 'Double LP. Around the World still sounds like the future. Some sleeve scuffs, nothing deep.' },
  { seller: 0, title: 'Homogenic', artist: 'Björk', label: 'One Little Indian', catalogNumber: 'TPLP71', releaseYear: 1997, genre: 'Electronic', condition: 'NM', priceCents: 3000, stock: 1, note: 'The volcanic string-and-beats masterpiece. Beautiful shape throughout.' },
  { seller: 3, title: 'The Köln Concert', artist: 'Keith Jarrett', label: 'ECM', catalogNumber: 'ECM 1064/65 ST', releaseYear: 1975, genre: 'Jazz', condition: 'VG+', priceCents: 2600, stock: 1, note: 'Double LP. ECM pressing, previous owner wrote a small date on the back cover.' },
  { seller: 1, title: 'Tapestry', artist: 'Carole King', label: 'Ode', catalogNumber: 'SP 77009', releaseYear: 1971, genre: 'Folk', condition: 'VG', priceCents: 1600, stock: 3, note: 'A well-loved copy. Jacket has a name written on the back, vinyl is a steady VG.' },
  { seller: 2, title: 'Blue', artist: 'Joni Mitchell', label: 'Reprise', catalogNumber: 'MS 2038', releaseYear: 1971, genre: 'Folk', condition: 'VG+', priceCents: 2200, stock: 1, note: 'Textured gatefold sleeve. A few spindle marks, plays clean and intimate.' },
  { seller: 0, title: 'Harvest', artist: 'Neil Young', label: 'Reprise', catalogNumber: 'MS 2032', releaseYear: 1972, genre: 'Folk', condition: 'VG', priceCents: 1800, stock: 2, note: 'Includes the original lyric insert. Sleeve has ring wear; media is honest VG.' },
  { seller: 3, title: 'Catch a Fire', artist: 'Bob Marley and the Wailers', label: 'Island', catalogNumber: 'ILPS 9241', releaseYear: 1973, genre: 'Reggae', condition: 'VG+', priceCents: 3400, stock: 1, note: 'Original zipper sleeve design, intact. Vinyl has light marks, plays strong.' },
  { seller: 1, title: 'Legend', artist: 'Bob Marley and the Wailers', label: 'Island', catalogNumber: '90169-1', releaseYear: 1984, genre: 'Reggae', condition: 'NM', priceCents: 2400, stock: 2, note: 'The compilation everyone should own. Clean vinyl and crisp sleeve.' },
  { seller: 2, title: 'Gunfighter Ballads and Trail Songs', artist: 'Marty Robbins', label: 'Columbia', catalogNumber: 'CS 8158', releaseYear: 1959, genre: 'Country', condition: 'VG+', priceCents: 2000, stock: 1, note: 'El Paso in glorious mono-adjacent stereo. Six-eye label, strong player.' },
  { seller: 0, title: 'Master of Puppets', artist: 'Metallica', label: 'Elektra', catalogNumber: '60439-1', releaseYear: 1986, genre: 'Metal', condition: 'VG+', priceCents: 3200, stock: 1, note: 'Original Elektra pressing. Includes inner sleeve. Light scuffs, plays loud and clean.' },
  { seller: 3, title: 'Nevermind', artist: 'Nirvana', label: 'DGC', catalogNumber: 'DGC-24425', releaseYear: 1991, genre: 'Rock', condition: 'VG+', priceCents: 2600, stock: 2, note: 'Original pressing. Sleeve has minor edge wear; vinyl is glossy with a few paper scuffs.' },
  { seller: 1, title: 'OK Computer', artist: 'Radiohead', label: 'Parlophone', catalogNumber: 'NODATA 02', releaseYear: 1997, genre: 'Rock', condition: 'NM', priceCents: 3600, stock: 1, note: 'Original Parlophone double LP. Barely played, sleeve sharp as new.' },
  { seller: 2, title: 'The Velvet Underground & Nico', artist: 'The Velvet Underground', label: 'Verve', catalogNumber: 'V6-5008', releaseYear: 1967, genre: 'Rock', condition: 'G+', priceCents: 9500, stock: 1, note: 'Peelable banana sleeve, partially peeled and unpeeled on the back. Honest G+ vinyl, priced accordingly.' },
  { seller: 0, title: 'Pet Sounds', artist: 'The Beach Boys', label: 'Capitol', catalogNumber: 'T 2458', releaseYear: 1966, genre: 'Pop', condition: 'VG', priceCents: 4800, stock: 1, note: 'Mono original. Sleeve has a seam split at the top, vinyl is a clean VG with strong playback.' },
  { seller: 4, title: 'The Freewheelin\u2019 Bob Dylan', artist: 'Bob Dylan', label: 'Columbia', catalogNumber: 'CS 8786', releaseYear: 1963, genre: 'Folk', condition: 'VG+', priceCents: 2800, stock: 1, note: 'With the original Mono fold-out insert. Buy-side copy from a moving sale; I grabbed a second for trade.' },
  { seller: 4, title: 'Bridge over Troubled Water', artist: 'Simon & Garfunkel', label: 'Columbia', catalogNumber: 'KCS 9914', releaseYear: 1970, genre: 'Folk', condition: 'VG', priceCents: 1600, stock: 1, note: 'Gatefold with the standing-on-the-curb cover. Inner has a name written in pen; vinyl is steady VG.' },
  { seller: 4, title: 'Another Green World', artist: 'Brian Eno', label: 'Island', catalogNumber: 'ILPS 9351', releaseYear: 1975, genre: 'Electronic', condition: 'NM', priceCents: 3200, stock: 1, note: 'The Birch. Original Island pressing, deep orange labels. Sleeve crisp, vinyl glossy, plays like glass.' },
]

async function upsertAccount(account: SeedAccount): Promise<number> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, account.email))
    .limit(1)
  if (existing[0]) return existing[0].id

  const passwordHash = await hashPassword(account.password)
  const inserted = await db
    .insert(users)
    .values({
      email: account.email,
      displayName: account.displayName,
      passwordHash,
      role: account.role,
    })
    .returning({ id: users.id })

  const row = inserted[0]
  if (!row) throw new Error(`Failed to create account ${account.email}`)
  return row.id
}

const DEMO_REVIEWS: Record<string, { rating: number; body: string }> = {
  Rumours: {
    rating: 5,
    body: 'Arrived fast and packed like a pro. The copy is cleaner than described — no noise at all.',
  },
  'Remain in Light': {
    rating: 4,
    body: 'Great pressing, exactly as graded. Once in a Lifetime never sounded so good.',
  },
  'Back to Black': {
    rating: 5,
    body: 'Mint as promised. This is how online vinyl should be done.',
  },
}

const DEMO_REVIEWS_BOTH: Record<string, { rating: number; body: string }> = {
  'Blue Train': {
    rating: 5,
    body: 'Sonny is clean as advertised. This goes straight into the listening stack — and on the flip wall.',
  },
  'Unknown Pleasures': {
    rating: 4,
    body: 'Textured sleeve in strong shape)Skip. Sealed in a fresh poly, priced to move.',
  },
  'Maggot Brain': {
    rating: 5,
    body: 'The guitar sermon, bought for the shop shelf. Clean as graded, ready to make someone stare at the ceiling.',
  },
}

async function seedDemoActivity(
  buyerId: number,
  reviewMap: Record<string, { rating: number; body: string }>,
  shippingName: string,
): Promise<void> {
  const existing = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.buyerId, buyerId))
    .limit(1)
  if (existing[0]) return

  const titles = Object.keys(reviewMap)
  const rows = await db
    .select({
      id: listings.id,
      sellerId: listings.sellerId,
      title: listings.title,
      artist: listings.artist,
      priceCents: listings.priceCents,
    })
    .from(listings)
    .where(inArray(listings.title, titles))

  if (rows.length !== titles.length) {
    console.log('Demo activity skipped: expected listings not found.')
    return
  }

  const subtotalCents = rows.reduce((sum, row) => sum + row.priceCents, 0)
  const totalCents = subtotalCents + shippingFlatCents

  const insertedOrder = await db
    .insert(orders)
    .values({
      buyerId,
      status: 'delivered',
      subtotalCents,
      shippingCents: shippingFlatCents,
      totalCents,
      shippingName,
      shippingAddress1: '33 RPM Lane',
      shippingCity: 'Detroit',
      shippingRegion: 'MI',
      shippingPostal: '48201',
      shippingCountry: 'US',
    })
    .returning({ id: orders.id })

  const orderId = insertedOrder[0]?.id
  if (!orderId) throw new Error('Failed to create demo order')

  for (const row of rows) {
    const review = reviewMap[row.title]
    if (!review) continue

    const insertedItem = await db
      .insert(orderItems)
      .values({
        orderId,
        listingId: row.id,
        sellerId: row.sellerId,
        titleSnapshot: row.title,
        artistSnapshot: row.artist,
        priceCents: row.priceCents,
        quantity: 1,
        status: 'delivered',
      })
      .returning({ id: orderItems.id })

    const orderItemId = insertedItem[0]?.id
    if (!orderItemId) throw new Error('Failed to create demo order item')

    await db.insert(reviews).values({
      orderItemId,
      listingId: row.id,
      buyerId,
      rating: review.rating,
      body: review.body,
    })

    await db
      .update(listings)
      .set({ stock: sql`${listings.stock} - 1` })
      .where(eq(listings.id, row.id))
  }

  await db.insert(payments).values({
    orderId,
    provider: 'simulated',
    providerRef: `sim_${randomUUID()}`,
    status: 'succeeded',
    amountCents: totalCents,
    cardLast4: '4242',
  })

  console.log(`Seeded demo order #${orderId} with ${rows.length} delivered reviews.`)
}

async function main() {
  const force = process.argv.includes('--force')

  const sellerIds: number[] = []
  for (const seller of SELLERS) {
    sellerIds.push(await upsertAccount(seller))
  }
  await upsertAccount(ADMIN)
  const buyerId = await upsertAccount(DEMO_BUYER)

  const existingRows = await db
    .select({ sellerId: listings.sellerId, title: listings.title })
    .from(listings)
  const existingKeys = new Set(existingRows.map((row) => `${row.sellerId}:${row.title}`))

  if (force) {
    await db.delete(orders)
    await db.delete(listings)
  }

  const rows = LISTINGS.map((listing) => {
    const sellerId = sellerIds[listing.seller]
    if (!sellerId) throw new Error(`Missing seller index ${listing.seller}`)
    return {
      sellerId,
      title: listing.title,
      artist: listing.artist,
      label: listing.label,
      catalogNumber: listing.catalogNumber,
      releaseYear: listing.releaseYear,
      genre: listing.genre,
      condition: listing.condition,
      priceCents: listing.priceCents,
      stock: listing.stock,
      description: listing.note,
      coverImageUrl: '',
      status: 'active' as const,
    }
  })

  const missing = rows.filter((row) => !existingKeys.has(`${row.sellerId}:${row.title}`))
  if (force) {
    await db.insert(listings).values(rows)
    console.log(`Seeded ${rows.length} listings from ${SELLERS.length} sellers.`)
  } else if (missing.length > 0) {
    await db.insert(listings).values(missing)
    console.log(`Seeded ${missing.length} new listings (${rows.length - missing.length} already present).`)
  } else {
    console.log(`Seed up to date: all ${rows.length} listings already present.`)
  }

  await seedDemoActivity(buyerId, DEMO_REVIEWS, DEMO_BUYER.displayName)

  const bothSidesId = sellerIds[4]
  if (!bothSidesId) throw new Error('Missing demo seller "Both Sides"')
  await seedDemoActivity(bothSidesId, DEMO_REVIEWS_BOTH, 'Both Sides')

  await client.end()
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
