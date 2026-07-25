import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { mapAuthError, validatePasswordConfirmation } from '../lib/authMessages'
import { resolveAuthenticatedDestination } from '../lib/authState'
import { supabase } from '../lib/supabase'
import styles from './AuthPage.module.css'

export function ResetPasswordPage() {
  const { session, updatePassword, onboardingCompleted, emailConfirmed } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [checkingLink, setCheckingLink] = useState(true)
  const [linkValid, setLinkValid] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    async function verifyRecoverySession() {
      const { data, error: sessionError } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      if (sessionError) {
        setLinkValid(false)
        setCheckingLink(false)
        return
      }

      setLinkValid(Boolean(data.session))
      setCheckingLink(false)
    }

    void verifyRecoverySession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY' || nextSession) {
        setLinkValid(Boolean(nextSession))
        setCheckingLink(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const passwordError = validatePasswordConfirmation(password, passwordConfirmation)

    if (passwordError) {
      setError(passwordError)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const { error: updateError } = await updatePassword(password)

      if (updateError) {
        setError(
          mapAuthError(
            updateError,
            'Das Passwort konnte nicht gespeichert werden. Bitte versuche es erneut.',
          ),
        )
        return
      }

      setMessage('Dein Passwort wurde gespeichert.')

      if (session && emailConfirmed) {
        navigate(resolveAuthenticatedDestination(onboardingCompleted), { replace: true })
        return
      }

      navigate('/login', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  if (checkingLink) {
    return (
      <div className="app-shell">
        <main className={`page page--home ${styles.page}`}>
          <p className={styles.bodyText}>Link wird geprüft …</p>
        </main>
      </div>
    )
  }

  if (!linkValid) {
    return (
      <div className="app-shell">
        <main className={`page page--home ${styles.page}`}>
          <header className="page-header">
            <h1 className="page-title">Link ungültig</h1>
          </header>

          <section className={`surface-card ${styles.card}`}>
            <p className={styles.bodyText}>
              Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.
            </p>
            <p className={styles.switch}>
              <Link to="/passwort-vergessen" className={styles.switchLink}>
                Neuen Link anfordern
              </Link>
            </p>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <main className={`page page--home ${styles.page}`}>
        <header className="page-header">
          <h1 className="page-title">Neues Passwort festlegen</h1>
        </header>

        <section className={`surface-card ${styles.card}`} aria-labelledby="reset-heading">
          <h2 id="reset-heading" className={styles.cardTitle}>
            Wähle ein neues Passwort
          </h2>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span className={styles.label}>Neues Passwort</span>
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
            {message && <p className={styles.message}>{message}</p>}

            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? 'Bitte warten …' : 'Passwort speichern'}
            </button>
          </form>
        </section>
      </main>
    </div>
  )
}
