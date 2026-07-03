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
      className={`fixed bottom-8 end-8 flex h-16 w-16 items-center justify-center rounded-[20px] bg-[var(--bp-accent)] text-3xl font-black text-[var(--bp-accent-text)] shadow-2xl shadow-[var(--bp-accent)]/30 transition hover:scale-105 active:scale-95 ${className}`}
    >
      {label}
    </button>
  )
}
