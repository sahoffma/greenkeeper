import { HomeAppShell } from '../components/home/HomeAppShell'
import styles from './PlaceholderTabPage.module.css'

export function JournalPage() {
  return (
    <HomeAppShell>
      <main className={styles.page}>
        <h1 className={styles.title}>Journal</h1>
        <p className={styles.message}>Dieser Bereich wird gerade vorbereitet.</p>
        <p className={styles.hint}>
          Hier siehst du später deine Pflegehistorie – chronologisch und nach Fläche filterbar.
        </p>
      </main>
    </HomeAppShell>
  )
}
