import type React from 'react'
import { BeePlanLogo } from './BeePlanLogo'

export function BrandHeader({ tagline = 'SMART PRODUCTIVITY' }: { tagline?: string }) {
  return (
    <div className="text-center mb-8 flex flex-col items-center">
      <BeePlanLogo className="mb-6" showTagline={Boolean(tagline)} size={56} />
    </div>
  )
}

export function LeftPanel({ headline, sub }: { headline: React.ReactNode; sub: string }) {
  return (
    <div className="relative z-10 hidden flex-col justify-between overflow-hidden border-e border-[var(--bp-border)] bg-[var(--bp-bg)] p-16 lg:flex lg:w-1/2">
      <div className="relative z-10">
        <BeePlanLogo showTagline size={56} />
      </div>

      <div className="relative z-10 my-auto flex max-w-md flex-col items-start space-y-6">
        <div className="animate-float">
          <BeePlanLogo showTagline size={56} />
        </div>
        <h2 className="text-4xl font-extrabold leading-[1.15] tracking-tight text-[var(--bp-text)]">
          {headline}
        </h2>
        <p className="text-sm leading-relaxed text-[var(--bp-muted)]">{sub}</p>
      </div>

      <div className="relative z-10 text-xs text-[var(--bp-subtle)]">
        &copy; {new Date().getFullYear()} BeePlan Inc. All rights reserved.
      </div>
    </div>
  )
}

export function AuthInput({
  label,
  placeholder,
  type = 'text',
  value,
  onChange,
  error,
  rightSlot,
}: {
  label: string
  placeholder: string
  type?: string
  value: string
  onChange: (v: string) => void
  error?: string
  rightSlot?: React.ReactNode
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[var(--bp-subtle)]">
        {label}
      </label>
      <div
        className={`flex items-center rounded-xl border bg-[var(--bp-surface)] px-4 py-3 transition-all duration-200 ${
          error
            ? 'border-red-500'
            : 'border-[var(--bp-border)] focus-within:border-[var(--bp-accent)]/70'
        }`}
      >
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-grow border-none bg-transparent p-0 text-sm text-[var(--bp-text)] placeholder:text-[var(--bp-placeholder)] focus:outline-none focus:ring-0"
        />
        {rightSlot}
      </div>
      {error && <span className="mt-1.5 block ps-1 text-xs text-red-400">{error}</span>}
    </div>
  )
}

export function PrimaryButton({
  children,
  onClick,
  loading = false,
  disabled = false,
  type = 'submit',
}: {
  children: React.ReactNode
  onClick?: () => void
  loading?: boolean
  disabled?: boolean
  type?: 'submit' | 'button'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className="flex h-12 w-full items-center justify-center rounded-xl bg-[var(--bp-accent)] text-xs font-bold uppercase tracking-wider text-[var(--bp-accent-text)] shadow-lg shadow-[var(--bp-accent)]/10 transition-all hover:bg-[var(--bp-accent)] active:scale-95 disabled:bg-[var(--bp-border)] disabled:text-[var(--bp-disabled-text)]"
    >
      {loading ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--bp-accent-text)]/30 border-t-[var(--bp-accent-text)]" />
      ) : (
        children
      )}
    </button>
  )
}

export function AuthFooterLink({
  prefix,
  label,
  onClick,
}: {
  prefix: string
  label: string
  onClick: () => void
}) {
  return (
    <div className="mt-6 flex items-center justify-center text-xs text-[var(--bp-muted)]">
      <span>{prefix}</span>
      <button
        type="button"
        onClick={onClick}
        className="ps-1.5 font-bold text-[var(--bp-accent)] underline transition-colors hover:text-[var(--bp-text)] focus:outline-none"
      >
        {label}
      </button>
    </div>
  )
}

export function AuthCard({ shake, children }: { shake: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`relative w-full max-w-md rounded-3xl border border-[var(--bp-border)] bg-[var(--bp-surface)]/95 p-8 shadow-2xl shadow-black/30 backdrop-blur-md transition-all duration-300 sm:p-10 ${
        shake ? 'animate-shake' : ''
      }`}
    >
      {children}
    </div>
  )
}

export function AuthShell({
  headline,
  sub,
  children,
}: {
  headline: React.ReactNode
  sub: string
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-screen items-stretch overflow-hidden bg-[var(--bp-bg)] font-sans text-[var(--bp-text)]">
      <div className="honeycomb-bg" />

      <LeftPanel headline={headline} sub={sub} />

      <div className="relative z-10 flex w-full flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2">
        {children}
      </div>
    </div>
  )
}

