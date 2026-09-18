import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  CONDITIONS,
  CONDITION_LABELS,
  GENRES,
  type Condition,
  type Genre,
} from '@deadwax/shared'
import { useAuth } from '../lib/auth'
import { useCreateListing } from '../lib/listings'

export default function Sell() {
  const { user, isPending } = useAuth()
  const create = useCreateListing()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [label, setLabel] = useState('')
  const [catalogNumber, setCatalogNumber] = useState('')
  const [releaseYear, setReleaseYear] = useState('')
  const [genre, setGenre] = useState<Genre>('Rock')
  const [condition, setCondition] = useState<Condition>('VG+')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('1')
  const [description, setDescription] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')

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
          <p className="kicker mono">Seller tools</p>
          <h1 className="state-title">Sign in to list</h1>
          <p>Create a seller account to start cataloguing records.</p>
          <Link className="btn" to="/login">
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  if (user.role === 'buyer') {
    return (
      <div className="page">
        <div className="state">
          <p className="kicker mono">Seller tools</p>
          <h1 className="state-title">Buyer account</h1>
          <p>This account is set up for buying only. Register as a seller to list records.</p>
          <Link className="btn" to="/">
            Back to the crates
          </Link>
        </div>
      </div>
    )
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    create.mutate(
      {
        title,
        artist,
        label,
        catalogNumber,
        releaseYear: releaseYear ? Number(releaseYear) : undefined,
        genre,
        condition,
        priceCents: Math.round(Number(price) * 100),
        stock: Number(stock),
        description,
        coverImageUrl,
      },
      { onSuccess: (data) => navigate(`/listings/${data.id}`) },
    )
  }

  return (
    <div className="page">
      <div className="auth-card auth-card-wide">
        <p className="kicker mono">Seller tools</p>
        <h1 className="auth-title">List a record</h1>

        <form className="form form-grid" onSubmit={onSubmit}>
          <label className="field field-span">
            <span className="mono">Title</span>
            <input
              className="input"
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Kind of Blue"
            />
          </label>

          <label className="field field-span">
            <span className="mono">Artist</span>
            <input
              className="input"
              required
              maxLength={120}
              value={artist}
              onChange={(event) => setArtist(event.target.value)}
              placeholder="Miles Davis"
            />
          </label>

          <label className="field">
            <span className="mono">Label</span>
            <input
              className="input"
              maxLength={120}
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Columbia"
            />
          </label>

          <label className="field">
            <span className="mono">Catalogue no.</span>
            <input
              className="input"
              maxLength={60}
              value={catalogNumber}
              onChange={(event) => setCatalogNumber(event.target.value)}
              placeholder="CS 8163"
            />
          </label>

          <label className="field">
            <span className="mono">Year</span>
            <input
              className="input"
              type="number"
              min={1900}
              max={2100}
              value={releaseYear}
              onChange={(event) => setReleaseYear(event.target.value)}
              placeholder="1959"
            />
          </label>

          <label className="field">
            <span className="mono">Genre</span>
            <select
              className="input"
              value={genre}
              onChange={(event) => setGenre(event.target.value as Genre)}
            >
              {GENRES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="mono">Grade</span>
            <select
              className="input"
              value={condition}
              onChange={(event) => setCondition(event.target.value as Condition)}
            >
              {CONDITIONS.map((option) => (
                <option key={option} value={option}>
                  {option} — {CONDITION_LABELS[option]}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="mono">Price (USD)</span>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              required
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="45.00"
            />
          </label>

          <label className="field">
            <span className="mono">Stock</span>
            <input
              className="input"
              type="number"
              min={0}
              max={999}
              required
              value={stock}
              onChange={(event) => setStock(event.target.value)}
            />
          </label>

          <label className="field field-span">
            <span className="mono">Cover image URL (optional)</span>
            <input
              className="input"
              type="url"
              value={coverImageUrl}
              onChange={(event) => setCoverImageUrl(event.target.value)}
              placeholder="https://…"
            />
          </label>

          <label className="field field-span">
            <span className="mono">Description</span>
            <textarea
              className="input textarea"
              rows={5}
              maxLength={4000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Pressing details, condition notes, matrix info…"
            />
          </label>

          {create.isError && <p className="form-error mono field-span">{create.error.message}</p>}

          <button className="btn field-span" type="submit" disabled={create.isPending}>
            {create.isPending ? 'Publishing…' : 'Publish listing'}
          </button>
        </form>
      </div>
    </div>
  )
}
