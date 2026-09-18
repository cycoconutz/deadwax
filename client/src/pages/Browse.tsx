import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CONDITIONS,
  CONDITION_LABELS,
  GENRES,
  type SortOption,
} from '@deadwax/shared'
import ListingCard from '../components/ListingCard'
import { useListings, type ListingFilters } from '../lib/listings'

const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Newest arrivals',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  year_asc: 'Year: oldest first',
  year_desc: 'Year: newest first',
}

function numberOrUndefined(value: string | null): number | undefined {
  if (value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [term, setTerm] = useState(searchParams.get('q') ?? '')
  const [minPrice, setMinPrice] = useState(searchParams.get('minPrice') ?? '')
  const [maxPrice, setMaxPrice] = useState(searchParams.get('maxPrice') ?? '')

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, value)
    }
    setSearchParams(next)
  }

  const selectedGenres = (searchParams.get('genre') ?? '').split(',').filter(Boolean)
  const selectedConditions = (searchParams.get('condition') ?? '').split(',').filter(Boolean)

  function toggleMulti(key: 'genre' | 'condition', value: string, current: string[]) {
    const next = new Set(current)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    update({ [key]: [...next].join(','), page: undefined })
  }

  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1)
  const sortParam = searchParams.get('sort')
  const sort: SortOption =
    sortParam === 'price_asc' ||
    sortParam === 'price_desc' ||
    sortParam === 'year_asc' ||
    sortParam === 'year_desc'
      ? sortParam
      : 'newest'

  const filters: ListingFilters = {
    q: searchParams.get('q') ?? undefined,
    genre: searchParams.get('genre') ?? undefined,
    condition: searchParams.get('condition') ?? undefined,
    minPrice: numberOrUndefined(searchParams.get('minPrice')),
    maxPrice: numberOrUndefined(searchParams.get('maxPrice')),
    sort,
    page,
  }

  const listings = useListings(filters)
  const items = listings.data?.data ?? []
  const total = listings.data?.total ?? 0
  const totalPages = listings.data?.totalPages ?? 1
  const currentPage = listings.data?.page ?? page
  const hasFilters = Boolean(
    filters.q || filters.genre || filters.condition || filters.minPrice || filters.maxPrice,
  )

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    update({ q: term.trim() || undefined, page: undefined })
  }

  function onPrice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    update({
      minPrice: minPrice || undefined,
      maxPrice: maxPrice || undefined,
      page: undefined,
    })
  }

  function clearAll() {
    setSearchParams(new URLSearchParams())
    setTerm('')
    setMinPrice('')
    setMaxPrice('')
  }

  return (
    <div className="page">
      <section className="browse-head">
        <p className="kicker mono">The crates · {total} records</p>
        <h1 className="browse-title">Browse the shop</h1>
        <form className="search-bar" onSubmit={onSearch} role="search">
          <input
            className="input search-input"
            type="search"
            placeholder="Search artist, title or label…"
            aria-label="Search records"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
          />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
      </section>

      <div className="browse-layout">
        <aside className="filters" aria-label="Filters">
          <div className="filter-group">
            <h2 className="filter-label mono">Genre</h2>
            <div className="chips">
              {GENRES.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  className={selectedGenres.includes(genre) ? 'chip chip-on' : 'chip'}
                  aria-pressed={selectedGenres.includes(genre)}
                  onClick={() => toggleMulti('genre', genre, selectedGenres)}
                >
                  {genre}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <h2 className="filter-label mono">Condition</h2>
            <div className="chips">
              {CONDITIONS.map((condition) => (
                <button
                  key={condition}
                  type="button"
                  className={selectedConditions.includes(condition) ? 'chip chip-on' : 'chip'}
                  aria-pressed={selectedConditions.includes(condition)}
                  title={CONDITION_LABELS[condition]}
                  onClick={() => toggleMulti('condition', condition, selectedConditions)}
                >
                  {condition}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <h2 className="filter-label mono">Price (USD)</h2>
            <form className="price-range" onSubmit={onPrice}>
              <input
                className="input input-sm"
                type="number"
                min={0}
                placeholder="min"
                aria-label="Minimum price"
                value={minPrice}
                onChange={(event) => setMinPrice(event.target.value)}
              />
              <span className="mono">to</span>
              <input
                className="input input-sm"
                type="number"
                min={0}
                placeholder="max"
                aria-label="Maximum price"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
              />
              <button className="btn btn-sm" type="submit">
                Apply
              </button>
            </form>
          </div>

          <div className="filter-group">
            <h2 className="filter-label mono">Sort</h2>
            <select
              className="input"
              aria-label="Sort records"
              value={sort}
              onChange={(event) =>
                update({
                  sort: event.target.value === 'newest' ? undefined : event.target.value,
                  page: undefined,
                })
              }
            >
              {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                <option key={option} value={option}>
                  {SORT_LABELS[option]}
                </option>
              ))}
            </select>
          </div>

          {hasFilters && (
            <button type="button" className="linklike mono" onClick={clearAll}>
              Clear all filters
            </button>
          )}
        </aside>

        <section className="results" aria-live="polite">
          {listings.isPending && <p className="results-note mono">Digging through the crates…</p>}

          {listings.isError && (
            <p className="results-note mono status-bad">
              Could not load records. Is the API running?
            </p>
          )}

          {listings.data && items.length === 0 && (
            <div className="empty">
              <p className="mono">Nothing in the crates matches that.</p>
              {hasFilters && (
                <button type="button" className="btn btn-sm" onClick={clearAll}>
                  Clear filters
                </button>
              )}
            </div>
          )}

          {items.length > 0 && (
            <>
              <div className="results-bar mono">
                <span>
                  Showing {items.length} of {total}
                </span>
                <span>
                  page {currentPage} / {totalPages}
                </span>
              </div>

              <ul className="crate">
                {items.map((listing) => (
                  <li key={listing.id}>
                    <ListingCard listing={listing} />
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <nav className="pager" aria-label="Pagination">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={currentPage <= 1}
                    onClick={() => update({ page: String(currentPage - 1) })}
                  >
                    ← Newer
                  </button>
                  <span className="mono">
                    {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={currentPage >= totalPages}
                    onClick={() => update({ page: String(currentPage + 1) })}
                  >
                    Older →
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
