import { useEffect } from 'react'

export const DEMO_DISMISS_KEY = 'deadwax:demo-accounts-dismissed'
const PASSWORD = 'spinthis33'

interface DemoAccount {
  role: string
  displayName: string
  email: string
  blurb: string
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'Buyer',
    displayName: 'Crate Digger',
    email: 'crate.digger@deadwax.test',
    blurb: 'Browse the shelves, fill your cart, and check out like a regular shopper.',
  },
  {
    role: 'Seller',
    displayName: 'Both Sides',
    email: 'both.sides@deadwax.test',
    blurb: 'List your own crates and buy from other sellers under one storefront.',
  },
  {
    role: 'Admin',
    displayName: 'Deadwax Admin',
    email: 'admin@deadwax.test',
    blurb: 'Moderate listings, reviews, and orders from behind the counter.',
  },
]

export function demoAccountsWereDismissed(): boolean {
  try {
    return sessionStorage.getItem(DEMO_DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export interface DemoAccountsModalProps {
  open: boolean
  onDismiss: () => void
}

export default function DemoAccountsModal({ open, onDismiss }: DemoAccountsModalProps) {
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onDismiss])

  if (!open) return null

  return (
    <div className="demo-overlay" onClick={onDismiss} role="presentation">
      <div
        className="demo-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demo-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="demo-close mono"
          onClick={onDismiss}
          aria-label="Close demo intro"
        >
          ×
        </button>

        <p className="kicker mono">Deadwax</p>
        <h2 id="demo-title" className="demo-title display">
          A working record shop, open for digging
        </h2>
        <p className="demo-lede">
          Deadwax is a real online record store wired end-to-end to Neon Postgres —
          not a mockup. Browse, build a cart, pay at checkout, list your own crates as
          a seller, or run the back room as admin. Everything you click writes to a live
          database, so you can poke every corner of a working storefront.
        </p>

        <p className="demo-pwhint mono">
          All demo accounts share the password{' '}
          <code className="demo-pw">{PASSWORD}</code>
        </p>

        <ul className="demo-list">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email} className="demo-row">
              <span className="mono demo-tag">{a.role}</span>
              <div className="demo-account">
                <span className="demo-email mono">
                  {a.email}
                  <em className="demo-name mono">— {a.displayName}</em>
                </span>
                <p className="demo-blurb">{a.blurb}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="demo-actions">
          <button type="button" className="btn" onClick={onDismiss}>
            Start digging
          </button>
          <span className="demo-secret mono">any account · one shared password</span>
        </div>
      </div>
    </div>
  )
}


