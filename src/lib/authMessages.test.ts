import { describe, expect, it } from 'vitest'
import type { AuthError } from '@supabase/supabase-js'
import {
  mapAuthError,
  validateEmailAddress,
  validatePasswordConfirmation,
} from './authMessages'
import { isEmailConfirmed } from './authState'

describe('authMessages', () => {
  it('maps invalid login credentials to German text', () => {
    expect(
      mapAuthError(
        { message: 'Invalid login credentials', name: 'AuthApiError', status: 400 } as AuthError,
        'fallback',
      ),
    ).toBe('E-Mail oder Passwort ist falsch.')
  })

  it('validates password confirmation', () => {
    expect(validatePasswordConfirmation('secret1', 'secret2')).toBe(
      'Die Passwörter stimmen nicht überein.',
    )
  })

  it('validates email format', () => {
    expect(validateEmailAddress('not-an-email')).toBe('Bitte gib eine gültige E-Mail-Adresse ein.')
  })
})

describe('authState', () => {
  it('detects confirmed email from email_confirmed_at', () => {
    expect(isEmailConfirmed({ email_confirmed_at: '2026-01-01T00:00:00Z' } as never)).toBe(true)
  })

  it('treats missing confirmation as unconfirmed', () => {
    expect(isEmailConfirmed({ email_confirmed_at: null } as never)).toBe(false)
  })
})
