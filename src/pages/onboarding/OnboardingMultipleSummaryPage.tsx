import { Navigate, useSearchParams } from 'react-router-dom'
import {
  buildMultipleLawnDrafts,
  parseLawnCarePreference,
  parseMultipleLawnCount,
  readMultipleLawnNames,
  readMultipleLawnSizes,
} from '../../lib/onboardingFlow'
import layoutStyles from './onboardingScreen.module.css'
import themeStyles from './onboardingTheme.module.css'
import styles from './OnboardingMultipleSummaryPage.module.css'

export function OnboardingMultipleSummaryPage() {
  const [searchParams] = useSearchParams()
  const care = parseLawnCarePreference(searchParams.get('care'))
  const count = parseMultipleLawnCount(searchParams.get('count'))

  if (!care || !count) {
    return <Navigate to="/onboarding/2" replace />
  }

  const names = readMultipleLawnNames(searchParams, count)
  const sizes = readMultipleLawnSizes(searchParams, count)
  const lawns = buildMultipleLawnDrafts({ count, names, sizes })

  return (
    <div className={`app-shell ${themeStyles.shell}`}>
      <main className={`${layoutStyles.screen} ${themeStyles.screen}`}>
        <div className={`${layoutStyles.content} ${themeStyles.content} ${styles.content}`}>
          <h1 className={`${themeStyles.title} ${styles.title}`}>Deine Rasenflächen</h1>
          <p className={`${themeStyles.description} ${styles.description}`}>
            Du kannst Namen und Größen später jederzeit anpassen.
          </p>

          <ul className={styles.list}>
            {lawns.map((lawn) => (
              <li key={lawn.name} className={styles.item}>
                <span className={styles.itemName}>{lawn.name}</span>
                <span className={styles.itemSize}>
                  {lawn.sizeSqm !== null ? `${lawn.sizeSqm} m²` : 'Größe noch nicht festgelegt'}
                </span>
              </li>
            ))}
          </ul>

          <p className={styles.note}>Onboarding Schritt 4 – weiterer Abschluss folgt</p>
        </div>
      </main>
    </div>
  )
}
