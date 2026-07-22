import { useSearchParams } from 'react-router-dom'
import layoutStyles from './onboardingScreen.module.css'
import themeStyles from './onboardingTheme.module.css'
import styles from './OnboardingStep4PlaceholderPage.module.css'

export function OnboardingStep4PlaceholderPage() {
  const [searchParams] = useSearchParams()
  const areas = searchParams.get('areas')
  const size = searchParams.get('size')

  return (
    <div className={`app-shell ${themeStyles.shell}`}>
      <main className={`${layoutStyles.screen} ${themeStyles.screen}`}>
        <div className={`${layoutStyles.content} ${themeStyles.content}`}>
          <p className={styles.label}>Onboarding Schritt 4</p>
          {areas && <p className={styles.meta}>areas={areas}</p>}
          {size && <p className={styles.meta}>size={size} m²</p>}
        </div>
      </main>
    </div>
  )
}
