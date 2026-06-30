import type { ButtonHTMLAttributes } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
}

export function PrimaryButton({ children, className = '', loading, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`rounded-xl bg-[var(--bp-accent)] px-5 py-3 text-sm font-black text-[var(--bp-accent-text)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
        loading ? 'opacity-70' : 'hover:brightness-95'
      } ${className}`}
      {...rest}
    >
      {loading ? 'Loading...' : children}
    </button>
  )
}

export function SecondaryButton({ children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`rounded-xl bg-[var(--bp-border)] px-4 py-3 text-sm font-semibold text-[var(--bp-text)] transition hover:bg-[var(--bp-border)]/70 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function OutlineButton({ children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`rounded-xl border border-[var(--bp-border)] bg-transparent px-4 py-3 text-sm font-semibold text-[var(--bp-text)] transition hover:border-[var(--bp-accent)]/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function GhostButton({ children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`rounded-xl bg-transparent px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-[var(--bp-border)]/50 hover:text-[var(--bp-text)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function DangerButton({ children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`rounded-xl bg-red-500/15 px-4 py-3 text-sm font-bold text-red-300 transition hover:bg-red-500/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
