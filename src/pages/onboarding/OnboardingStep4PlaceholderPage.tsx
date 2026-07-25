import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import {
  isValidAreaSize,
  parseLawnAreaCount,
  parseLawnCarePreference,
  parseMultipleLawnCount,
  readMultipleLawnNames,
  readMultipleLawnSizes,
} from '../../lib/onboardingFlow'
import {
  GREENKEEPER_HOME_ROUTE,
  ONBOARDING_SAVE_ERROR_MESSAGE,
  saveMultipleLawnOnboarding,
  saveSingleLawnOnboarding,
} from '../../lib/onboardingPersist'
import layoutStyles from './onboardingScreen.module.css'
import themeStyles from './onboardingTheme.module.css'
import styles from './OnboardingStep4PlaceholderPage.module.css'

export function OnboardingStep4PlaceholderPage() {
  const [searchParams] = useSearchParams()
  const areas = parseLawnAreaCount(searchParams.get('areas'))
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function completeLegacyOnboarding() {
      setSubmitError(null)
      setIsSaving(true)

      try {
        if (areas === 'single') {
          const rawSize = searchParams.get('size')
          const sizeSqm =
            rawSize && isValidAreaSize(rawSize) ? Number(rawSize.trim()) : null
          await saveSingleLawnOnboarding(sizeSqm)
        } else if (areas === 'multiple') {
          const care = parseLawnCarePreference(searchParams.get('care'))
          const count = parseMultipleLawnCount(searchParams.get('count'))

          if (!care || !count) {
            throw new Error(ONBOARDING_SAVE_ERROR_MESSAGE)
          }

          const names = readMultipleLawnNames(searchParams, count)
          const sizes = readMultipleLawnSizes(searchParams, count)

          await saveMultipleLawnOnboarding({
            names,
            sizes,
            carePreference: care,
          })
        } else {
          throw new Error(ONBOARDING_SAVE_ERROR_MESSAGE)
        }

        if (!cancelled) {
          window.location.replace(GREENKEEPER_HOME_ROUTE)
        }
      } catch {
        if (!cancelled) {
          setSubmitError(ONBOARDING_SAVE_ERROR_MESSAGE)
          setIsSaving(false)
        }
      }
    }

    void completeLegacyOnboarding()

    return () => {
      cancelled = true
    }
  }, [areas, searchParams])

  if (!areas) {
    return <Navigate to="/onboarding/2" replace />
  }

  if (isSaving && !submitError) {
    return (
      <div className={`app-shell ${themeStyles.shell}`}>
        <main className={`${layoutStyles.screen} ${themeStyles.screen}`}>
          <div className={`${layoutStyles.content} ${themeStyles.content}`}>
            <p className={styles.label}>Dein Garten wird eingerichtet …</p>
          </div>
        </main>
      </div>
    )
  }

  if (submitError) {
    return (
      <div className={`app-shell ${themeStyles.shell}`}>
        <main className={`${layoutStyles.screen} ${themeStyles.screen}`}>
          <div className={`${layoutStyles.content} ${themeStyles.content}`}>
            <p className={styles.label} role="alert">
              {submitError}
            </p>
          </div>
        </main>
      </div>
    )
  }

  return <Navigate to={GREENKEEPER_HOME_ROUTE} replace />
}
