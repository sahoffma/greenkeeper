import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { mapAuthError, validateEmailAddress } from '../lib/authMessages'
import styles from './AuthPage.module.css'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const emailError = validateEmailAddress(email)

    if (emailError) {
      setError(emailError)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const { error: resetError } = await requestPasswordReset(email.trim())

      if (resetError) {
        setError(
          mapAuthError(
            resetError,
            'Die Anfrage konnte nicht gesendet werden. Bitte versuche es erneut.',
          ),
        )
        return
      }

      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="app-shell">
      <main className={`page page--home ${styles.page}`}>
        <header className="page-header">
          <h1 className="page-title">Passwort vergessen</h1>
        </header>

        <section className={`surface-card ${styles.card}`} aria-labelledby="forgot-heading">
          <h2 id="forgot-heading" className={styles.cardTitle}>
            Neues Passwort anfordern
          </h2>

          {submitted ? (
            <>
              <p className={styles.bodyText}>
                Wenn ein Konto mit dieser E-Mail-Adresse existiert, haben wir dir eine E-Mail mit
                einem Link zum Zurücksetzen geschickt.
              </p>
              <p className={styles.hint}>Schau auch in deinem Spam-Ordner nach.</p>
              <p className={styles.switch}>
                <Link to="/login" className={styles.switchLink}>
                  Zurück zur Anmeldung
                </Link>
              </p>
            </>
          ) : (
            <>
              <p className={styles.bodyText}>
                Gib deine E-Mail-Adresse ein. Wir senden dir einen Link, mit dem du ein neues
                Passwort festlegen kannst.
              </p>

              <form className={styles.form} onSubmit={handleSubmit}>
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

                {error && <p className={styles.error}>{error}</p>}

                <button className={styles.submit} type="submit" disabled={submitting}>
                  {submitting ? 'Bitte warten …' : 'Link senden'}
                </button>
              </form>

              <p className={styles.switch}>
                <Link to="/login" className={styles.switchLink}>
                  Zurück zur Anmeldung
                </Link>
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
