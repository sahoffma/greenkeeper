import { useNavigate } from 'react-router-dom'
import layoutStyles from './onboardingScreen.module.css'
import themeStyles from './onboardingTheme.module.css'
import styles from './OnboardingWelcomePage.module.css'

export function OnboardingWelcomePage() {
  const navigate = useNavigate()

  return (
    <div className={`app-shell ${themeStyles.shell}`}>
      <main className={`${layoutStyles.screen} ${themeStyles.screen}`}>
        <div className={`${layoutStyles.content} ${themeStyles.content} ${styles.content}`}>
          <div className={styles.brandBlock}>
            <div className={styles.logoMark} aria-hidden="true" />
            <p className={styles.wordmark}>Greenkeeper</p>
          </div>

          <h1 className={themeStyles.title}>
            Lass uns deinen
            <br />
            Garten einrichten
          </h1>

          <hr className={styles.divider} />

          <p className={styles.statement}>
            In wenigen Schritten legst du deine Rasenflächen an — ruhig, Schritt für Schritt.
          </p>
        </div>

        <div className={`${layoutStyles.footer} ${themeStyles.footer}`}>
          <button
            type="button"
            className={layoutStyles.primaryButton}
            onClick={() => navigate('/onboarding/2')}
          >
            Garten einrichten
          </button>
        </div>
      </main>
    </div>
  )
}
