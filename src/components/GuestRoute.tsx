import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isEmailConfirmed } from '../lib/authState'
import { PASSWORD_RESET_PATH } from '../lib/authCallback'
import { AuthLoadingScreen } from './AuthLoadingScreen'

interface GuestRouteProps {
  children: ReactNode
}

export function GuestRoute({ children }: GuestRouteProps) {
  const { session, user, bootstrapping, onboardingCompleted, passwordRecoveryPending } = useAuth()
  const location = useLocation()
  const redirectPath =
    typeof location.state === 'object' &&
    location.state !== null &&
    'from' in location.state &&
    typeof location.state.from === 'string'
      ? location.state.from
      : '/'

  if (bootstrapping) {
    return <AuthLoadingScreen />
  }

  if (session) {
    if (passwordRecoveryPending) {
      return <Navigate to={PASSWORD_RESET_PATH} replace />
    }

    if (!isEmailConfirmed(user)) {
      return <Navigate to="/email-bestaetigen" replace />
    }

    if (!onboardingCompleted) {
      return <Navigate to="/onboarding" replace />
    }

    return <Navigate to={redirectPath} replace />
  }

  return children
}
