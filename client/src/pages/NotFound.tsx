import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="page">
      <div className="state">
        <p className="kicker mono">404</p>
        <h1 className="state-title">B-side</h1>
        <p>That groove doesn't exist.</p>
        <Link className="btn" to="/">
          Back to the crate
        </Link>
      </div>
    </div>
  )
}
