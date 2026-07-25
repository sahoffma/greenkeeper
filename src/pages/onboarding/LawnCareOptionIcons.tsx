/**
 * Stilisierte Rasenflächen-Icons für die Pflegepräferenz-Auswahl.
 * Reduzierter Stil passend zu LawnAreaOptionIcons.
 */

export type LawnCareIconVariant = 'together' | 'separate'

interface LawnCareOptionIconProps {
  variant: LawnCareIconVariant
  className?: string
}

export function LawnCareOptionIcon({ variant, className }: LawnCareOptionIconProps) {
  if (variant === 'together') {
    return <TogetherLawnCareIcon className={className} />
  }

  return <SeparateLawnCareIcon className={className} />
}

function lawnRect(x: number, y: number, width: number, height: number) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx="6"
      fill="rgba(47, 107, 79, 0.08)"
      stroke="rgba(47, 107, 79, 0.32)"
      strokeWidth="1.5"
    />
  )
}

function lawnLines(x: number, y1: number, y2: number, width: number) {
  return (
    <>
      <path
        d={`M${x} ${y1}h${width}`}
        stroke="rgba(47, 107, 79, 0.2)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d={`M${x} ${y2}h${width}`}
        stroke="rgba(47, 107, 79, 0.14)"
        strokeWidth="1"
        strokeLinecap="round"
      />
    </>
  )
}

function TogetherLawnCareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 56 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {lawnRect(8, 8, 18, 20)}
      {lawnLines(13, 15, 20, 8)}
      {lawnRect(30, 8, 18, 20)}
      {lawnLines(35, 15, 20, 8)}
      <rect
        x="24"
        y="16"
        width="8"
        height="4"
        rx="2"
        fill="rgba(47, 107, 79, 0.12)"
      />
    </svg>
  )
}

function SeparateLawnCareIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 56 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {lawnRect(4, 8, 20, 20)}
      {lawnLines(9, 15, 20, 10)}
      {lawnRect(32, 8, 20, 20)}
      {lawnLines(37, 15, 20, 10)}
    </svg>
  )
}
