import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styles from './EquipmentNavCard.module.css'

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M9.5 6.5 14.5 12l-5 5.5"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface EquipmentNavCardProps {
  to: string
  title: string
  description: string
  icon: ReactNode
  variant?: 'primary' | 'secondary'
}

export function EquipmentNavCard({
  to,
  title,
  description,
  icon,
  variant = 'secondary',
}: EquipmentNavCardProps) {
  const isPrimary = variant === 'primary'

  return (
    <Link
      to={to}
      className={`${styles.card} ${isPrimary ? styles.cardPrimary : ''}`}
    >
      <span
        className={`${styles.iconWrap} ${isPrimary ? styles.iconWrapPrimary : ''}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <span className={styles.copy}>
        <h2 className={`${styles.title} ${isPrimary ? styles.titlePrimary : ''}`}>{title}</h2>
        <p className={styles.description}>{description}</p>
      </span>
      <span className={styles.chevron} aria-hidden="true">
        <ChevronIcon />
      </span>
    </Link>
  )
}
