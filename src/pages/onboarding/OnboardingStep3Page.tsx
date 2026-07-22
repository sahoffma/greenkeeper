import { useSearchParams } from 'react-router-dom'
import { OnboardingSingleAreaSizePage } from './OnboardingSingleAreaSizePage'
import layoutStyles from './onboardingScreen.module.css'
import themeStyles from './onboardingTheme.module.css'
import styles from './OnboardingStep3Page.module.css'

function OnboardingStep3MultiplePlaceholder() {
  return (
    <div className={`app-shell ${themeStyles.shell}`}>
      <main className={`${layoutStyles.screen} ${themeStyles.screen}`}>
        <div className={`${layoutStyles.content} ${themeStyles.content}`}>
          <p className={styles.label}>Mehrere Rasenflächen – folgt</p>
        </div>
      </main>
    </div>
  )
}

export function OnboardingStep3Page() {
  const [searchParams] = useSearchParams()
  const areas = searchParams.get('areas')

  if (areas === 'single') {
    return <OnboardingSingleAreaSizePage />
  }

  return <OnboardingStep3MultiplePlaceholder />
}
