# DEADWAX

A risograph-print marketplace for vintage vinyl. Browse the crates, filter by genre and
grade, build a cart, check out with a simulated card, and track orders from independent
sellers. Sellers get a dashboard to manage inventory and fulfill orders; admins get a back
office for moderation.

This is the third site in a portfolio series and the first one that is **full-stack**:
a React client, a Fastify API, and a PostgreSQL database — instead of a static page.

## Features

- **Accounts** — email/password auth with server-side sessions (`scrypt` hashes, httpOnly
  cookie). Buyer, seller, and admin roles.
- **Catalog** — 40 seeded records. Full-text search over title/artist/label (Postgres GIN
  index) with an `ILIKE` fallback, multi-genre and condition filters, price range, five
  sort orders, and pagination.
- **Selling** — create and edit listings, manage price/stock, archive and restore.
- **Cart & checkout** — quantity clamping to available stock, a simulated payment step,
  and a transactional checkout that decrements stock and clears the cart.
- **Order management** — buyers see history and receipts; sellers advance each line item
  paid → shipped → delivered, and the order status is derived from its items.
- **Reviews** — buyers can review an item once it is delivered (one review per purchased
  copy); ratings roll up onto every listing.
- **Admin** — platform stats, user directory, listing archive/restore, and review removal.

## Tech stack

| Layer     | Choice                                                            |
| --------- | ----------------------------------------------------------------- |
| Client    | React 19, React Router 7, TanStack Query 5, Vite 6               |
| API       | Fastify 5, Zod 4, `@fastify/cookie`, `@fastify/helmet`            |
| Database  | PostgreSQL, Drizzle ORM, postgres.js                              |
| Shared    | `@deadwax/shared` — Zod schemas, domain constants, API types      |
| Tooling   | TypeScript, tsx, tsup, oxlint                                     |

The client and server share one TypeScript package so validation and domain types stay in
sync. In development Vite proxies `/api` to Fastify; in production Fastify serves the
built client from the same origin, so cookies are first-party with no CORS.

## Layout

```
deadwax/
├─ client/            # React + Vite app (pages, components, query hooks)
│  └─ src/
│     ├─ lib/         # api wrapper + auth/cart/listings/orders/reviews/admin hooks
│     └─ pages/
├─ server/            # Fastify API
│  └─ src/
│     ├─ routes/      # auth, listings, cart, orders, seller, reviews, admin
│     ├─ db/          # schema, migrate, seed, reset, client
│     └─ lib/         # sessions, password hashing
├─ packages/shared/   # @deadwax/shared: schemas, constants, API payload types
└─ scripts/db.ps1     # start/stop the local Postgres instance
```

## Getting started

### Prerequisites

- Node.js 20+ (developed on 22.7)
- PostgreSQL 14+ running on `127.0.0.1:5432`
- On Windows PowerShell, call `npm.cmd` rather than `npm`.

### 1. Install

```bash
npm install
```

### 2. Configure

Copy `.env.example` to `.env` and adjust if needed:

```
DATABASE_URL=postgresql://deadwax:deadwax@127.0.0.1:5432/deadwax_dev
PORT=3001
NODE_ENV=development
SESSION_SECRET=dev-only-change-me-please-32-chars-min
CLIENT_ORIGIN=http://localhost:5173
PAYMENT_WEBHOOK_SECRET=dev-webhook-secret
```

Create the database and role once (adjust to taste):

```bash
psql -U postgres -c "create role deadwax login password 'deadwax';"
psql -U postgres -c "create database deadwax_dev owner deadwax;"
```

There is also a helper for a user-scoped Postgres install. It reads `PG_HOME` and `PG_DATA`
(they default to a local install) and never needs admin rights:

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

`db:seed` is idempotent (it skips if listings already exist). Use `npm run db:reset`
followed by `npm run db:seed` for a clean slate.

### 4. Run

```bash
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:3001 (health check at `/api/health`)

For a production-style run:

```bash
npm run build
npm run start -w server   # serves API + built client on :3001
```

## Demo accounts

All seeded accounts use the password `spinthis33`.

| Role   | Email                          | Notes                                  |
| ------ | ------------------------------ | -------------------------------------- |
| Seller | `groove.merchant@deadwax.test` | 11 listings                            |
| Seller | `needle.drop@deadwax.test`     | 10 listings                            |
| Seller | `basement.tapes@deadwax.test`  | 10 listings                            |
| Seller | `first.pressings@deadwax.test` | 9 listings                             |
| Buyer  | `crate.digger@deadwax.test`    | Has a delivered order with 3 reviews   |
| Admin  | `admin@deadwax.test`           | Access to `/admin`                     |

## Simulated payments

Checkout never talks to a real processor.

- Any card succeeds and is stored as `provider = 'simulated'`.
- Any card number ending in **0002** returns `402 payment_declined`.

Use `4242 4242 4242 4242` for a successful order.

## Scripts

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Run API and client together                  |
| `npm run build`     | Build client and server for production       |
| `npm run typecheck` | Type-check both workspaces                   |
| `npm run lint`      | oxlint both workspaces                       |
| `npm run db:generate` | Generate a Drizzle migration               |
| `npm run db:migrate`  | Apply migrations                           |
| `npm run db:seed`     | Seed sellers, listings, and demo activity  |
| `npm run db:reset`    | Truncate all tables                        |

## API overview

All routes are prefixed with `/api`.

- `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`
- `GET /listings` (search/filter/sort/paginate), `GET /listings/:id`, `GET /listings/mine`
- `POST /listings`, `PATCH /listings/:id`, `DELETE /listings/:id` (archive)
- `GET /cart`, `POST /cart`, `PATCH /cart/:listingId`, `DELETE /cart/:listingId`
- `POST /checkout`, `GET /orders`, `GET /orders/:id`
- `GET /seller/summary`, `GET /seller/orders`, `PATCH /seller/orders/items/:itemId`
- `POST /reviews`, `GET /reviews/eligible`, `DELETE /reviews/:id`
- `GET /admin/summary`, `GET /admin/users`, `GET /admin/listings`, `GET /admin/reviews`

## Design

Risograph zine: paper `#f4efe6`, ink `#16130f`, spot red `#e5402f`, spot blue `#2442c8`,
and yellow `#f2b636`. Type is Anton for display, Work Sans for body, and IBM Plex Mono for
labels and prices. Sleeve artwork is generated deterministically from each record's artist
and title, so the catalog looks hand-printed without shipping any image assets.

## Notes

- This project is intended to run locally as a portfolio piece; there is no hosted demo.
- Sessions are stored in Postgres, so `db:reset` also signs everyone out.
