import { Link } from 'react-router-dom'
import { formatPrice } from '@deadwax/shared'
import Sleeve from '../components/Sleeve'
import { useAuth } from '../lib/auth'
import { useCart, useRemoveCartItem, useUpdateCartItem } from '../lib/cart'

export default function Cart() {
  const { user, isPending } = useAuth()
  const cart = useCart(Boolean(user))
  const update = useUpdateCartItem()
  const remove = useRemoveCartItem()

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
          <p className="kicker mono">Your cart</p>
          <h1 className="state-title">Sign in to buy</h1>
          <p>You need an account to build a cart and check out.</p>
          <Link className="btn" to="/login">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  const data = cart.data
  const lines = data?.lines ?? []

  return (
    <div className="page">
      <p className="kicker mono">Your cart</p>
      <h1 className="browse-title">Cart</h1>

      {cart.isPending && <p className="results-note mono">Loading cart…</p>}
      {cart.isError && (
        <p className="results-note mono status-bad">Could not load your cart.</p>
      )}

      {data && lines.length === 0 && (
        <div className="empty">
          <p className="mono">Your cart is empty.</p>
          <Link className="btn btn-sm" to="/">
            Browse the crates
          </Link>
        </div>
      )}

      {data && lines.length > 0 && (
        <div className="cart-layout">
          <ul className="cart-lines">
            {lines.map((line) => (
              <li key={line.listingId} className="cart-line">
                <Link to={`/listings/${line.listingId}`} className="cart-thumb">
                  <Sleeve
                    src={line.coverImageUrl || undefined}
                    title={line.title}
                    artist={line.artist}
                  />
                </Link>
                <div className="cart-line-info">
                  <Link to={`/listings/${line.listingId}`} className="cart-line-title">
                    {line.title}
                  </Link>
                  <span className="mono cart-line-artist">{line.artist}</span>
                  <span className="mono cart-line-price">
                    {formatPrice(line.priceCents)} each · {line.stock} available
                  </span>
                </div>
                <div className="qty">
                  <button
                    type="button"
                    className="qty-btn"
                    aria-label="Decrease quantity"
                    onClick={() =>
                      update.mutate({ listingId: line.listingId, quantity: line.quantity - 1 })
                    }
                    disabled={line.quantity <= 1 || update.isPending}
                  >
                    −
                  </button>
                  <span className="qty-value mono">{line.quantity}</span>
                  <button
                    type="button"
                    className="qty-btn"
                    aria-label="Increase quantity"
                    onClick={() =>
                      update.mutate({ listingId: line.listingId, quantity: line.quantity + 1 })
                    }
                    disabled={line.quantity >= line.stock || update.isPending}
                  >
                    +
                  </button>
                </div>
                <span className="cart-line-total mono">{formatPrice(line.lineTotalCents)}</span>
                <button
                  type="button"
                  className="linklike mono"
                  onClick={() => remove.mutate(line.listingId)}
                  disabled={remove.isPending}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <aside className="cart-summary">
            <h2 className="filter-label mono">Summary</h2>
            <dl className="summary-list">
              <div>
                <dt className="mono">Subtotal</dt>
                <dd>{formatPrice(data.subtotalCents)}</dd>
              </div>
              <div>
                <dt className="mono">Shipping</dt>
                <dd>{formatPrice(data.shippingCents)}</dd>
              </div>
              <div className="summary-total">
                <dt className="mono">Total</dt>
                <dd>{formatPrice(data.totalCents)}</dd>
              </div>
            </dl>
            <Link className="btn checkout-btn" to="/checkout">
              Checkout
            </Link>
          </aside>
        </div>
      )}
    </div>
  )
}
