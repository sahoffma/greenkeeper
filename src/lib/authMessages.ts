import type { AuthError } from '@supabase/supabase-js'

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase()
}

export function mapAuthError(error: AuthError | null, fallback: string): string {
  if (!error?.message) {
    return fallback
  }

  const message = normalizeMessage(error.message)

  if (message.includes('invalid login credentials')) {
    return 'E-Mail oder Passwort ist falsch.'
  }

  if (message.includes('email not confirmed')) {
    return 'Bitte bestätige zuerst deine E-Mail-Adresse.'
  }

  if (message.includes('user already registered')) {
    return 'Mit dieser E-Mail-Adresse existiert bereits ein Konto.'
  }

  if (message.includes('password should be at least')) {
    return 'Das Passwort muss mindestens 6 Zeichen lang sein.'
  }

  if (message.includes('unable to validate email address')) {
    return 'Bitte gib eine gültige E-Mail-Adresse ein.'
  }

  if (message.includes('signup is disabled')) {
    return 'Registrierung ist derzeit nicht möglich. Bitte versuche es später erneut.'
  }

  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.'
  }

  if (message.includes('email link is invalid') || message.includes('otp has expired')) {
    return 'Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.'
  }

  if (message.includes('new password should be different')) {
    return 'Das neue Passwort muss sich vom bisherigen unterscheiden.'
  }

  if (message.includes('same_password')) {
    return 'Das neue Passwort muss sich vom bisherigen unterscheiden.'
  }

  return fallback
}

export function validateEmailAddress(email: string): string | null {
  const trimmed = email.trim()

  if (!trimmed) {
    return 'Bitte gib deine E-Mail-Adresse ein.'
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return 'Bitte gib eine gültige E-Mail-Adresse ein.'
  }

  return null
}

export function validatePassword(password: string): string | null {
  if (!password) {
    return 'Bitte gib ein Passwort ein.'
  }

  if (password.length < 6) {
    return 'Das Passwort muss mindestens 6 Zeichen lang sein.'
  }

  return null
}

export function validatePasswordConfirmation(
  password: string,
  confirmation: string,
): string | null {
  const passwordError = validatePassword(password)

  if (passwordError) {
    return passwordError
  }

  if (password !== confirmation) {
    return 'Die Passwörter stimmen nicht überein.'
  }

  return null
}
