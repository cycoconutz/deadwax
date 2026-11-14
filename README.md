# DEADWAX

A risograph-print marketplace for vintage vinyl. Browse the crates, filter by genre and
grade, build a cart, pay with a real Stripe test payment, and track orders from independent
sellers. Sellers get a dashboard to manage inventory and fulfill orders; admins get a back
office for moderation plus the payment plumbing: webhook events, the delivery queue and the
dead letters.

## How I know it works

| Claim | Evidence | How to rerun |
| --- | --- | --- |
| One copy cannot be sold twice | 20 buyers race for the last record: 1 succeeds, 19 get 409, stock lands on 0 | `npm test -t oversell` |
| A webhook is processed once | 5 deliveries of the same event: 1 processed, 4 duplicates, 1 event row, 1 payment | `npm run test:webhook` |
| A failed message is retried and then parked | 5 attempts with exponential backoff, then dead letter, 0 delivered | `npm test -t outbox` |
| The order and its receipt cannot disagree | the receipt and the seller notice are written in the payment transaction | `npm test -t "transactional outbox"` |
| Checkout is traceable end to end | one trace covers order creation, the stock claim and the confirmation; the response carries `x-trace-id` | `npm test -t tracing` |
| The API holds a load | 1,500 requests at 50 rps: p95 5 ms, p99 13 ms, 0 errors. 3,000 at 200 rps: p95 7 ms, p99 16 ms | `npm run load -- --rate 50 --seconds 30` |

Numbers measured on 2026-11-13 on a Windows machine with Postgres on the same host, against
the production build. `npm run load` reports the distribution and refuses to guess.

The hosted demo sleeps on a free tier. A cold request took **32.75 s**; a warm one takes
**0.13 s**, which is why `.github/workflows/keepalive.yml` pings `/api/health` every ten
minutes.

## Features

- **Accounts**: email/password auth with server-side sessions (`scrypt` hashes, httpOnly
  cookie). Buyer, seller, and admin roles.
- **Catalog**: 43 seeded records. Full-text search over title/artist/label with an `ILIKE`
  fallback, multi-genre and condition filters, price range, five sort orders, pagination.
- **Selling**: create and edit listings, manage price/stock, archive and restore.
- **Checkout**: Stripe Payment Element in test mode, or a simulated provider when no keys
  are configured. Stock is claimed with a conditional update, so concurrent buyers cannot
  oversell the last copy.
- **Order state**: an order is `pending` until money is confirmed, then `paid`, then
  `shipped` and `delivered` as each seller fulfills their line items. Unpaid orders are
  cancelled after thirty minutes and their stock is released.
- **Webhooks**: signature verification over the raw body, an event log keyed by provider
  event id, and idempotent handling, so a replay changes nothing.
- **Delivery**: a transactional outbox with exponential backoff and dead letters. No email
  provider is wired; delivered messages land in `mail_outbox` so you can read exactly what
  would have been sent.
- **Observability**: OpenTelemetry spans across checkout, the webhook and the worker, with
  the trace id on the response and in the logs. Off unless an OTLP endpoint is set.
- **Reviews**: buyers can review an item once it is delivered (one review per purchased
  copy); ratings roll up onto every listing.
- **Admin**: platform stats, user directory, listing moderation, review removal, and the
  Webhooks, Jobs and Mail panels.

## Tech stack

| Layer | Choice |
| --- | --- |
| Client | React 19, React Router 7, TanStack Query 5, Vite 6, Stripe Elements |
| API | Fastify 5, Zod 4, `@fastify/cookie`, `@fastify/helmet` |
| Payments | Stripe SDK 23, PaymentIntents, signed webhooks |
| Database | PostgreSQL, Drizzle ORM, postgres.js |
| Ops | OpenTelemetry, GitHub Actions, Docker-free deploy on Render |
| Shared | `@deadwax/shared`: Zod schemas, domain constants, API types |
| Tooling | TypeScript, tsx, tsup, oxlint, Vitest |

The client and server share one TypeScript package so validation and domain types stay in
sync. In development Vite proxies `/api` to Fastify; in production Fastify serves the built
client from the same origin, so cookies are first-party with no CORS.

## The checkout, and why it looks like this

```
POST /checkout
  read the cart, check availability
  BEGIN
    insert order (pending) + line items (pending) + payment (requires_payment)
    claim stock: update listings set stock = stock - n
                 where id = ... and status = 'active' and stock >= n
    delete the cart
  COMMIT
  simulated: confirm now     stripe: create PaymentIntent, return its client secret
```

Three decisions carry the weight:

1. **Stock is claimed, not decremented.** The first version wrote `stock - quantity`
   blindly. Twenty buyers racing for one copy produced twenty orders and negative stock.
   The fix is the `stock >= quantity` predicate in the `where` clause: if another checkout
   got there first, no row matches, the transaction rolls back, and the buyer is told the
   record is gone. A `stock >= 0` check constraint backs it up.
2. **Pending is a real state.** An order is not paid until money is confirmed, so an
   abandoned checkout is a recoverable state rather than a hole. A sweeper cancels stale
   orders and returns their stock.
3. **The webhook is the only confirmation path.** The simulated provider calls the same
   `confirmPayment` function the webhook does, so there is one transition to paid, and the
   event that caused it is recorded in the same transaction.

## Payments

The demo runs in `PAYMENTS_MODE=simulated` by default, so a clone with no keys still works:
any card succeeds, and a card ending in `0002` is declined.

To use Stripe test mode:

1. Create a sandbox and copy its keys into `server/.env`:

   ```
   PAYMENTS_MODE=stripe
   STRIPE_SECRET_KEY=sk_test_...        # or rkcs_test_... from a claimable sandbox
   PAYMENT_WEBHOOK_SECRET=whsec_...     # printed by `stripe listen`
   ```

2. Put the publishable key in `client/.env`:

   ```
   VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
   ```

3. Forward events while developing:

   ```bash
   stripe listen --forward-to localhost:3001/api/webhooks/stripe \
     --events payment_intent.succeeded,payment_intent.payment_failed
   ```

4. Pay with `4242 4242 4242 4242` (any future expiry, any CVC). `4000 0000 0000 0002`
   declines.

Card data never touches this server. Elements posts straight to Stripe, and the API only
accepts the shipping details in this mode.

## Layout

```
deadwax/
├─ client/            # React + Vite app (pages, components, query hooks)
│  └─ src/
│     ├─ lib/         # api wrapper + auth/cart/listings/orders/reviews/admin/payments
│     └─ pages/
├─ server/            # Fastify API
│  ├─ src/
│  │  ├─ routes/      # auth, listings, cart, orders, seller, reviews, admin, webhooks
│  │  ├─ db/          # schema, migrations, seed, reset, client
│  │  └─ lib/         # checkout, payment, outbox, tracing, sessions, hashing
│  ├─ test/           # Vitest suites against a real Postgres
│  └─ drizzle/        # generated SQL migrations
├─ packages/shared/   # @deadwax/shared: schemas, constants, API payload types
└─ scripts/           # db.ps1, load.mjs, coldstart.mjs
```

## Getting started

### Prerequisites

- Node.js 22
- PostgreSQL 14+ on `127.0.0.1:5432`
- Optional: the Stripe CLI for local webhook forwarding

### 1. Install

```bash
npm install
```

### 2. Configure

Copy `.env.example` to `.env` in the repo root (or `server/.env`, which is read first) and
adjust:

```
DATABASE_URL=postgresql://deadwax:deadwax@127.0.0.1:5432/deadwax_dev
PORT=3001
NODE_ENV=development
SESSION_SECRET=dev-only-change-me-please-32-chars-min
CLIENT_ORIGIN=http://localhost:5173
PAYMENTS_MODE=simulated
PAYMENT_WEBHOOK_SECRET=dev-webhook-secret
```

Create the database and role once:

```bash
psql -U postgres -c "create role deadwax login password 'deadwax';"
psql -U postgres -c "create database deadwax_dev owner deadwax;"
```

A helper for a user-scoped Postgres install reads `PG_HOME` and `PG_DATA`:

```bash
npm run db:start     # start Postgres
npm run db:status    # is it up?
npm run db:stop
```

### 3. Migrate and seed

```bash
npm run db:migrate
npm run db:seed
```

`db:seed` is idempotent. Use `npm run db:reset` then `db:seed` for a clean slate.

### 4. Run

```bash
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:3001 (health at `/api/health`)

Production-style:

```bash
npm run build
npm run start -w server
```

## Tests

The suite runs against a real Postgres database named `deadwax_test`. It creates the
database if missing, rebuilds the schema from the migration chain on every run, and refuses
to touch a database whose name does not end in `_test`.

```bash
npm test              # all suites
npm run test:webhook  # the replay proof, with a printed summary
npm run test:watch
```

CI runs lint, typecheck, tests and the production build on every push, against a Postgres
service container.

## Demo accounts

All seeded accounts use the password `spinthis33`.

| Role | Email | Notes |
| --- | --- | --- |
| Seller | `groove.merchant@deadwax.test` | 11 listings |
| Seller | `needle.drop@deadwax.test` | 10 listings |
| Seller | `basement.tapes@deadwax.test` | 10 listings |
| Seller | `first.pressings@deadwax.test` | 9 listings |
| Buyer | `crate.digger@deadwax.test` | A delivered order with 3 reviews |
| Admin | `admin@deadwax.test` | `/admin`, including Webhooks, Jobs and Mail |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run API and client together |
| `npm run build` | Build client and server for production |
| `npm test` | Vitest against `deadwax_test` |
| `npm run test:webhook` | The webhook replay proof, verbose |
| `npm run typecheck` | Type-check both workspaces |
| `npm run lint` | oxlint both workspaces |
| `npm run load` | Open-loop load test (`-- --rate 50 --seconds 30`) |
| `npm run coldstart` | TTFB samples for a hosted URL |
| `npm run db:generate` | Generate a Drizzle migration |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed sellers, listings, and demo activity |
| `npm run db:reset` | Truncate all tables |

## API overview

All routes are prefixed with `/api`.

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /listings` (search/filter/sort/paginate), `GET /listings/:id`, `GET /listings/mine`
- `POST /listings`, `PATCH /listings/:id`, `DELETE /listings/:id` (archive)
- `GET /cart`, `POST /cart`, `PATCH /cart/:listingId`, `DELETE /cart/:listingId`
- `POST /checkout`, `GET /orders`, `GET /orders/:id`
- `GET /payments/config`
- `POST /webhooks/stripe` (signature verified, idempotent)
- `GET /seller/summary`, `GET /seller/orders`, `PATCH /seller/orders/items/:itemId`
- `POST /reviews`, `GET /reviews/eligible`, `DELETE /reviews/:id`
- `GET /admin/summary`, `GET /admin/users`, `GET /admin/listings`, `GET /admin/reviews`
- `GET /admin/webhooks`, `GET /admin/jobs`, `GET /admin/mail`

## Design

Risograph zine: paper `#f4efe6`, ink `#16130f`, spot red `#e5402f`, spot blue `#2442c8`,
and yellow `#f2b636`. Type is Anton for display, Work Sans for body, and IBM Plex Mono for
labels and prices. Sleeve artwork is generated deterministically from each record's artist
and title, so the catalog looks hand-printed without shipping any image assets.

## Notes

- The hosted demo is at https://deadwax-exee.onrender.com. It runs the simulated provider
  unless the Stripe environment variables are set on the host.
- Sessions are stored in Postgres, so `db:reset` also signs everyone out.
- `webhook_events` keeps every accepted event, including ones this app ignores, so a
  reviewer can see what arrived. A replay is answered without a second row.
