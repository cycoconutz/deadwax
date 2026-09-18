import { Link, useParams } from 'react-router-dom'
import { CONDITION_LABELS, formatPrice } from '@deadwax/shared'
import Sleeve from '../components/Sleeve'
import { useListing } from '../lib/listings'

function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" aria-label={`${rating} out of 5`}>
      {'★'.repeat(rating)}
      {'☆'.repeat(Math.max(0, 5 - rating))}
    </span>
  )
}

export default function ListingDetail() {
  const { id } = useParams()
  const listingId = Number(id)
  const validId = Number.isInteger(listingId) && listingId > 0
  const query = useListing(validId ? listingId : undefined)

  if (validId && query.isPending) {
    return (
      <div className="page">
        <p className="results-note mono">Spinning up…</p>
      </div>
    )
  }

  if (!validId || query.isError || !query.data) {
    return (
      <div className="page">
        <div className="state">
          <p className="kicker mono">404</p>
          <h1 className="state-title">Needle skipped</h1>
          <p>That record is not in the shop.</p>
          <Link className="btn" to="/">
            Back to the crates
          </Link>
        </div>
      </div>
    )
  }

  const { listing, reviews } = query.data

  return (
    <div className="page">
      <Link to="/" className="mono back-link">
        ← Back to the crates
      </Link>

      <article className="detail">
        <div className="detail-sleeve">
          <Sleeve
            src={listing.coverImageUrl || undefined}
            title={listing.title}
            artist={listing.artist}
            large
          />
        </div>

        <div className="detail-info">
          <p className="kicker mono">
            {listing.genre} · {listing.condition}
          </p>
          <h1 className="detail-title">{listing.title}</h1>
          <p className="detail-artist">{listing.artist}</p>

          {listing.ratingAverage !== null && listing.ratingAverage !== undefined && (
            <p className="detail-rating mono">
              <Stars rating={Math.round(listing.ratingAverage)} />{' '}
              {listing.ratingAverage.toFixed(1)} · {listing.reviewCount}{' '}
              {listing.reviewCount === 1 ? 'review' : 'reviews'}
            </p>
          )}

          <p className="detail-price">{formatPrice(listing.priceCents)}</p>

          <dl className="specs">
            <div>
              <dt className="mono">Label</dt>
              <dd>{listing.label || '—'}</dd>
            </div>
            <div>
              <dt className="mono">Catalogue</dt>
              <dd>{listing.catalogNumber || '—'}</dd>
            </div>
            <div>
              <dt className="mono">Year</dt>
              <dd>{listing.releaseYear ?? '—'}</dd>
            </div>
            <div>
              <dt className="mono">Grade</dt>
              <dd>
                {listing.condition} — {CONDITION_LABELS[listing.condition]}
              </dd>
            </div>
            <div>
              <dt className="mono">Seller</dt>
              <dd>{listing.sellerName}</dd>
            </div>
            <div>
              <dt className="mono">Stock</dt>
              <dd>{listing.stock > 0 ? `${listing.stock} on hand` : 'Sold out'}</dd>
            </div>
          </dl>

          {listing.description && <p className="detail-desc">{listing.description}</p>}

          <button
            className="btn buy-btn"
            type="button"
            disabled
            title="Cart and checkout arrive in the next build"
          >
            Add to cart
          </button>
          <p className="mono detail-note">Cart and checkout arrive next.</p>
        </div>
      </article>

      <section className="reviews">
        <h2 className="section-label mono">
          Reviews {reviews.length > 0 ? `(${reviews.length})` : ''}
        </h2>
        {reviews.length === 0 && (
          <p className="mono reviews-empty">No reviews yet — grab the record first.</p>
        )}
        <ul className="review-list">
          {reviews.map((review) => (
            <li key={review.id} className="review">
              <div className="review-head mono">
                <Stars rating={review.rating} />
                <span className="review-buyer">{review.buyerName}</span>
                <time dateTime={review.createdAt}>
                  {new Date(review.createdAt).toLocaleDateString()}
                </time>
              </div>
              {review.body && <p className="review-body">{review.body}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
