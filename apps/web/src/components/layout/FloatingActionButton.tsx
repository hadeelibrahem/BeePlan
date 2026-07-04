type FloatingActionButtonProps = {
  onClick?: () => void
  label?: string
  className?: string
}

export function FloatingActionButton({ onClick, label = '+', className = '' }: FloatingActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Primary action"
      className={`fixed bottom-6 end-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--bp-accent)] text-2xl font-black text-[var(--bp-accent-text)] shadow-2xl shadow-[var(--bp-accent)]/30 transition hover:scale-105 active:scale-95 ${className}`}
    >
      {label}
    </button>
  )
}
