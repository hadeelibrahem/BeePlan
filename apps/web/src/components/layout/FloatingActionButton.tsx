import { createPortal } from 'react-dom'

type FloatingActionButtonProps = {
  onClick?: () => void
  label?: string
  ariaLabel?: string
  className?: string
}

export function FloatingActionButton({ onClick, label = '+', ariaLabel = 'New Reminder', className = '' }: FloatingActionButtonProps) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={ariaLabel}
      className={`fixed bottom-6 end-6 z-40 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#fff47a] bg-gradient-to-br from-[#fff47a] via-[var(--bp-accent)] to-[#f6dc32] text-2xl font-black text-[var(--bp-brand-dark)] shadow-2xl shadow-[var(--bp-accent)]/40 transition hover:scale-105 hover:shadow-[0_16px_34px_rgba(253,239,75,0.42)] active:scale-95 ${className}`}
    >
      {label}
    </button>
  , document.body)
}
