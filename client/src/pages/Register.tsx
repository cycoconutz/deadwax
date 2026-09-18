import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRegister } from '../lib/auth'

export default function Register() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [wantsToSell, setWantsToSell] = useState(false)
  const register = useRegister()
  const navigate = useNavigate()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    register.mutate(
      { displayName, email, password, wantsToSell },
      { onSuccess: () => navigate('/', { replace: true }) },
    )
  }

  return (
    <div className="page">
      <div className="auth-card">
        <p className="kicker mono">Join the shop</p>
        <h1 className="auth-title">Create account</h1>

        <form className="form" onSubmit={onSubmit}>
          <label className="field">
            <span className="mono">Display name</span>
            <input
              className="input"
              type="text"
              autoComplete="nickname"
              required
              minLength={1}
              maxLength={60}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="mono">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="mono">Password (min 8 characters)</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={wantsToSell}
              onChange={(event) => setWantsToSell(event.target.checked)}
            />
            <span>I want to sell records too</span>
          </label>

          {register.isError && (
            <p className="form-error mono">{register.error.message}</p>
          )}

          <button className="btn" type="submit" disabled={register.isPending}>
            {register.isPending ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p className="auth-alt">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
