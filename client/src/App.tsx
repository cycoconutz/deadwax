import { Link, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <div className="shell">
      <header className="site-header">
        <Link to="/" className="wordmark">
          Deadwax
        </Link>
        <nav className="site-nav">
          <Link to="/">Browse</Link>
        </nav>
      </header>

      <main className="site-main">
        <Routes>
          <Route path="/" element={<Home />} />
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
