import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { PASSWORD_RESET_PATH } from '../lib/authCallback'

export function AuthRecoveryRedirect() {
  const { passwordRecoveryPending } = useAuth()
  const location = useLocation()

  if (!passwordRecoveryPending || location.pathname === PASSWORD_RESET_PATH) {
    return null
  }

  return (
    <Navigate
      to={{ pathname: PASSWORD_RESET_PATH, search: location.search, hash: location.hash }}
      replace
    />
  )
}
