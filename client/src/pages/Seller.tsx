import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPrice, type ListingSummary, type OrderStatus } from '@deadwax/shared'
import Sleeve from '../components/Sleeve'
import { useAuth } from '../lib/auth'
import { useDeleteListing, useMyListings, useUpdateListing } from '../lib/listings'
import { useSellerOrders, useSellerSummary, useUpdateItemStatus } from '../lib/seller'

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  paid: 'shipped',
  shipped: 'delivered',
}

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  paid: 'Mark shipped',
  shipped: 'Mark delivered',
}

function ListingRow({ listing }: { listing: ListingSummary }) {
  const [price, setPrice] = useState((listing.priceCents / 100).toFixed(2))
  const [stock, setStock] = useState(String(listing.stock))
  const update = useUpdateListing(listing.id)
  const archive = useDeleteListing()

  function save() {
    update.mutate({
      priceCents: Math.round(Number(price) * 100),
      stock: Number(stock),
    })
  }

  function toggleStatus() {
    if (listing.status === 'active') archive.mutate(listing.id)
    else update.mutate({ status: 'active' })
  }

  return (
    <li className={listing.status === 'archived' ? 'seller-listing is-archived' : 'seller-listing'}>
      <Link to={`/listings/${listing.id}`} className="cart-thumb">
        <Sleeve
          src={listing.coverImageUrl || undefined}
          title={listing.title}
          artist={listing.artist}
        />
      </Link>

      <div className="seller-listing-info">
        <Link to={`/listings/${listing.id}`} className="cart-line-title">
          {listing.title}
        </Link>
        <span className="mono cart-line-artist">{listing.artist}</span>
        <span className="mono seller-listing-meta">
          {listing.status} · {listing.condition} · {listing.genre}
          {listing.releaseYear ? ` · ${listing.releaseYear}` : ''}
        </span>
      </div>

      <label className="inline-field">
        <span className="mono">Price $</span>
        <input
          className="input input-sm"
          type="number"
          min={0}
          step="0.01"
          value={price}
          onChange={(event) => setPrice(event.target.value)}
        />
      </label>

      <label className="inline-field">
        <span className="mono">Stock</span>
        <input
          className="input input-sm"
          type="number"
          min={0}
          max={999}
          value={stock}
          onChange={(event) => setStock(event.target.value)}
        />
      </label>

      <button className="btn btn-sm" type="button" onClick={save} disabled={update.isPending}>
        {update.isPending ? 'Saving…' : 'Save'}
      </button>

      <button
        className="linklike mono"
        type="button"
        onClick={toggleStatus}
        disabled={archive.isPending || update.isPending}
      >
        {listing.status === 'active' ? 'Archive' : 'Restore'}
      </button>

      {update.isError && <span className="form-error mono">{update.error.message}</span>}
    </li>
  )
}

export default function Seller() {
  const { user, isPending } = useAuth()
  const isSeller = user?.role === 'seller' || user?.role === 'admin'
  const summary = useSellerSummary(isSeller)
  const orders = useSellerOrders(isSeller)
  const listings = useMyListings()
  const updateStatus = useUpdateItemStatus()

  if (isPending) {
    return (
      <div className="page">
        <p className="results-note mono">Checking your account…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="page">
        <div className="state">
          <p className="kicker mono">Seller tools</p>
          <h1 className="state-title">Sign in first</h1>
          <Link className="btn" to="/login">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  if (!isSeller) {
    return (
      <div className="page">
        <div className="state">
          <p className="kicker mono">Seller tools</p>
          <h1 className="state-title">Buyer account</h1>
          <p>Register a seller account to open a shop and manage orders.</p>
          <Link className="btn" to="/">
            Back to the crates
          </Link>
        </div>
      </div>
    )
  }

  const stats = summary.data
  const orderList = orders.data?.data ?? []
  const listingList = listings.data?.data ?? []

  return (
    <div className="page">
      <p className="kicker mono">Seller tools</p>
      <h1 className="browse-title">Dashboard</h1>

      <div className="stat-grid">
        <div className="stat">
          <span className="mono">Active listings</span>
          <strong>{stats ? stats.activeListings : '—'}</strong>
        </div>
        <div className={stats && stats.ordersToShip > 0 ? 'stat stat-alert' : 'stat'}>
          <span className="mono">To ship</span>
          <strong>{stats ? stats.ordersToShip : '—'}</strong>
        </div>
        <div className="stat">
          <span className="mono">Units sold</span>
          <strong>{stats ? stats.unitsSold : '—'}</strong>
        </div>
        <div className="stat">
          <span className="mono">Gross sales</span>
          <strong>{stats ? formatPrice(stats.grossSalesCents) : '—'}</strong>
        </div>
      </div>

      <section className="panel">
        <h2 className="section-label mono">Incoming orders</h2>
        {orders.isPending && <p className="mono">Loading orders…</p>}
        {orders.isError && <p className="mono status-bad">Could not load orders.</p>}
        {orders.data && orderList.length === 0 && (
          <p className="mono panel-empty">No sales yet — your records are waiting.</p>
        )}

        <ul className="seller-orders">
          {orderList.map((order) => (
            <li key={order.id} className="seller-order">
              <div className="order-head">
                <span className="order-num">#{order.id}</span>
                <span className="mono">{order.buyerName}</span>
                <span className={`order-status mono status-${order.orderStatus}`}>
                  {order.orderStatus}
                </span>
                <time className="mono order-date" dateTime={order.createdAt}>
                  {new Date(order.createdAt).toLocaleDateString()}
                </time>
              </div>

              <ul className="order-items">
                {order.items.map((item) => {
                  const next = NEXT_STATUS[item.status]
                  return (
                    <li key={item.id} className="seller-order-item">
                      <span className="mono">
                        {item.quantity}× {item.artist} — {item.title}
                      </span>
                      <span className={`mini-status mono status-${item.status}`}>
                        {item.status}
                      </span>
                      <span className="mono">{formatPrice(item.priceCents * item.quantity)}</span>
                      {next && (
                        <button
                          className="btn btn-xs"
                          type="button"
                          onClick={() => updateStatus.mutate({ itemId: item.id, status: next })}
                          disabled={updateStatus.isPending}
                        >
                          {NEXT_LABEL[item.status]}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>

              <div className="order-foot">
                <span className="mono">
                  Ships to {order.shippingName}, {order.shippingCity}, {order.shippingCountry}
                </span>
                <span className="order-total">{formatPrice(order.sellerTotalCents)}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2 className="section-label mono">Your listings</h2>
        {listings.isPending && <p className="mono">Loading listings…</p>}
        {listings.data && listingList.length === 0 && (
          <p className="mono panel-empty">
            Nothing listed yet. <Link to="/sell">List your first record</Link>.
          </p>
        )}

        <ul className="seller-listings">
          {listingList.map((listing) => (
            <ListingRow key={listing.id} listing={listing} />
          ))}
        </ul>
      </section>
    </div>
  )
}
