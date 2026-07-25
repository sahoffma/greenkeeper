import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { isEmailConfirmed, resolveAuthenticatedDestination } from '../lib/authState'
import { AuthLoadingScreen } from './AuthLoadingScreen'

interface EmailConfirmationRouteProps {
  children: ReactNode
}

export function EmailConfirmationRoute({ children }: EmailConfirmationRouteProps) {
  const { session, user, bootstrapping, onboardingCompleted } = useAuth()
  const location = useLocation()
  const pendingEmail =
    (typeof location.state === 'object' &&
      location.state !== null &&
      'email' in location.state &&
      typeof location.state.email === 'string' &&
      location.state.email) ||
    new URLSearchParams(location.search).get('email')

  if (bootstrapping) {
    return <AuthLoadingScreen />
  }

  if (session && isEmailConfirmed(user)) {
    return <Navigate to={resolveAuthenticatedDestination(onboardingCompleted)} replace />
  }

  if (!session && !pendingEmail) {
    return <Navigate to="/login" replace />
  }

  return children
}
