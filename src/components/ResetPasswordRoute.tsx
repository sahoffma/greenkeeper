import type { ReactNode } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { AuthLoadingScreen } from './AuthLoadingScreen'

interface ResetPasswordRouteProps {
  children: ReactNode
}

export function ResetPasswordRoute({ children }: ResetPasswordRouteProps) {
  const { bootstrapping } = useAuth()

  if (bootstrapping) {
    return <AuthLoadingScreen />
  }

  return children
}
