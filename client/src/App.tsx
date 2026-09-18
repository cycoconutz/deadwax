import { Link, Route, Routes, useNavigate } from 'react-router-dom'
import { useAuth, useLogout } from './lib/auth'
import Browse from './pages/Browse'
import ListingDetail from './pages/ListingDetail'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Register from './pages/Register'
import Sell from './pages/Sell'

function Header() {
  const { user, isPending } = useAuth()
  const logout = useLogout()
  const navigate = useNavigate()

  function onLogout() {
    logout.mutate(undefined, { onSuccess: () => navigate('/') })
  }

  return (
    <header className="site-header">
      <Link to="/" className="wordmark">
        Deadwax
      </Link>
      <nav className="site-nav">
        <Link to="/">Browse</Link>
        <Link to="/sell">Sell</Link>
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
  return (
    <div className="shell">
      <Header />

      <main className="site-main">
        <Routes>
          <Route path="/" element={<Browse />} />
          <Route path="/listings/:id" element={<ListingDetail />} />
          <Route path="/sell" element={<Sell />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      <footer className="site-footer">
        <span>DEADWAX — a vinyl marketplace demo</span>
        <span className="mono">33⅓ RPM</span>
      </footer>
    </div>
  )
}
