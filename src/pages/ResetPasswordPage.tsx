import { FormEvent, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthPasswordField } from '../components/auth/AuthPasswordField'
import { useAuth } from '../contexts/AuthContext'
import { mapAuthError, validatePasswordConfirmation } from '../lib/authMessages'
import { resolveAuthenticatedDestination } from '../lib/authState'
import { markPasswordRecoveryPending } from '../lib/authCallback'
import { supabase } from '../lib/supabase'
import layoutStyles from './onboarding/onboardingScreen.module.css'
import themeStyles from './onboarding/onboardingTheme.module.css'
import welcomeStyles from './onboarding/OnboardingWelcomePage.module.css'
import styles from './ResetPasswordPage.module.css'

function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <div className={`app-shell ${themeStyles.shell}`}>
      <main className={`${layoutStyles.screen} ${themeStyles.screen} ${styles.screen}`}>
        <header className={styles.header}>
          <div className={`${welcomeStyles.brandBlock} ${styles.brandBlock}`}>
            <div className={welcomeStyles.logoMark} aria-hidden="true" />
            <p className={welcomeStyles.wordmark}>Greenkeeper</p>
          </div>

          <h1 className={`${themeStyles.title} ${styles.title}`}>{title}</h1>

          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </header>

        {children}
      </main>
    </div>
  )
}

export function ResetPasswordPage() {
  const {
    session,
    updatePassword,
    onboardingCompleted,
    emailConfirmed,
    clearPasswordRecovery,
  } = useAuth()
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
      const searchParams = new URLSearchParams(window.location.search)
      const code = searchParams.get('code')

      if (code) {
        markPasswordRecoveryPending()

        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (!mounted) {
          return
        }

        if (exchangeError) {
          setLinkValid(false)
          setCheckingLink(false)
          return
        }

        window.history.replaceState(null, '', window.location.pathname)
      }

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY' || nextSession) {
        if (event === 'PASSWORD_RECOVERY') {
          markPasswordRecoveryPending()
        }

        setLinkValid(Boolean(nextSession))
        setCheckingLink(false)
      }
    })

    void verifyRecoverySession()

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

      clearPasswordRecovery()
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
      <AuthShell title="Neues Passwort">
        <section className={styles.card}>
          <p className={styles.loadingText}>Link wird geprüft …</p>
        </section>
      </AuthShell>
    )
  }

  if (!linkValid) {
    return (
      <AuthShell
        title="Link ungültig"
        subtitle="Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an."
      >
        <section className={styles.card}>
          <p className={`${welcomeStyles.loginHint} ${styles.loginHint}`}>
            <Link to="/passwort-vergessen" className={welcomeStyles.loginLink}>
              Neuen Link anfordern
            </Link>
          </p>
        </section>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Neues Passwort"
      subtitle="Lege ein neues Passwort für dein Greenkeeper-Konto fest."
    >
      <section className={styles.card} aria-labelledby="reset-heading">
        <h2 id="reset-heading" className="visually-hidden">
          Passwort zurücksetzen
        </h2>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <AuthPasswordField label="Neues Passwort" value={password} onChange={setPassword} />

          <AuthPasswordField
            label="Passwort bestätigen"
            value={passwordConfirmation}
            onChange={setPasswordConfirmation}
          />

          {error && <p className={styles.error}>{error}</p>}
          {message && <p className={styles.message}>{message}</p>}

          <button
            className={layoutStyles.primaryButton}
            type="submit"
            disabled={submitting}
          >
            {submitting ? 'Bitte warten …' : 'Passwort speichern'}
          </button>
        </form>
      </section>
    </AuthShell>
  )
}
