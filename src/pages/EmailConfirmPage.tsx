import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { mapAuthError } from '../lib/authMessages'
import { resolveAuthenticatedDestination } from '../lib/authState'
import styles from './AuthPage.module.css'

export function EmailConfirmPage() {
  const {
    user,
    emailConfirmed,
    onboardingCompleted,
    resendSignupConfirmation,
    signOut,
  } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const locationEmail =
    typeof location.state === 'object' &&
    location.state !== null &&
    'email' in location.state &&
    typeof location.state.email === 'string'
      ? location.state.email
      : null

  const [resending, setResending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const queryEmail = searchParams.get('email')
  const displayEmail = user?.email ?? locationEmail ?? queryEmail

  useEffect(() => {
    if (emailConfirmed) {
      setMessage(null)
      setError(null)
      navigate(resolveAuthenticatedDestination(onboardingCompleted), { replace: true })
    }
  }, [emailConfirmed, navigate, onboardingCompleted])

  async function handleResend() {
    if (!displayEmail) {
      setError('Keine E-Mail-Adresse verfügbar. Bitte melde dich erneut an oder registriere dich.')
      return
    }

    setResending(true)
    setError(null)
    setMessage(null)

    try {
      const { error: resendError } = await resendSignupConfirmation(displayEmail)

      if (resendError) {
        setError(
          mapAuthError(
            resendError,
            'Die E-Mail konnte nicht erneut gesendet werden. Bitte versuche es später erneut.',
          ),
        )
        return
      }

      setMessage('Wir haben dir erneut eine Bestätigungs-E-Mail geschickt.')
    } finally {
      setResending(false)
    }
  }

  async function handleUseOtherEmail() {
    await signOut()
    navigate('/register', { replace: true })
  }

  return (
    <div className="app-shell">
      <main className={`page page--home ${styles.page}`}>
        <header className="page-header">
          <h1 className="page-title">Bestätige deine E-Mail-Adresse</h1>
        </header>

        <section className={`surface-card ${styles.card}`} aria-labelledby="confirm-heading">
          <h2 id="confirm-heading" className={styles.cardTitle}>
            Fast geschafft
          </h2>

          <p className={styles.bodyText}>
            Wir haben dir eine E-Mail mit einem Bestätigungslink geschickt. Öffne den Link, um
            dein Konto zu bestätigen und deinen Garten einzurichten.
          </p>

          {displayEmail && (
            <p className={styles.emailDisplay} aria-label="Registrierte E-Mail-Adresse">
              {displayEmail}
            </p>
          )}

          <p className={styles.hint}>Schau auch in deinem Spam-Ordner nach, falls nichts ankommt.</p>

          {message && <p className={styles.message}>{message}</p>}
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <button
              className={styles.submit}
              type="button"
              disabled={resending}
              onClick={() => void handleResend()}
            >
              {resending ? 'Bitte warten …' : 'E-Mail erneut senden'}
            </button>

            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => void handleUseOtherEmail()}
            >
              Andere E-Mail-Adresse verwenden
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
