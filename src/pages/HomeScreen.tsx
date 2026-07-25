import { useCallback, useEffect, useState } from 'react'
import { ConversationSection } from '../components/home/ConversationSection'
import { HeroSection } from '../components/home/HeroSection'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { LawnCarouselSection } from '../components/home/LawnCarouselSection'
import { fetchAreas } from '../lib/areas'
import type { Area } from '../types/area'
import styles from './HomeScreen.module.css'

export function HomeScreen() {
  const [lawnAreas, setLawnAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAreas = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const areas = await fetchAreas()
      setLawnAreas(areas)
    } catch (loadError) {
      setLawnAreas([])
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Deine Rasenflächen konnten nicht geladen werden.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadAreas()
  }, [loadAreas])

  return (
    <HomeAppShell>
      <main className={styles.screen}>
        <HeroSection />
        <ConversationSection />

        <div className={styles.lawnSpacing}>
          {loading && (
            <section className={styles.stateCard} aria-live="polite" aria-busy="true">
              <p className={styles.stateTitle}>Rasenflächen werden geladen …</p>
            </section>
          )}

          {!loading && error && (
            <section className={styles.stateCard} aria-live="polite">
              <p className={styles.stateTitle}>{error}</p>
              <button type="button" className={styles.retryButton} onClick={() => void loadAreas()}>
                Erneut versuchen
              </button>
            </section>
          )}

          {!loading && !error && lawnAreas.length === 0 && (
            <section className={styles.stateCard} aria-live="polite">
              <p className={styles.stateTitle}>Noch keine Rasenflächen vorhanden</p>
              <p className={styles.stateHint}>
                Schließe die Garten-Einrichtung ab, um deine Rasenflächen hier zu sehen.
              </p>
            </section>
          )}

          {!loading && !error && lawnAreas.length > 0 && (
            <LawnCarouselSection lawnAreas={lawnAreas} />
          )}
        </div>
      </main>
    </HomeAppShell>
  )
}
