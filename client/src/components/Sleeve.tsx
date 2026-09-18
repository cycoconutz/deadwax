import type { CSSProperties } from 'react'

const PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#e5402f', '#f2b636'],
  ['#2442c8', '#e5402f'],
  ['#f2b636', '#2442c8'],
  ['#16130f', '#f2b636'],
  ['#2442c8', '#f4efe6'],
  ['#e5402f', '#f4efe6'],
  ['#16130f', '#e5402f'],
]

function hash(input: string): number {
  let value = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return Math.abs(value)
}

interface SleeveProps {
  title: string
  artist: string
  src?: string
  large?: boolean
}

export default function Sleeve({ title, artist, src, large = false }: SleeveProps) {
  const fallback = PALETTE[0]!
  const pair = PALETTE[hash(`${artist}::${title}`) % PALETTE.length] ?? fallback
  const style = {
    '--sleeve-a': pair[0],
    '--sleeve-b': pair[1],
  } as CSSProperties

  return (
    <div className={large ? 'sleeve sleeve-lg' : 'sleeve'} style={style}>
      {src ? (
        <img
          className="sleeve-img"
          src={src}
          alt={`${artist} – ${title}`}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <>
          <div className="sleeve-art" aria-hidden="true" />
          <div className="sleeve-meta">
            <span className="sleeve-artist mono">{artist}</span>
            <span className="sleeve-title">{title}</span>
          </div>
        </>
      )}
    </div>
  )
}
