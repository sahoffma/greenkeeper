import { HomeAppShell } from '../components/home/HomeAppShell'
import styles from './PlaceholderTabPage.module.css'

export function JournalPage() {
  return (
    <HomeAppShell>
      <main className={styles.page}>
        <p className={styles.label}>Journal</p>
      </main>
    </HomeAppShell>
  )
}
