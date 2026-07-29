import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './SubpageHeader.module.css'

interface SubpageHeaderProps {
  title: string
  backTo?: string
  backLabel?: string
  trailing?: ReactNode
  hideTitle?: boolean
  onBeforeBack?: () => void
  /** Schrittweises Zurück ohne Router-Link (kein History-Eintrag). */
  onBack?: () => void
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M14.5 6.5 9 12l5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SubpageHeader({
  title,
  backTo,
  backLabel = 'Zurück',
  trailing,
  hideTitle = false,
  onBeforeBack,
  onBack,
}: SubpageHeaderProps) {
  const backControl =
    onBack != null ? (
      <button
        type="button"
        className={styles.backButton}
        aria-label={backLabel}
        onClick={() => {
          onBeforeBack?.()
          onBack()
        }}
      >
        <span className={styles.backIcon} aria-hidden="true">
          <BackIcon />
        </span>
      </button>
    ) : (
      <Link
        to={backTo ?? '/'}
        className={styles.backButton}
        aria-label={backLabel}
        onClick={() => onBeforeBack?.()}
      >
        <span className={styles.backIcon} aria-hidden="true">
          <BackIcon />
        </span>
      </Link>
    )

  if (hideTitle) {
    return (
      <header className={styles.headerBackOnly}>
        {backControl}
        <h1 className="visually-hidden">{title}</h1>
      </header>
    )
  }

  return (
    <header className={styles.header}>
      {backControl}
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.headerSlot}>{trailing ?? <span className={styles.headerSpacer} aria-hidden="true" />}</div>
    </header>
  )
}
