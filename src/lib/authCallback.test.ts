import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildPasswordResetUrl,
  clearPasswordRecoveryPending,
  isPasswordRecoveryPending,
  isPasswordResetPath,
  isRecoveryHash,
  markPasswordRecoveryPending,
  shouldRedirectToPasswordReset,
} from './authCallback'

describe('authCallback', () => {
  beforeEach(() => {
    const storage = new Map<string, string>()

    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value)
      },
      removeItem: (key: string) => {
        storage.delete(key)
      },
    })

    vi.stubGlobal('window', {
      location: {
        pathname: '/',
        search: '',
        hash: '',
      },
      history: {
        replaceState: vi.fn(),
      },
    })
  })

  afterEach(() => {
    clearPasswordRecoveryPending()
    vi.unstubAllGlobals()
  })

  function setLocation(pathname: string, search = '', hash = '') {
    window.location.pathname = pathname
    window.location.search = search
    window.location.hash = hash
  }

  it('detects recovery hash parameters', () => {
    setLocation('/', '', '#access_token=abc&type=recovery')
    expect(isRecoveryHash()).toBe(true)
  })

  it('builds reset URL preserving hash and search', () => {
    setLocation('/', '?code=xyz', '#access_token=abc&type=recovery')
    expect(buildPasswordResetUrl()).toBe('/passwort-zuruecksetzen?code=xyz#access_token=abc&type=recovery')
  })

  it('redirects to reset page when recovery hash is on root', () => {
    setLocation('/', '', '#type=recovery&access_token=abc')
    expect(shouldRedirectToPasswordReset('/')).toBe(true)
    expect(shouldRedirectToPasswordReset('/passwort-zuruecksetzen')).toBe(false)
  })

  it('tracks pending recovery in session storage', () => {
    expect(isPasswordRecoveryPending()).toBe(false)
    markPasswordRecoveryPending()
    expect(isPasswordRecoveryPending()).toBe(true)
    clearPasswordRecoveryPending()
    expect(isPasswordRecoveryPending()).toBe(false)
  })

  it('recognizes password reset path', () => {
    expect(isPasswordResetPath('/passwort-zuruecksetzen')).toBe(true)
    expect(isPasswordResetPath('/')).toBe(false)
  })
})
