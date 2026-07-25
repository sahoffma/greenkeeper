import { FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { mapAuthError, validateEmailAddress, validatePassword } from '../lib/authMessages'
import { resolveAuthenticatedDestination } from '../lib/authState'
import styles from './AuthPage.module.css'

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
    <div className="app-shell">
      <main className={`page page--home ${styles.page}`}>
        <header className="page-header">
          <h1 className="page-title">Anmelden</h1>
          <p className="page-subtitle">Willkommen zurück in deinem Garten.</p>
        </header>

        <section className={`surface-card ${styles.card}`} aria-labelledby="login-heading">
          <h2 id="login-heading" className={styles.cardTitle}>
            Bei Greenkeeper anmelden
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

            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? 'Bitte warten …' : 'Anmelden'}
            </button>
          </form>

          <p className={styles.switch}>
            <Link to="/passwort-vergessen" className={styles.switchLink}>
              Passwort vergessen
            </Link>
          </p>

          <p className={styles.switch}>
            Noch kein Konto?{' '}
            <Link to="/register" className={styles.switchLink}>
              Konto erstellen
            </Link>
          </p>
        </section>
      </main>
    </div>
  )
}
