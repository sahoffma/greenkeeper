import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { AuthLoadingScreen } from './AuthLoadingScreen'

interface OnboardingRouteProps {
  children: ReactNode
}

export function OnboardingRoute({ children }: OnboardingRouteProps) {
  const { session, bootstrapping, emailConfirmed, onboardingCompleted } = useAuth()
  const location = useLocation()

  if (bootstrapping) {
    return <AuthLoadingScreen />
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (!emailConfirmed) {
    return <Navigate to="/email-bestaetigen" replace />
  }

  if (onboardingCompleted) {
    return <Navigate to="/" replace />
  }

  return children
}
