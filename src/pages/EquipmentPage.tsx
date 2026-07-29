import { HomeAppShell } from '../components/home/HomeAppShell'
import { EquipmentCategoryCard } from '../components/equipment/EquipmentCategoryCard'
import { EQUIPMENT_CATEGORIES } from '../lib/equipmentCategoriesCore'
import styles from './EquipmentPage.module.css'

export function EquipmentPage() {
  return (
    <HomeAppShell>
      <main className={styles.screen}>
        <h1 className="visually-hidden">Ausrüstung</h1>

        <ul className={styles.list} aria-label="Ausrüstungskategorien">
          {EQUIPMENT_CATEGORIES.map((category) => (
            <li key={category.id}>
              <EquipmentCategoryCard category={category} />
            </li>
          ))}
        </ul>
      </main>
    </HomeAppShell>
  )
}
