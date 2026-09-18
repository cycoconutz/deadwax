import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface Health {
  status: string
  database: string
  time: string
}

export default function Home() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api<Health>('/health', { signal }),
  })

  return (
    <div className="page">
      <section className="hero">
        <p className="kicker mono">Vintage vinyl, graded honestly</p>
        <h1 className="hero-title">
          Dig the
          <br />
          dead wax.
        </h1>
        <p className="hero-lede">
          A marketplace for records pulled from the back of the crate — every
          sleeve graded, every pressing catalogued.
        </p>
      </section>

      <section className="status-panel" aria-live="polite">
        <h2 className="section-label mono">System check</h2>
        {health.isPending && <p className="mono">Pinging API…</p>}
        {health.isError && (
          <p className="status-bad mono">
            API unreachable — is the server running?
          </p>
        )}
        {health.data && (
          <ul className="status-list">
            <li>
              <span className="mono">API</span>
              <span className="status-ok mono">{health.data.status}</span>
            </li>
            <li>
              <span className="mono">Postgres</span>
              <span
                className={
                  health.data.database === 'up'
                    ? 'status-ok mono'
                    : 'status-bad mono'
                }
              >
                {health.data.database}
              </span>
            </li>
          </ul>
        )}
      </section>
    </div>
  )
}
