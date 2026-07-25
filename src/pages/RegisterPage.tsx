import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  mapAuthError,
  validateEmailAddress,
  validatePasswordConfirmation,
} from '../lib/authMessages'
import layoutStyles from './onboarding/onboardingScreen.module.css'
import themeStyles from './onboarding/onboardingTheme.module.css'
import welcomeStyles from './onboarding/OnboardingWelcomePage.module.css'
import styles from './RegisterPage.module.css'

export function RegisterPage() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const emailError = validateEmailAddress(email)
    const passwordError = validatePasswordConfirmation(password, passwordConfirmation)

    if (emailError || passwordError) {
      setError(emailError ?? passwordError)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const { error: signUpError, needsEmailConfirmation } = await signUp(
        email.trim(),
        password,
      )

      if (signUpError) {
        setError(mapAuthError(signUpError, 'Registrierung fehlgeschlagen. Bitte versuche es erneut.'))
        return
      }

      if (needsEmailConfirmation) {
        navigate(`/email-bestaetigen?email=${encodeURIComponent(email.trim())}`, {
          replace: true,
          state: { email: email.trim() },
        })
        return
      }

      navigate('/onboarding', { replace: true })
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

          <h1 className={`${themeStyles.title} ${styles.title}`}>Konto erstellen</h1>

          <p className={styles.subtitle}>Für deinen Rasen.</p>
        </header>

        <section className={styles.card} aria-labelledby="register-heading">
          <h2 id="register-heading" className="visually-hidden">
            Registrierungsformular
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
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span className={styles.label}>Passwort bestätigen</span>
              <input
                className={styles.input}
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
              />
            </label>

            {error && <p className={styles.error}>{error}</p>}

            <button
              className={layoutStyles.primaryButton}
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Bitte warten …' : 'Konto erstellen'}
            </button>
          </form>

          <p className={styles.note}>
            Sicher gespeichert.
            <br />
            Auf all deinen Geräten verfügbar.
          </p>

          <p className={`${welcomeStyles.loginHint} ${styles.loginHint}`}>
            Du bist bereits bei Greenkeeper?{' '}
            <Link to="/login" className={welcomeStyles.loginLink}>
              Anmelden
            </Link>
          </p>
        </section>
      </main>
    </div>
  )
}
