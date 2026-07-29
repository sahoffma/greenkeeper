import { Link } from 'react-router-dom'
import type { EquipmentCategory } from '../../lib/equipmentCategoriesCore'
import { EquipmentCategoryIcon } from './EquipmentCategoryIcon'
import styles from './EquipmentCategoryCard.module.css'

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

interface EquipmentCategoryCardProps {
  category: EquipmentCategory
}

export function EquipmentCategoryCard({ category }: EquipmentCategoryCardProps) {
  return (
    <Link to={category.path} className={styles.card} data-category={category.id}>
      <span className={styles.iconWrap} aria-hidden="true">
        <EquipmentCategoryIcon categoryId={category.id} />
      </span>
      <span className={styles.copy}>
        <h2 className={styles.title}>{category.title}</h2>
        <p className={styles.subtitle}>{category.subtitle}</p>
      </span>
      <span className={styles.chevron} aria-hidden="true">
        <ChevronIcon />
      </span>
    </Link>
  )
}
