import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { formatPrice, type CartResponse } from '@deadwax/shared'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useCart } from '../lib/cart'
import { useCheckout } from '../lib/orders'
import { stripePromise, usePaymentsConfig } from '../lib/payments'

interface FormState {
  shippingName: string
  shippingAddress1: string
  shippingAddress2: string
  shippingCity: string
  shippingRegion: string
  shippingPostal: string
  shippingCountry: string
  cardNumber: string
  cardExpiry: string
  cardCvc: string
  nameOnCard: string
}

const EMPTY_FORM: FormState = {
  shippingName: '',
  shippingAddress1: '',
  shippingAddress2: '',
  shippingCity: '',
  shippingRegion: '',
  shippingPostal: '',
  shippingCountry: 'US',
  cardNumber: '',
  cardExpiry: '',
  cardCvc: '',
  nameOnCard: '',
}

const ELEMENTS_APPEARANCE = {
  theme: 'flat' as const,
  variables: {
    colorPrimary: '#e5402f',
    colorText: '#16130f',
    colorBackground: '#fbf8f2',
    colorDanger: '#b3271a',
    fontFamily: "'Work Sans', system-ui, sans-serif",
    borderRadius: '2px',
  },
}

export default function Checkout() {
  const { user, isPending } = useAuth()
  const cart = useCart(Boolean(user))
  const config = usePaymentsConfig()
  const checkout = useCheckout()
  const navigate = useNavigate()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [intent, setIntent] = useState<{
    orderId: number
    clientSecret: string
    summary: CartResponse | undefined
  } | null>(null)

  const stripeMode = config.data?.mode === 'stripe'
  const canUseElements = stripeMode && stripePromise !== null

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

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
          <p className="kicker mono">Checkout</p>
          <h1 className="state-title">Sign in first</h1>
          <Link className="btn" to="/login">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  const data = cart.data

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    checkout.mutate(form, {
      onSuccess: (result) => {
        if (result.clientSecret && stripePromise) {
          // Snapshot the cart: the mutation invalidates it, and the payment
          // step must not collapse into "nothing to buy" when it refetches.
          setIntent({ orderId: result.orderId, clientSecret: result.clientSecret, summary: data })
          return
        }
        navigate(`/orders/${result.orderId}`)
      },
    })
  }

  if (!intent && data && data.lines.length === 0) {
    return (
      <div className="page">
        <div className="state">
          <p className="kicker mono">Checkout</p>
          <h1 className="state-title">Nothing to buy</h1>
          <p>Your cart is empty.</p>
          <Link className="btn" to="/">
            Browse the crates
          </Link>
        </div>
      </div>
    )
  }

  if (!intent && cart.isError) {
    return (
      <div className="page">
        <div className="state">
          <p className="kicker mono">Checkout</p>
          <h1 className="state-title">Cart unavailable</h1>
          <p>We could not load your cart. Please try again in a moment.</p>
          <Link className="btn" to="/cart">
            Back to cart
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <p className="kicker mono">Checkout</p>
      <h1 className="browse-title">{intent ? 'Pay' : 'Check out'}</h1>

      <div className="checkout-layout">
        {intent && stripePromise ? (
          <Elements
            stripe={stripePromise}
            options={{ clientSecret: intent.clientSecret, appearance: ELEMENTS_APPEARANCE }}
          >
            <PaymentStep
              orderId={intent.orderId}
              totalCents={intent.summary?.totalCents ?? data?.totalCents ?? 0}
              onDone={() => navigate(`/orders/${intent.orderId}`)}
            />
          </Elements>
        ) : stripeMode && !stripePromise ? (
          <div className="state">
            <h2 className="section-label mono">Payment unavailable</h2>
            <p>This build was compiled without a Stripe publishable key.</p>
          </div>
        ) : (
          <form className="form checkout-form" onSubmit={onSubmit}>
            <h2 className="section-label mono">Shipping</h2>

            <label className="field">
              <span className="mono">Full name</span>
              <input
                className="input"
                required
                value={form.shippingName}
                onChange={(event) => update('shippingName', event.target.value)}
              />
            </label>

            <label className="field">
              <span className="mono">Address</span>
              <input
                className="input"
                required
                value={form.shippingAddress1}
                onChange={(event) => update('shippingAddress1', event.target.value)}
              />
            </label>

            <label className="field">
              <span className="mono">Address line 2 (optional)</span>
              <input
                className="input"
                value={form.shippingAddress2}
                onChange={(event) => update('shippingAddress2', event.target.value)}
              />
            </label>

            <div className="form-grid">
              <label className="field">
                <span className="mono">City</span>
                <input
                  className="input"
                  required
                  value={form.shippingCity}
                  onChange={(event) => update('shippingCity', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="mono">State / region</span>
                <input
                  className="input"
                  value={form.shippingRegion}
                  onChange={(event) => update('shippingRegion', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="mono">Postal code</span>
                <input
                  className="input"
                  required
                  value={form.shippingPostal}
                  onChange={(event) => update('shippingPostal', event.target.value)}
                />
              </label>
              <label className="field">
                <span className="mono">Country</span>
                <input
                  className="input"
                  required
                  value={form.shippingCountry}
                  onChange={(event) => update('shippingCountry', event.target.value)}
                />
              </label>
            </div>

            {!canUseElements && (
              <>
                <h2 className="section-label mono payment-heading">Payment</h2>
                <p className="mono demo-hint">
                  Demo only, no real charge. Test card 4242 4242 4242 4242 succeeds; any card
                  ending in 0002 is declined.
                </p>

                <label className="field">
                  <span className="mono">Name on card</span>
                  <input
                    className="input"
                    required
                    value={form.nameOnCard}
                    onChange={(event) => update('nameOnCard', event.target.value)}
                  />
                </label>

                <label className="field">
                  <span className="mono">Card number</span>
                  <input
                    className="input"
                    required
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="4242 4242 4242 4242"
                    value={form.cardNumber}
                    onChange={(event) => update('cardNumber', event.target.value)}
                  />
                </label>

                <div className="form-grid">
                  <label className="field">
                    <span className="mono">Expiry</span>
                    <input
                      className="input"
                      required
                      placeholder="MM/YY"
                      autoComplete="cc-exp"
                      value={form.cardExpiry}
                      onChange={(event) => update('cardExpiry', event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span className="mono">CVC</span>
                    <input
                      className="input"
                      required
                      inputMode="numeric"
                      placeholder="123"
                      autoComplete="cc-csc"
                      value={form.cardCvc}
                      onChange={(event) => update('cardCvc', event.target.value)}
                    />
                  </label>
                </div>
              </>
            )}

            {checkout.isError && <p className="form-error mono">{checkout.error.message}</p>}

            <button className="btn" type="submit" disabled={checkout.isPending || !data}>
              {checkout.isPending
                ? 'Processing…'
                : canUseElements
                  ? 'Continue to payment'
                  : 'Place order'}
            </button>
          </form>
        )}

        <OrderSummary data={intent?.summary ?? data} />
      </div>
    </div>
  )
}

function OrderSummary({ data }: { data: CartResponse | undefined }) {
  return (
    <aside className="cart-summary checkout-summary">
      <h2 className="filter-label mono">Order summary</h2>
      {!data && <p className="mono">Loading cart…</p>}
      {data && (
        <>
          <ul className="summary-items">
            {data.lines.map((line) => (
              <li key={line.listingId} className="mono">
                <span>
                  {line.quantity}× {line.title}
                </span>
                <span>{formatPrice(line.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
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
        </>
      )}
    </aside>
  )
}

function PaymentStep({
  orderId,
  totalCents,
  onDone,
}: {
  orderId: number
  totalCents: number
  onDone: () => void
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!stripe || !elements) return

    setBusy(true)
    setError('')

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/orders/${orderId}` },
      redirect: 'if_required',
    })

    if (result.error) {
      setError(result.error.message ?? 'The payment did not go through. Try another card.')
      setBusy(false)
      return
    }

    // Stripe has the money. The webhook flips the order a moment later, so
    // wait briefly instead of landing the buyer on a page that says pending.
    for (let attempt = 0; attempt < 15; attempt++) {
      const current = await api<{ order: { status: string } }>(`/orders/${orderId}`).catch(
        () => null,
      )
      if (current?.order.status === 'paid') break
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    onDone()
  }

  return (
    <form className="form checkout-form" onSubmit={onSubmit}>
      <h2 className="section-label mono">Payment</h2>
      <p className="mono demo-hint">
        Stripe test mode, no real charge. 4242 4242 4242 4242 succeeds. 4000 0000 0000 0002 is
        declined.
      </p>

      <PaymentElement options={{ layout: 'tabs' }} />

      {error && <p className="form-error mono">{error}</p>}

      <button className="btn" type="submit" disabled={!stripe || busy}>
        {busy ? 'Processing…' : `Pay ${formatPrice(totalCents)}`}
      </button>
    </form>
  )
}
