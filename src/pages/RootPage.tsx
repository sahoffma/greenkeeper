import { Navigate } from 'react-router-dom'
import { AuthLoadingScreen } from '../components/AuthLoadingScreen'
import { useAuth } from '../contexts/AuthContext'
import { PASSWORD_RESET_PATH } from '../lib/authCallback'
import { HomeScreen } from './HomeScreen'
import { WelcomePage } from './WelcomePage'

export function RootPage() {
  const { session, bootstrapping, emailConfirmed, onboardingCompleted, passwordRecoveryPending } =
    useAuth()

  if (bootstrapping) {
    return <AuthLoadingScreen />
  }

  if (passwordRecoveryPending) {
    return <Navigate to={PASSWORD_RESET_PATH} replace />
  }

  if (!session) {
    return <WelcomePage />
  }

  if (!emailConfirmed) {
    return <Navigate to="/email-bestaetigen" replace />
  }

  if (!onboardingCompleted) {
    return <Navigate to="/onboarding" replace />
  }

  return <HomeScreen />
}
