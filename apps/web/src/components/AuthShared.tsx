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
    <div className="relative z-10 hidden flex-col justify-between overflow-hidden border-r border-[#272D36] bg-[#0E1116] p-16 lg:flex lg:w-1/2">
      <div className="relative z-10">
        <BeePlanLogo showTagline size={56} />
      </div>

      <div className="relative z-10 my-auto flex max-w-md flex-col items-start space-y-6">
        <div className="animate-float">
          <BeePlanLogo showTagline size={56} />
        </div>
        <h2 className="text-4xl font-extrabold leading-[1.15] tracking-tight text-white">
          {headline}
        </h2>
        <p className="text-sm leading-relaxed text-[#A1A7B3]">{sub}</p>
      </div>

      <div className="relative z-10 text-xs text-[#7F8794]">
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
      <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-[#7F8794]">
        {label}
      </label>
      <div
        className={`flex items-center rounded-xl border bg-[#15181E] px-4 py-3 transition-all duration-200 ${
          error
            ? 'border-red-500'
            : 'border-[#272D36] focus-within:border-[#F5C542]/70'
        }`}
      >
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-grow border-none bg-transparent p-0 text-sm text-white placeholder:text-[#5F6876] focus:outline-none focus:ring-0"
        />
        {rightSlot}
      </div>
      {error && <span className="mt-1.5 block pl-1 text-xs text-red-400">{error}</span>}
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
      className="flex h-12 w-full items-center justify-center rounded-xl bg-[#F5C542] text-xs font-bold uppercase tracking-wider text-[#121820] shadow-lg shadow-[#F5C542]/10 transition-all hover:bg-[#FFD84A] active:scale-95 disabled:bg-[#272D36] disabled:text-[#727A86]"
    >
      {loading ? (
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#121820]/30 border-t-[#121820]" />
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
    <div className="mt-6 flex items-center justify-center text-xs text-[#A1A7B3]">
      <span>{prefix}</span>
      <button
        type="button"
        onClick={onClick}
        className="pl-1.5 font-bold text-[#F5C542] underline transition-colors hover:text-white focus:outline-none"
      >
        {label}
      </button>
    </div>
  )
}

export function AuthCard({ shake, children }: { shake: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`relative w-full max-w-md rounded-3xl border border-[#272D36] bg-[#15181E]/95 p-8 shadow-2xl shadow-black/30 backdrop-blur-md transition-all duration-300 sm:p-10 ${
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
    <div className="relative flex min-h-screen items-stretch overflow-hidden bg-[#0E1116] font-sans text-white">
      <div className="honeycomb-bg" />

      <LeftPanel headline={headline} sub={sub} />

      <div className="relative z-10 flex w-full flex-col items-center justify-center p-6 sm:p-12 lg:w-1/2">
        {children}
      </div>
    </div>
  )
}
