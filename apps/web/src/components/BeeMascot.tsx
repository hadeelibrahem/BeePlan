type BeeMascotProps = {
  size?: number
  flying?: boolean
  landing?: boolean
}

export function BeeMascot({ size = 26, flying = false, landing = false }: BeeMascotProps) {
  return (
    <svg
      aria-hidden="true"
      className={`bp-bee-mascot-svg${landing ? ' bp-bee-mascot-landing' : ''}`}
      height={size}
      viewBox="0 0 64 64"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className={`bp-bee-mascot-wings${flying ? ' bp-bee-mascot-wings-flying' : ''}`}>
        <path d="M24 25C14 15 4 18 9 29c3 6 10 7 17 4" fill="#fff" fillOpacity=".9" stroke="#cbd5e1" strokeWidth="1.5" />
        <path d="M40 25c10-10 20-7 15 4-3 6-10 7-17 4" fill="#fff" fillOpacity=".9" stroke="#cbd5e1" strokeWidth="1.5" />
      </g>
      <path d="M25 18c-2-6-5-7-7-8M39 18c2-6 5-7 7-8" fill="none" stroke="#2b323f" strokeLinecap="round" strokeWidth="2" />
      <circle cx="18" cy="9" r="1.5" fill="#2b323f" />
      <circle cx="46" cy="9" r="1.5" fill="#2b323f" />
      <g className="bp-bee-mascot-body">
        <ellipse cx="32" cy="35" fill="#fdef4b" rx="17" ry="15" />
        <path d="M19 28h26M16 36h32M19 44h26" fill="none" stroke="#2b323f" strokeLinecap="round" strokeWidth="5" />
        <circle cx="26" cy="31" r="1.7" fill="#2b323f" />
        <circle cx="38" cy="31" r="1.7" fill="#2b323f" />
        <path d="M28 38c2 2 6 2 8 0" fill="none" stroke="#2b323f" strokeLinecap="round" strokeWidth="1.8" />
        <path d="M18 39c-5 2-7 5-8 8M46 39c5 2 7 5 8 8" fill="none" stroke="#2b323f" strokeLinecap="round" strokeWidth="2" />
      </g>
    </svg>
  )
}

export default BeeMascot
