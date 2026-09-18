import { Link } from 'react-router-dom'
import { CONDITION_LABELS, formatPrice, type ListingSummary } from '@deadwax/shared'
import Sleeve from './Sleeve'

export default function ListingCard({ listing }: { listing: ListingSummary }) {
  return (
    <Link to={`/listings/${listing.id}`} className="card">
      <Sleeve
        src={listing.coverImageUrl || undefined}
        title={listing.title}
        artist={listing.artist}
      />
      <div className="card-body">
        <span className="card-artist mono">{listing.artist}</span>
        <span className="card-title">{listing.title}</span>
        <span className="card-meta mono">
          <span className="cond" title={CONDITION_LABELS[listing.condition]}>
            {listing.condition}
          </span>
          {listing.releaseYear && <span className="card-year">{listing.releaseYear}</span>}
          <span className="card-price">{formatPrice(listing.priceCents)}</span>
        </span>
        <span className="card-seller mono">via {listing.sellerName}</span>
      </div>
    </Link>
  )
}
