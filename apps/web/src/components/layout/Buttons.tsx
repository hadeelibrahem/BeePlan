import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  size?: 'sm' | 'md'
}

const SIZE_CLASSES = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-3 text-sm',
}

function ButtonContent({ children, loading }: { children: ReactNode; loading?: boolean }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      {loading ? <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none" /> : null}
      <span>{children}</span>
      {loading ? <span className="sr-only">Loading</span> : null}
    </span>
  )
}

export function PrimaryButton({ children, className = '', loading, disabled, size = 'md', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`rounded-lg bg-[var(--bp-accent)] font-black text-[var(--bp-accent-text)] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASSES[size]} ${
        loading ? 'opacity-70' : 'hover:brightness-95'
      } ${className}`}
      {...rest}
    >
      <ButtonContent loading={loading}>{children}</ButtonContent>
    </button>
  )
}

export function SecondaryButton({ children, className = '', disabled, loading, size = 'md', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`rounded-lg bg-[var(--bp-border)] font-semibold text-[var(--bp-text)] transition hover:bg-[var(--bp-border)]/70 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      <ButtonContent loading={loading}>{children}</ButtonContent>
    </button>
  )
}

export function OutlineButton({ children, className = '', disabled, loading, size = 'md', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`rounded-lg border border-[var(--bp-border)] bg-transparent font-semibold text-[var(--bp-text)] transition hover:border-[var(--bp-accent)]/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      <ButtonContent loading={loading}>{children}</ButtonContent>
    </button>
  )
}

export function GhostButton({ children, className = '', disabled, loading, size = 'md', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`rounded-lg bg-transparent font-semibold text-slate-300 transition hover:bg-[var(--bp-border)]/50 hover:text-[var(--bp-text)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      <ButtonContent loading={loading}>{children}</ButtonContent>
    </button>
  )
}

export function DangerButton({ children, className = '', disabled, loading, size = 'md', ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`rounded-lg bg-red-500/15 font-bold text-red-300 transition hover:bg-red-500/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${SIZE_CLASSES[size]} ${className}`}
      {...rest}
    >
      <ButtonContent loading={loading}>{children}</ButtonContent>
    </button>
  )
}
