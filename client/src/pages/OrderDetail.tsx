import { Link, useParams } from 'react-router-dom'
import { formatPrice } from '@deadwax/shared'
import { useAuth } from '../lib/auth'
import { useOrder } from '../lib/orders'

export default function OrderDetail() {
  const { id } = useParams()
  const orderId = Number(id)
  const validId = Number.isInteger(orderId) && orderId > 0
  const { user, isPending } = useAuth()
  const order = useOrder(validId ? orderId : undefined)

  if (isPending) {
    return (
      <div className="page">
        <p className="results-note mono">Loading…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="page">
        <div className="state">
          <p className="kicker mono">Order</p>
          <h1 className="state-title">Sign in first</h1>
          <Link className="btn" to="/login">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  if (!validId || order.isError || !order.data) {
    return (
      <div className="page">
        <div className="state">
          <p className="kicker mono">404</p>
          <h1 className="state-title">Order not found</h1>
          <Link className="btn" to="/orders">
            Back to your orders
          </Link>
        </div>
      </div>
    )
  }

  const detail = order.data.order

  return (
    <div className="page">
      <Link to="/orders" className="mono back-link">
        ← Back to your orders
      </Link>

      <div className="order-detail-head">
        <div>
          <p className="kicker mono">Order #{detail.id}</p>
          <h1 className="browse-title">Receipt</h1>
        </div>
        <span className={`order-status mono status-${detail.status}`}>{detail.status}</span>
      </div>

      <div className="checkout-layout">
        <section className="review">
          <h2 className="filter-label mono">Records</h2>
          <ul className="summary-items">
            {detail.items.map((item) => (
              <li key={item.id} className="mono">
                <span>
                  {item.quantity}× {item.artist} — {item.title}
                  <em className="order-seller"> via {item.sellerName}</em>
                </span>
                <span>{formatPrice(item.priceCents * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="summary-list">
            <div>
              <dt className="mono">Subtotal</dt>
              <dd>{formatPrice(detail.subtotalCents)}</dd>
            </div>
            <div>
              <dt className="mono">Shipping</dt>
              <dd>{formatPrice(detail.shippingCents)}</dd>
            </div>
            <div className="summary-total">
              <dt className="mono">Total</dt>
              <dd>{formatPrice(detail.totalCents)}</dd>
            </div>
          </dl>
        </section>

        <aside className="cart-summary">
          <h2 className="filter-label mono">Ships to</h2>
          <p className="order-address">
            {detail.shippingName}
            <br />
            {detail.shippingAddress1}
            {detail.shippingAddress2 && (
              <>
                <br />
                {detail.shippingAddress2}
              </>
            )}
            <br />
            {detail.shippingCity}
            {detail.shippingRegion && `, ${detail.shippingRegion}`} {detail.shippingPostal}
            <br />
            {detail.shippingCountry}
          </p>

          {detail.payment && (
            <>
              <h2 className="filter-label mono payment-heading">Payment</h2>
              <p className="mono">
                {detail.payment.provider} · {detail.payment.status}
                <br />
                card ending {detail.payment.cardLast4} · {formatPrice(detail.payment.amountCents)}
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
