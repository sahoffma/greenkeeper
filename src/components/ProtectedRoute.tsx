import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { AuthLoadingScreen } from './AuthLoadingScreen'

interface ProtectedRouteProps {
  children: ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { session, bootstrapping, emailConfirmed, onboardingCompleted } = useAuth()
  const location = useLocation()

  if (bootstrapping) {
    return <AuthLoadingScreen />
  }

  if (!session) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  if (!emailConfirmed) {
    return <Navigate to="/email-bestaetigen" replace state={{ from: location.pathname }} />
  }

  if (!onboardingCompleted) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />
  }

  return children
}
