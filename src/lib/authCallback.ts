export const PASSWORD_RESET_PATH = '/passwort-zuruecksetzen'

const RECOVERY_FLAG_KEY = 'gk-auth-recovery-pending'

export function getHashAuthParams(): URLSearchParams {
  const raw = window.location.hash.replace(/^#/, '')
  return new URLSearchParams(raw)
}

export function isRecoveryHash(): boolean {
  return getHashAuthParams().get('type') === 'recovery'
}

export function isPasswordResetPath(pathname: string): boolean {
  return pathname === PASSWORD_RESET_PATH
}

export function markPasswordRecoveryPending(): void {
  sessionStorage.setItem(RECOVERY_FLAG_KEY, '1')
}

export function clearPasswordRecoveryPending(): void {
  sessionStorage.removeItem(RECOVERY_FLAG_KEY)
}

export function isPasswordRecoveryPending(): boolean {
  return sessionStorage.getItem(RECOVERY_FLAG_KEY) === '1'
}

export function shouldRedirectToPasswordReset(pathname: string): boolean {
  if (isPasswordResetPath(pathname)) {
    return false
  }

  return isRecoveryHash() || isPasswordRecoveryPending()
}

export function buildPasswordResetUrl(): string {
  return `${PASSWORD_RESET_PATH}${window.location.search}${window.location.hash}`
}

export function redirectToPasswordResetIfNeeded(): boolean {
  if (!shouldRedirectToPasswordReset(window.location.pathname)) {
    return false
  }

  window.location.replace(buildPasswordResetUrl())
  return true
}

export function hasAuthCallbackInUrl(): boolean {
  const hashParams = getHashAuthParams()
  const searchParams = new URLSearchParams(window.location.search)

  return (
    hashParams.has('access_token') ||
    hashParams.has('type') ||
    searchParams.has('code') ||
    searchParams.has('token_hash')
  )
}
