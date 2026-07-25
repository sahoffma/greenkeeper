import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  mapAuthError,
  validateEmailAddress,
  validatePasswordConfirmation,
} from '../lib/authMessages'
import styles from './AuthPage.module.css'

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
    <div className="app-shell">
      <main className={`page page--home ${styles.page}`}>
        <header className="page-header">
          <h1 className="page-title">Konto erstellen</h1>
          <p className="page-subtitle">Starte mit deinem persönlichen Garten.</p>
        </header>

        <section className={`surface-card ${styles.card}`} aria-labelledby="register-heading">
          <h2 id="register-heading" className={styles.cardTitle}>
            Dein Greenkeeper-Konto
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

            <button className={styles.submit} type="submit" disabled={submitting}>
              {submitting ? 'Bitte warten …' : 'Konto erstellen'}
            </button>
          </form>

          <p className={styles.note}>
            Mit deinem Konto bleiben deine Rasenflächen und Pflegedaten sicher gespeichert und
            auf deinen Geräten verfügbar.
          </p>

          <p className={styles.switch}>
            Du hast bereits ein Konto?{' '}
            <Link to="/login" className={styles.switchLink}>
              Anmelden
            </Link>
          </p>
        </section>
      </main>
    </div>
  )
}
