const YELLOW = '#FDEF4B'
const DARK = '#2B323F'
const WHITE = '#FFFFFF'
const MUTED = '#8C9BAE'

type BeePlanLogoProps = {
  size?: number
  iconOnly?: boolean
  showTagline?: boolean
  className?: string
}

function BeeIcon({ size }: { size: number }) {
  const filterId = `beeplan-glow-${size}`

  return (
    <svg
      aria-label="BeePlan bee icon"
      fill="none"
      height={size}
      viewBox="0 0 64 64"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        fill={YELLOW}
        fillOpacity="0.18"
        height="46"
        rx="18"
        transform="rotate(45 32 38)"
        width="46"
        x="9"
        y="15"
      />
      <rect
        fill={YELLOW}
        filter={`url(#${filterId})`}
        height="34"
        rx="8"
        ry="8"
        transform="rotate(14 32 37)"
        width="34"
        x="15"
        y="20"
      />
      <rect
        fill={DARK}
        height="4.5"
        rx="2"
        transform="rotate(14 32 37)"
        width="24"
        x="20"
        y="37"
      />
      <rect
        fill={DARK}
        height="4.5"
        rx="2"
        transform="rotate(14 32 37)"
        width="21"
        x="21.5"
        y="30"
      />
      <rect
        fill={DARK}
        height="4.5"
        rx="2"
        transform="rotate(14 32 37)"
        width="17"
        x="23.5"
        y="23"
      />
      <circle cx="24" cy="14" fill={YELLOW} r="2.2" />
      <circle cx="40" cy="14" fill={YELLOW} r="2.2" />
      <defs>
        <filter id={filterId} height="160%" width="160%" x="-30%" y="-30%">
          <feDropShadow
            dx="0"
            dy="3"
            floodColor={YELLOW}
            floodOpacity="0.35"
            stdDeviation="5"
          />
        </filter>
      </defs>
    </svg>
  )
}

export function BeePlanLogo({
  size = 48,
  iconOnly = false,
  showTagline = false,
  className = '',
}: BeePlanLogoProps) {
  if (iconOnly) {
    return (
      <span className={className} style={{ alignItems: 'center', display: 'inline-flex' }}>
        <BeeIcon size={size} />
      </span>
    )
  }

  const wordmarkSize = Math.round(size * 0.38)
  const taglineSize = Math.round(size * 0.11)
  const gap = Math.round(size * 0.08)

  return (
    <div
      className={className}
      style={{
        alignItems: 'center',
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 0,
        userSelect: 'none',
      }}
    >
      <BeeIcon size={size} />
      <span
        style={{
          color: WHITE,
          fontFamily: 'inherit',
          fontSize: wordmarkSize,
          fontWeight: 800,
          letterSpacing: '-0.5px',
          lineHeight: 1,
          marginTop: gap * 0.3,
        }}
      >
        Bee<span style={{ color: YELLOW }}>Plan</span>
      </span>
      {showTagline && (
        <span
          style={{
            color: MUTED,
            fontFamily: 'inherit',
            fontSize: taglineSize,
            fontWeight: 700,
            letterSpacing: '0.2em',
            marginTop: Math.round(size * 0.08),
            textTransform: 'uppercase',
          }}
        >
          SMART PRODUCTIVITY
        </span>
      )}
    </div>
  )
}

export default BeePlanLogo
