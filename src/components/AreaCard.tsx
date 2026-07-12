import { Link } from 'react-router-dom'
import type { Area } from '../types/area'
import styles from './AreaCard.module.css'

interface AreaCardProps {
  area: Area
}

export function AreaCard({ area }: AreaCardProps) {
  const isNavigable = area.id === 'main' && area.dashboard

  const content = (
    <>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{area.subtitle}</p>
          <h2 className={styles.title}>{area.name}</h2>
        </div>
        <span className={`status-pill status-pill--${area.status}`}>
          {area.statusLabel}
        </span>
      </div>

      <p className={styles.size}>{area.sizeLabel}</p>

      {area.summary ? (
        <p className={styles.summary}>{area.summary}</p>
      ) : (
        <p className={styles.summaryMuted}>
          Noch keine weiteren Daten hinterlegt.
        </p>
      )}
    </>
  )

  if (isNavigable) {
    return (
      <Link to={`/area/${area.id}`} className={`${styles.card} ${styles.cardInteractive}`}>
        {content}
      </Link>
    )
  }

  return <article className={styles.card}>{content}</article>
}
