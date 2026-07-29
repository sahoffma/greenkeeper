import { Link } from 'react-router-dom'
import styles from './EquipmentEmptyState.module.css'

interface EquipmentEmptyStateProps {
  title: string
  message: string
  actionLabel?: string
  actionTo?: string
}

export function EquipmentEmptyState({
  title,
  message,
  actionLabel,
  actionTo,
}: EquipmentEmptyStateProps) {
  return (
    <div className={styles.panel}>
      <h1 className={styles.title}>{title}</h1>
      <p className={styles.message}>{message}</p>
      {actionLabel && actionTo && (
        <Link to={actionTo} className={styles.action}>
          {actionLabel}
        </Link>
      )}
    </div>
  )
}
