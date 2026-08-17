import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { HomeAccountMenu } from '../components/home/HomeAccountMenu'
import { HomeAreaSelector } from '../components/home/HomeAreaSelector'
import { HomeGreetingSection } from '../components/home/HomeGreetingSection'
import { HomeVoiceSection } from '../components/home/HomeVoiceSection'
import { useAuth } from '../contexts/AuthContext'
import { fetchAreas } from '../lib/areas'
import { fetchCareGroupMemberships } from '../lib/careGroups'
import { fertilizerHomeApplicationPath } from '../lib/fertilizerRoutes'
import { subscribeAreasChanged } from '../lib/areasRefresh'
import { resolveProfileFirstName } from '../lib/greeting'
import { fetchUserProfileState } from '../lib/profile'
import type { Area } from '../types/area'
import type { CareGroupMembershipRow } from '../types/careGroup'
import styles from './HomeScreen.module.css'

export function HomeScreen() {
  const { user } = useAuth()
  const [lawnAreas, setLawnAreas] = useState<Area[]>([])
  const [memberships, setMemberships] = useState<CareGroupMembershipRow[]>([])
  const [firstName, setFirstName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAreas = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [areas, membershipData] = await Promise.all([
        fetchAreas(),
        fetchCareGroupMemberships(),
      ])
      setLawnAreas(areas)
      setMemberships(membershipData)
    } catch {
      setLawnAreas([])
      setMemberships([])
      setError('Deine Rasenflächen konnten nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshAreasQuietly = useCallback(async () => {
    try {
      const [areas, membershipData] = await Promise.all([
        fetchAreas(),
        fetchCareGroupMemberships(),
      ])
      setLawnAreas(areas)
      setMemberships(membershipData)
      setError(null)
    } catch {
      setError('Deine Rasenflächen konnten nicht geladen werden.')
    }
  }, [])

  useEffect(() => {
    void loadAreas()
  }, [loadAreas])

  useEffect(() => {
    return subscribeAreasChanged(() => {
      void refreshAreasQuietly()
    })
  }, [refreshAreasQuietly])

  useEffect(() => {
    const currentUser = user

    if (!currentUser?.id) {
      setFirstName(null)
      return
    }

    let mounted = true

    async function loadProfile() {
      if (!currentUser?.id) {
        return
      }

      const userId = currentUser.id
      const userEmail = currentUser.email ?? null

      try {
        const profile = await fetchUserProfileState(userId)

        if (!mounted) {
          return
        }

        setFirstName(resolveProfileFirstName(profile.displayName, userEmail))
      } catch {
        if (mounted) {
          setFirstName(null)
        }
      }
    }

    void loadProfile()

    return () => {
      mounted = false
    }
  }, [user])

  const voiceArea = useMemo(() => lawnAreas[0] ?? null, [lawnAreas])

  return (
    <HomeAppShell>
      <main className={styles.screen}>
        <header className={styles.homeHeader}>
          <span className={styles.headerSide} aria-hidden="true" />
          <div className={styles.headerCenter}>
            {!loading && !error && lawnAreas.length > 0 && (
              <HomeGreetingSection firstName={firstName} />
            )}
          </div>
          <HomeAccountMenu />
        </header>

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
            <p className={styles.stateTitle}>Noch keine Rasenfläche gefunden.</p>
            <p className={styles.stateHint}>
              Wenn du gerade erst startest, kannst du deinen Garten erneut einrichten.
            </p>
            <Link to="/onboarding" className={styles.setupLink}>
              Einrichtung fortsetzen
            </Link>
          </section>
        )}

        {!loading && !error && lawnAreas.length > 0 && (
          <>
            <div className={styles.homeTop}>
              <HomeAreaSelector areas={lawnAreas} memberships={memberships} />
            </div>
            <section className={styles.activitySection} aria-label="Düngung erfassen">
              <Link to={fertilizerHomeApplicationPath()} className={styles.fertilizerCta}>
                Düngung erfassen
              </Link>
            </section>
            <div className={styles.voiceRegion}>
              <HomeVoiceSection selectedArea={voiceArea} />
            </div>
          </>
        )}
      </main>
    </HomeAppShell>
  )
}
