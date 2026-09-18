import { Link } from 'react-router-dom'
import { formatPrice, type ListingSummary } from '@deadwax/shared'
import { useAuth } from '../lib/auth'
import {
  useAdminListings,
  useAdminReviews,
  useAdminSummary,
  useAdminUsers,
  useArchiveListing,
  useModerateReview,
} from '../lib/admin'
import { useUpdateListing } from '../lib/listings'

function ListingRow({ listing }: { listing: ListingSummary }) {
  const archive = useArchiveListing()
  const update = useUpdateListing(listing.id)
  const busy = archive.isPending || update.isPending

  return (
    <tr className={listing.status === 'archived' ? 'is-archived' : undefined}>
      <td>
        <Link to={`/listings/${listing.id}`} className="admin-title">
          {listing.title}
        </Link>
        <span className="mono admin-sub">{listing.artist}</span>
      </td>
      <td className="mono">{listing.sellerName}</td>
      <td className="mono">{formatPrice(listing.priceCents)}</td>
      <td className="mono">{listing.stock}</td>
      <td>
        <span className={`mini-status mono status-${listing.status}`}>{listing.status}</span>
      </td>
      <td>
        {listing.status === 'active' ? (
          <button
            className="linklike mono"
            type="button"
            disabled={busy}
            onClick={() => archive.mutate(listing.id)}
          >
            Archive
          </button>
        ) : (
          <button
            className="linklike mono"
            type="button"
            disabled={busy}
            onClick={() => update.mutate({ status: 'active' })}
          >
            Restore
          </button>
        )}
      </td>
    </tr>
  )
}

export default function Admin() {
  const { user, isPending } = useAuth()
  const isAdmin = user?.role === 'admin'
  const summary = useAdminSummary(isAdmin)
  const users = useAdminUsers(isAdmin)
  const listings = useAdminListings(isAdmin)
  const reviews = useAdminReviews(isAdmin)
  const moderate = useModerateReview()

  if (isPending) {
    return (
      <div className="page">
        <p className="results-note mono">Checking your account…</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="state">
          <p className="kicker mono">Staff only</p>
          <h1 className="state-title">Admins only</h1>
          <p>This back office is for Deadwax staff.</p>
          <Link className="btn" to="/">
            Back to the crates
          </Link>
        </div>
      </div>
    )
  }

  const stats = summary.data
  const userList = users.data?.data ?? []
  const listingList = listings.data?.data ?? []
  const reviewList = reviews.data?.data ?? []

  return (
    <div className="page">
      <p className="kicker mono">Back office</p>
      <h1 className="browse-title">Admin</h1>

      <div className="stat-grid">
        <div className="stat">
          <span className="mono">Users</span>
          <strong>{stats ? stats.users : '—'}</strong>
        </div>
        <div className="stat">
          <span className="mono">Sellers</span>
          <strong>{stats ? stats.sellers : '—'}</strong>
        </div>
        <div className="stat">
          <span className="mono">Active listings</span>
          <strong>{stats ? stats.activeListings : '—'}</strong>
        </div>
        <div className="stat">
          <span className="mono">Orders</span>
          <strong>{stats ? stats.orders : '—'}</strong>
        </div>
        <div className="stat">
          <span className="mono">Gross sales</span>
          <strong>{stats ? formatPrice(stats.grossSalesCents) : '—'}</strong>
        </div>
        <div className="stat">
          <span className="mono">Reviews</span>
          <strong>{stats ? stats.reviews : '—'}</strong>
        </div>
      </div>

      <section className="panel">
        <h2 className="section-label mono">Listings ({listingList.length})</h2>
        {listings.isPending && <p className="mono">Loading listings…</p>}
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Seller</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {listingList.map((listing) => (
                <ListingRow key={listing.id} listing={listing} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-label mono">Users ({userList.length})</h2>
        {users.isPending && <p className="mono">Loading users…</p>}
        <div className="table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Listings</th>
                <th>Orders</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {userList.map((row) => (
                <tr key={row.id}>
                  <td>{row.displayName}</td>
                  <td className="mono">{row.email}</td>
                  <td>
                    <span className="mini-status mono">{row.role}</span>
                  </td>
                  <td className="mono">{row.listingCount}</td>
                  <td className="mono">{row.orderCount}</td>
                  <td className="mono">{new Date(row.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2 className="section-label mono">Reviews ({reviewList.length})</h2>
        {reviews.isPending && <p className="mono">Loading reviews…</p>}
        {reviews.data && reviewList.length === 0 && (
          <p className="mono panel-empty">No reviews yet.</p>
        )}
        <ul className="admin-reviews">
          {reviewList.map((review) => (
            <li key={review.id} className="admin-review">
              <div className="mono admin-review-head">
                <span className="stars">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span>
                <span>{review.buyerName}</span>
                <Link to={`/listings/${review.listingId}`} className="admin-review-listing">
                  {review.listingTitle}
                </Link>
                <time dateTime={review.createdAt}>
                  {new Date(review.createdAt).toLocaleDateString()}
                </time>
                <button
                  className="linklike mono"
                  type="button"
                  disabled={moderate.isPending}
                  onClick={() => moderate.mutate(review.id)}
                >
                  Remove
                </button>
              </div>
              {review.body && <p className="review-body">{review.body}</p>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
