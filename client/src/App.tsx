import { useState } from 'react'
import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth, useLogout } from './lib/auth'
import DemoAccountsModal, {
  DEMO_DISMISS_KEY,
  demoAccountsWereDismissed,
} from './components/DemoAccountsModal'
import { useCart } from './lib/cart'
import Admin from './pages/Admin'
import Browse from './pages/Browse'
import Cart from './pages/Cart'
import Checkout from './pages/Checkout'
import ListingDetail from './pages/ListingDetail'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import OrderDetail from './pages/OrderDetail'
import Orders from './pages/Orders'
import Register from './pages/Register'
import Sell from './pages/Sell'
import Seller from './pages/Seller'

function Header({ onOpenDemo }: { onOpenDemo: () => void }) {
  const { user, isPending } = useAuth()
  const cart = useCart(Boolean(user))
  const logout = useLogout()
  const navigate = useNavigate()
  const cartCount = cart.data?.itemCount ?? 0

  function onLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/') })
  }

  return (
    <header className="site-header">
      <Link to="/" className="wordmark">
        Deadwax
      </Link>
      <button
        type="button"
        className="demo-chip mono"
        onClick={onOpenDemo}
        title="Show the demo account logins"
      >
        Demo logins
      </button>
      <nav className="site-nav">
        <Link to="/">Browse</Link>
        <Link to="/sell">Sell</Link>
        {user && (user.role === 'seller' || user.role === 'admin') && (
          <Link to="/seller">Dashboard</Link>
        )}
        {user && user.role === 'admin' && <Link to="/admin">Admin</Link>}
        {user && <Link to="/orders">Orders</Link>}
        <Link to="/cart" className="nav-cart">
          Cart
          {cartCount > 0 && <span className="nav-badge">{cartCount}</span>}
        </Link>
        {isPending && <span className="mono nav-muted">…</span>}
        {!isPending && user && (
          <>
            <span className="nav-user mono">
              {user.displayName}
              <em className="nav-role">{user.role}</em>
            </span>
            <button
              type="button"
              className="linklike mono"
              onClick={onLogout}
              disabled={logout.isPending}
            >
              Log out
            </button>
          </>
        )}
        {!isPending && !user && (
          <>
            <Link to="/login">Sign in</Link>
            <Link to="/register" className="nav-cta">
              Join
            </Link>
          </>
        )}
      </nav>
    </header>
  )
}

export default function App() {
  const { user, isPending, isPending: authPending } = useAuth()
  const [open, setOpen] = useState(false)

  // Show the demo-accounts intro once per session when a signed-out user lands.
  useState<boolean>(false) // (placeholder guard — kept simple below)
  const [autoShown, setAutoShown] = useState(false)

  // On first auth resolution while logged out, open the modal unless the
  // visitor already dismissed it this session.
  function maybeOpenOnLanding() {
    if (isPending) return
    if (user) return
    if (autoShown) return
    setAutoShown(true)
    if (demoAccountsWereDismissed()) return
    setOpen(true)
  }
  maybeOpenOnLanding()

  function dismissDemo() {
    try {
      sessionStorage.setItem(DEMO_DISMISS_KEY, '1')
    } catch {
      /* storage unavailable — still close */
    }
    setOpen(false)
  }

  return (
    <div className="shell">
      <Header onOpenDemo={() => setOpen(true)} />

      <DemoAccountsModal open={open} onDismiss={dismissDemo} />

      <main className="site-main">
        <Routes>
          <Route path="/" element={<Browse />} />
          <Route path="/listings/:id" element={<ListingDetail />} />
          <Route path="/sell" element={<Sell />} />
          <Route path="/seller" element={<Seller />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="site-footer">
        <span>DEADWAX — a demo vinyl marketplace on Neon Postgres</span>
        <span className="mono">33⅓ RPM</span>
      </footer>
    </div>
  )
}
