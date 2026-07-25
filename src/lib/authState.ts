import type { User } from '@supabase/supabase-js'

export function isEmailConfirmed(user: User | null | undefined): boolean {
  if (!user) {
    return false
  }

  if (user.email_confirmed_at) {
    return true
  }

  if (user.confirmed_at) {
    return true
  }

  return false
}

export function resolveAuthenticatedDestination(onboardingCompleted: boolean): '/' | '/onboarding' {
  return onboardingCompleted ? '/' : '/onboarding'
}

export function authRedirectPath(origin = window.location.origin): string {
  return origin
}

export function emailConfirmRedirectUrl(): string {
  return `${authRedirectPath()}/email-bestaetigen`
}

export function passwordResetRedirectUrl(): string {
  return `${authRedirectPath()}/passwort-zuruecksetzen`
}
