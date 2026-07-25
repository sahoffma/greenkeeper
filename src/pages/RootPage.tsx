import { Navigate } from 'react-router-dom'
import { AuthLoadingScreen } from '../components/AuthLoadingScreen'
import { useAuth } from '../contexts/AuthContext'
import { HomeScreen } from './HomeScreen'
import { WelcomePage } from './WelcomePage'

export function RootPage() {
  const { session, bootstrapping, emailConfirmed, onboardingCompleted } = useAuth()

  if (bootstrapping) {
    return <AuthLoadingScreen />
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
