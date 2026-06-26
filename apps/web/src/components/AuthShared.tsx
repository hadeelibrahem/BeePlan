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
    <div className="hidden lg:flex lg:w-1/2 bg-[#1F242E] relative flex-col justify-between p-16 overflow-hidden border-r border-[#434D62]/40 z-10">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-[#FDEF4B]/5 opacity-30 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] rounded-full border border-[#FDEF4B]/5 opacity-20 pointer-events-none" />

      <div className="relative z-10">
        <BeePlanLogo showTagline size={56} />
      </div>

      <div className="my-auto flex flex-col items-start space-y-6 relative z-10 max-w-md">
        <div className="animate-float">
          <BeePlanLogo showTagline size={56} />
        </div>
        <h2 className="text-4xl font-extrabold tracking-tight text-white leading-[1.15]">
          {headline}
        </h2>
        <p className="text-slate-400 text-sm leading-relaxed">{sub}</p>
      </div>

      <div className="text-xs text-slate-500 relative z-10">
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
      <label className="block text-[10px] font-bold text-[#8C9BAE] uppercase tracking-wider mb-1.5">
        {label}
      </label>
      <div
        className={`bg-[#2B323F] rounded-xl px-4 py-3 border flex items-center transition-all duration-200 ${
          error
            ? 'border-red-500'
            : 'border-[#434D62] focus-within:border-[#FDEF4B] focus-within:ring-1 focus-within:ring-[#FDEF4B]/20'
        }`}
      >
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-grow bg-transparent border-none p-0 text-white text-sm placeholder-slate-600 focus:outline-none focus:ring-0"
        />
        {rightSlot}
      </div>
      {error && <span className="text-red-400 text-xs mt-1.5 block pl-1">{error}</span>}
    </div>
  )
}

export function PrimaryButton({
  children,
  onClick,
  loading = false,
  type = 'submit',
}: {
  children: React.ReactNode
  onClick?: () => void
  loading?: boolean
  type?: 'submit' | 'button'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading}
      className="w-full h-12 rounded-xl bg-[#FDEF4B] text-[#2B323F] text-xs font-bold uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-[#FDEF4B]/10 btn-glow"
    >
      {loading ? (
        <div className="w-5 h-5 border-2 border-[#2B323F]/30 border-t-[#2B323F] rounded-full animate-spin" />
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
    <div className="flex justify-center items-center mt-6 text-xs text-[#8C9BAE]">
      <span>{prefix}</span>
      <button
        type="button"
        onClick={onClick}
        className="text-[#FDEF4B] font-bold underline pl-1.5 hover:text-white transition-colors focus:outline-none"
      >
        {label}
      </button>
    </div>
  )
}

export function AuthCard({ shake, children }: { shake: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`bg-[#353D4E]/85 backdrop-blur-md rounded-3xl p-8 sm:p-10 border border-[#434D62] w-full max-w-md shadow-2xl relative transition-all duration-300 ${
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
    <div className="min-h-screen flex items-stretch bg-[#2B323F] text-white font-sans relative overflow-hidden">
      <div className="honeycomb-bg" />
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-[#FDEF4B] opacity-[0.04] blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[650px] h-[650px] rounded-full bg-[#FDEF4B] opacity-[0.03] blur-[150px] pointer-events-none" />

      <LeftPanel headline={headline} sub={sub} />

      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-6 sm:p-12 z-10 relative">
        {children}
      </div>
    </div>
  )
}
