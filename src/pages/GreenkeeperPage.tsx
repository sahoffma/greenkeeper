import { HomeAppShell } from '../components/home/HomeAppShell'
import styles from './PlaceholderTabPage.module.css'

export function GreenkeeperPage() {
  return (
    <HomeAppShell>
      <main className={styles.page}>
        <h1 className={styles.title}>Greenkeeper</h1>
        <p className={styles.message}>Dieser Bereich wird gerade vorbereitet.</p>
        <p className={styles.hint}>
          Hier findest du später Grundlagenwissen, Tipps und Orientierung für deinen Rasen.
        </p>
      </main>
    </HomeAppShell>
  )
}
