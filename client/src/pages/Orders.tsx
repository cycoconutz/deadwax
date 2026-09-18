import { Link } from 'react-router-dom'
import { formatPrice } from '@deadwax/shared'
import { useAuth } from '../lib/auth'
import { useOrders } from '../lib/orders'

export default function Orders() {
  const { user, isPending } = useAuth()
  const orders = useOrders(Boolean(user))

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
          <p className="kicker mono">Order history</p>
          <h1 className="state-title">Sign in first</h1>
          <Link className="btn" to="/login">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  const list = orders.data?.data ?? []

  return (
    <div className="page">
      <p className="kicker mono">Order history</p>
      <h1 className="browse-title">Your orders</h1>

      {orders.isPending && <p className="results-note mono">Loading orders…</p>}
      {orders.isError && (
        <p className="results-note mono status-bad">Could not load your orders.</p>
      )}

      {orders.data && list.length === 0 && (
        <div className="empty">
          <p className="mono">No orders yet.</p>
          <Link className="btn btn-sm" to="/">
            Browse the crates
          </Link>
        </div>
      )}

      <ul className="order-list">
        {list.map((order) => (
          <li key={order.id} className="order-card">
            <div className="order-head">
              <span className="order-num">Order #{order.id}</span>
              <span className={`order-status mono status-${order.status}`}>{order.status}</span>
              <time className="mono order-date" dateTime={order.createdAt}>
                {new Date(order.createdAt).toLocaleDateString()}
              </time>
            </div>
            <ul className="order-items">
              {order.items.map((item) => (
                <li key={item.id} className="mono">
                  <span>
                    {item.quantity}× {item.artist} — {item.title}
                  </span>
                  <span>{formatPrice(item.priceCents * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="order-foot">
              <Link className="linklike mono" to={`/orders/${order.id}`}>
                View details
              </Link>
              <span className="order-total">{formatPrice(order.totalCents)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
