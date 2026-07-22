/**
 * Temporäre Platzhalter-Icons für die Rasenflächen-Auswahl.
 * TODO: Durch finale Greenkeeper-SVGs ersetzen.
 */

export type LawnAreaIconVariant = 'single' | 'multiple'

interface LawnAreaOptionIconProps {
  variant: LawnAreaIconVariant
  className?: string
}

export function LawnAreaOptionIcon({ variant, className }: LawnAreaOptionIconProps) {
  if (variant === 'single') {
    return <SingleLawnAreaIconPlaceholder className={className} />
  }

  return <MultipleLawnAreasIconPlaceholder className={className} />
}

function SingleLawnAreaIconPlaceholder({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 56 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="5"
        y="5"
        width="46"
        height="26"
        rx="8"
        fill="rgba(47, 107, 79, 0.08)"
        stroke="rgba(47, 107, 79, 0.32)"
        strokeWidth="1.5"
      />
      <path d="M14 14h28" stroke="rgba(47, 107, 79, 0.22)" strokeWidth="1" strokeLinecap="round" />
      <path d="M14 19.5h28" stroke="rgba(47, 107, 79, 0.16)" strokeWidth="1" strokeLinecap="round" />
      <path d="M14 25h28" stroke="rgba(47, 107, 79, 0.12)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

function MultipleLawnAreasIconPlaceholder({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 56 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect
        x="4"
        y="8"
        width="22"
        height="20"
        rx="6"
        fill="rgba(47, 107, 79, 0.08)"
        stroke="rgba(47, 107, 79, 0.32)"
        strokeWidth="1.5"
      />
      <path d="M9 15h12" stroke="rgba(47, 107, 79, 0.2)" strokeWidth="1" strokeLinecap="round" />
      <path d="M9 20h12" stroke="rgba(47, 107, 79, 0.14)" strokeWidth="1" strokeLinecap="round" />
      <rect
        x="30"
        y="8"
        width="22"
        height="20"
        rx="6"
        fill="rgba(47, 107, 79, 0.08)"
        stroke="rgba(47, 107, 79, 0.32)"
        strokeWidth="1.5"
      />
      <path d="M35 15h12" stroke="rgba(47, 107, 79, 0.2)" strokeWidth="1" strokeLinecap="round" />
      <path d="M35 20h12" stroke="rgba(47, 107, 79, 0.14)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}
