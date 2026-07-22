import { FormEvent, useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import styles from './LoginPage.module.css'

type AuthMode = 'login' | 'register'

export function LoginPage() {
  const { session, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectPath =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof location.state.from === 'string'
      ? location.state.from
      : '/'

  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setError(null)
    setMessage(null)
  }, [mode])

  if (session) {
    return <Navigate to={redirectPath} replace />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setMessage(null)

    try {
      if (mode === 'login') {
        const { error: signInError } = await signIn(email.trim(), password)

        if (signInError) {
          setError(signInError.message)
          return
        }

        navigate(redirectPath, { replace: true })
        return
      }

      const { error: signUpError, needsEmailConfirmation } = await signUp(
        email.trim(),
        password,
      )

      if (signUpError) {
        setError(signUpError.message)
        return
      }

      if (needsEmailConfirmation) {
        setMessage('Registrierung erfolgreich. Bitte bestätige deine E-Mail-Adresse.')
        setMode('login')
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
          <h1 className="page-title">Greenkeeper</h1>
          <p className="page-subtitle">
            {mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
          </p>
        </header>

        <section className={`surface-card ${styles.card}`} aria-labelledby="auth-heading">
          <h2 id="auth-heading" className={styles.cardTitle}>
            {mode === 'login' ? 'Willkommen zurück' : 'Neues Konto'}
          </h2>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>E-Mail</span>
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
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            {error && <p className={styles.error}>{error}</p>}
            {message && <p className={styles.message}>{message}</p>}

            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting
                ? 'Bitte warten …'
                : mode === 'login'
                  ? 'Anmelden'
                  : 'Registrieren'}
            </button>
          </form>

          <p className={styles.switch}>
            {mode === 'login' ? 'Noch kein Konto?' : 'Bereits registriert?'}{' '}
            <button
              type="button"
              className={styles.switchButton}
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Jetzt registrieren' : 'Zur Anmeldung'}
            </button>
          </p>
        </section>
      </main>
    </div>
  )
}
