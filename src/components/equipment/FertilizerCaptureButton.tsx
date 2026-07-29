import { Link } from 'react-router-dom'
import { PlusCircleIcon } from './FertilizerNavIcons'
import styles from './FertilizerCaptureButton.module.css'

interface FertilizerCaptureButtonProps {
  to: string
}

export function FertilizerCaptureButton({ to }: FertilizerCaptureButtonProps) {
  return (
    <Link to={to} className={styles.button}>
      <span className={styles.iconWrap} aria-hidden="true">
        <PlusCircleIcon />
      </span>
      <span className={styles.label}>Dünger erfassen</span>
    </Link>
  )
}
