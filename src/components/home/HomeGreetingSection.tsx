import { buildHomeGreeting } from '../../lib/greeting'
import styles from './HomeGreetingSection.module.css'

interface HomeGreetingSectionProps {
  firstName: string | null
}

export function HomeGreetingSection({ firstName }: HomeGreetingSectionProps) {
  const headline = buildHomeGreeting(firstName)

  return (
    <header className={styles.section}>
      <h1 className={styles.headline}>{headline}</h1>
    </header>
  )
}
