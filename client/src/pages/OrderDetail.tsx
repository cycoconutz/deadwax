import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatPrice } from '@deadwax/shared'
import { useAuth } from '../lib/auth'
import { useOrder } from '../lib/orders'
import { useCreateReview } from '../lib/reviews'

function ReviewForm({ orderItemId }: { orderItemId: number }) {
  const [open, setOpen] = useState(false)
  const [rating, setRating] = useState(5)
  const [body, setBody] = useState('')
  const create = useCreateReview()

  if (!open) {
    return (
      <button className="btn btn-xs" type="button" onClick={() => setOpen(true)}>
        Write a review
      </button>
    )
  }

  return (
    <form
      className="review-form"
      onSubmit={(event) => {
        event.preventDefault()
        create.mutate(
          { orderItemId, rating, body },
          { onSuccess: () => setOpen(false) },
        )
      }}
    >
      <div className="star-picker" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={value <= rating ? 'star is-on' : 'star'}
            aria-label={`${value} star${value > 1 ? 's' : ''}`}
            aria-pressed={value === rating}
            onClick={() => setRating(value)}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        className="input review-textarea"
        rows={3}
        maxLength={2000}
        placeholder="How was the record and the seller?"
        value={body}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="review-form-actions">
        <button className="btn btn-xs" type="submit" disabled={create.isPending}>
          {create.isPending ? 'Posting…' : 'Post review'}
        </button>
        <button className="linklike mono" type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {create.isError && <p className="form-error mono">{create.error.message}</p>}
    </form>
  )
}

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
          <ul className="summary-items order-items-list">
            {detail.items.map((item) => (
              <li key={item.id}>
                <div className="order-item-row mono">
                  <span>
                    {item.quantity}× {item.artist} — {item.title}
                    <em className="order-seller"> via {item.sellerName}</em>
                  </span>
                  <span className={`mini-status mono status-${item.status}`}>{item.status}</span>
                  <span>{formatPrice(item.priceCents * item.quantity)}</span>
                </div>
                {item.status === 'delivered' &&
                  (item.reviewed ? (
                    <p className="mono order-reviewed">★ Reviewed — thanks for the feedback.</p>
                  ) : (
                    <ReviewForm orderItemId={item.id} />
                  ))}
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
