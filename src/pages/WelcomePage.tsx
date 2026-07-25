import { Link, useNavigate } from 'react-router-dom'
import layoutStyles from './onboarding/onboardingScreen.module.css'
import themeStyles from './onboarding/onboardingTheme.module.css'
import welcomeStyles from './onboarding/OnboardingWelcomePage.module.css'

export function WelcomePage() {
  const navigate = useNavigate()

  return (
    <div className={`app-shell ${themeStyles.shell}`}>
      <main className={`${layoutStyles.screen} ${themeStyles.screen}`}>
        <div className={`${layoutStyles.content} ${themeStyles.content} ${welcomeStyles.content}`}>
          <div className={welcomeStyles.brandBlock}>
            <div className={welcomeStyles.logoMark} aria-hidden="true" />
            <p className={welcomeStyles.wordmark}>Greenkeeper</p>
          </div>

          <h1 className={themeStyles.title}>
            Willkommen bei Greenkeeper
          </h1>

          <hr className={welcomeStyles.divider} />

          <p className={welcomeStyles.statement}>
            Für einen Rasen,
            <br />
            auf den du stolz bist.
          </p>
        </div>

        <div className={`${layoutStyles.footer} ${themeStyles.footer} ${welcomeStyles.footer}`}>
          <button
            type="button"
            className={layoutStyles.primaryButton}
            onClick={() => navigate('/register')}
          >
            Garten einrichten
          </button>

          <p className={welcomeStyles.loginHint}>
            Du bist bereits bei Greenkeeper?{' '}
            <Link to="/login" className={welcomeStyles.loginLink}>
              Anmelden
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
