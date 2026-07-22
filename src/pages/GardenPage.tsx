import { HomeAppShell } from '../components/home/HomeAppShell'
import styles from './PlaceholderTabPage.module.css'

export function GardenPage() {
  return (
    <HomeAppShell>
      <main className={styles.page}>
        <p className={styles.label}>Garten</p>
      </main>
    </HomeAppShell>
  )
}
