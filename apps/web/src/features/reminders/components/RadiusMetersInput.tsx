import { useEffect, useState } from 'react'
import {
  isValidRadiusMeters,
  MAX_RADIUS_METERS,
  MIN_RADIUS_METERS,
  validateRadiusMetersText,
} from '../utils/radiusValidation'

type Props = {
  value: number
  onChange: (value: number) => void
}

export function RadiusMetersInput({ value, onChange }: Props) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    if (isValidRadiusMeters(value)) setText(String(value))
  }, [value])

  const error = validateRadiusMetersText(text)

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-black uppercase tracking-widest text-[var(--bp-subtle)]">
        Radius (meters)
      </span>
      <div className="flex items-center gap-2">
        <input
          aria-label="Radius (meters)"
          type="number"
          inputMode="numeric"
          min={MIN_RADIUS_METERS}
          max={MAX_RADIUS_METERS}
          step={1}
          value={text}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'radius-meters-error' : undefined}
          onChange={(event) => {
            const next = event.target.value
            setText(next)
            onChange(/^\d+$/.test(next) ? Number(next) : Number.NaN)
          }}
          className={`w-36 rounded-xl border bg-[var(--bp-surface)] px-3 py-2.5 text-sm text-[var(--bp-text)] outline-none transition ${
            error ? 'border-red-400 focus:border-red-400' : 'border-[var(--bp-border)] focus:border-[var(--bp-accent)]'
          }`}
        />
        <span className="text-sm font-semibold text-[var(--bp-muted)]">m</span>
      </div>
      {error ? (
        <span id="radius-meters-error" role="alert" className="mt-1.5 block text-xs font-semibold text-red-400">
          {error}
        </span>
      ) : null}
    </label>
  )
}
