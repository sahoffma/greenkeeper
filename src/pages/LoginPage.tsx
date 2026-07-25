import { FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { mapAuthError, validateEmailAddress, validatePassword } from '../lib/authMessages'
import { resolveAuthenticatedDestination } from '../lib/authState'
import layoutStyles from './onboarding/onboardingScreen.module.css'
import themeStyles from './onboarding/onboardingTheme.module.css'
import welcomeStyles from './onboarding/OnboardingWelcomePage.module.css'
import styles from './LoginPage.module.css'

export function LoginPage() {
  const { signIn, onboardingCompleted } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectPath =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof location.state.from === 'string'
      ? location.state.from
      : resolveAuthenticatedDestination(onboardingCompleted)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const emailError = validateEmailAddress(email)
    const passwordError = validatePassword(password)

    if (emailError || passwordError) {
      setError(emailError ?? passwordError)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const { error: signInError } = await signIn(email.trim(), password)

      if (signInError) {
        setError(mapAuthError(signInError, 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.'))
        return
      }

      navigate(redirectPath, { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`app-shell ${themeStyles.shell}`}>
      <main className={`${layoutStyles.screen} ${themeStyles.screen} ${styles.screen}`}>
        <header className={styles.header}>
          <div className={`${welcomeStyles.brandBlock} ${styles.brandBlock}`}>
            <div className={welcomeStyles.logoMark} aria-hidden="true" />
            <p className={welcomeStyles.wordmark}>Greenkeeper</p>
          </div>

          <h1 className={`${themeStyles.title} ${styles.title}`}>Anmelden</h1>

          <p className={styles.subtitle}>Schön, dass du wieder da bist.</p>
        </header>

        <section className={styles.card} aria-labelledby="login-heading">
          <h2 id="login-heading" className="visually-hidden">
            Anmeldeformular
          </h2>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <label className={styles.field}>
              <span className={styles.label}>E-Mail-Adresse</span>
              <input
                className={styles.input}
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Passwort</span>
              <input
                className={styles.input}
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {error && <p className={styles.error}>{error}</p>}

            <button
              className={layoutStyles.primaryButton}
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Bitte warten …' : 'Anmelden'}
            </button>
          </form>

          <p className={styles.forgotPassword}>
            <Link
              to="/passwort-vergessen"
              className={`${welcomeStyles.loginLink} ${styles.forgotPasswordLink}`}
            >
              Passwort vergessen
            </Link>
          </p>

          <p className={`${welcomeStyles.loginHint} ${styles.registerHint}`}>
            Neu bei Greenkeeper?{' '}
            <Link to="/register" className={welcomeStyles.loginLink}>
              Konto erstellen
            </Link>
          </p>
        </section>
      </main>
    </div>
  )
}
