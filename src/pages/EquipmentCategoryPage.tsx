import { Navigate, useParams } from 'react-router-dom'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { SubpageHeader } from '../components/layout/SubpageHeader'
import { findEquipmentCategoryBySlug } from '../lib/equipmentCategoriesCore'
import styles from './EquipmentCategoryPage.module.css'

export function EquipmentCategoryPage() {
  const { categorySlug = '' } = useParams()
  const category = findEquipmentCategoryBySlug(categorySlug)

  if (!category) {
    return <Navigate to="/ausruestung" replace />
  }

  return (
    <HomeAppShell>
      <main className={styles.screen}>
        <SubpageHeader title={category.title} backTo="/ausruestung" backLabel="Zurück zu Ausrüstung" />
        <div className={styles.content}>
          <h1 className={styles.pageTitle}>{category.title}</h1>
          <p className={styles.message}>Dieser Bereich entsteht als Nächstes.</p>
        </div>
      </main>
    </HomeAppShell>
  )
}
