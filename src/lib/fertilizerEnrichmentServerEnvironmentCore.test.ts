import { describe, expect, it } from 'vitest'
import {
  deriveFertilizerEnrichmentSessionMaxAgeSeconds,
  FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS,
  FERTILIZER_ENRICHMENT_SESSION_ACCESS_HMAC_SECRET_ENV,
  FERTILIZER_ENRICHMENT_SESSION_COOKIE_SIGNING_SECRET_ENV,
  FertilizerEnrichmentServerConfigurationError,
  loadFertilizerEnrichmentServerEnvironment,
} from './fertilizerEnrichmentServerEnvironmentCore'

const BASE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  [FERTILIZER_ENRICHMENT_SESSION_ACCESS_HMAC_SECRET_ENV]: 'hmac-secret',
  [FERTILIZER_ENRICHMENT_SESSION_COOKIE_SIGNING_SECRET_ENV]: 'cookie-signing-secret',
  [FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS.continuableDays]: '7',
  [FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS.sessionMaxHours]: '72',
  [FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS.terminalDays]: '30',
  [FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS.intakeReadyDays]: '14',
}

describe('fertilizerEnrichmentServerEnvironmentCore', () => {
  it('EC-1: complete configuration loads successfully', () => {
    const environment = loadFertilizerEnrichmentServerEnvironment(BASE_ENV)

    expect(environment.supabaseUrl).toBe('https://example.supabase.co')
    expect(environment.supabaseServiceRoleKey).toBe('service-role-key')
    expect(environment.sessionAccessHmacSecret).toBe('hmac-secret')
    expect(environment.sessionCookieSigningSecret).toBe('cookie-signing-secret')
    expect(environment.sessionCookieSecure).toBe(false)
    expect(environment.sessionMaxAgeSeconds).toBe(72 * 3600)
    expect(environment.retention).toEqual({
      continuableDays: 7,
      sessionMaxHours: 72,
      terminalDays: 30,
      intakeReadyDays: 14,
    })
  })

  it('EC-2: missing HMAC secret throws controlled configuration error without secret leakage', () => {
    const env: Record<string, string | undefined> = { ...BASE_ENV }
    env[FERTILIZER_ENRICHMENT_SESSION_ACCESS_HMAC_SECRET_ENV] = undefined

    expect(() => loadFertilizerEnrichmentServerEnvironment(env)).toThrow(
      FertilizerEnrichmentServerConfigurationError,
    )

    try {
      loadFertilizerEnrichmentServerEnvironment(env)
    } catch (error) {
      expect(String(error)).not.toContain('service-role-key')
      expect(String(error)).not.toContain('hmac-secret')
    }
  })

  it('EC-3: missing Supabase configuration throws controlled configuration error', () => {
    const env = { ...BASE_ENV, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' }

    expect(() => loadFertilizerEnrichmentServerEnvironment(env)).toThrow(
      FertilizerEnrichmentServerConfigurationError,
    )

    try {
      loadFertilizerEnrichmentServerEnvironment(env)
    } catch (error) {
      expect(String(error)).not.toContain('service-role-key')
    }
  })

  it('EC-4: empty secret is rejected', () => {
    expect(() =>
      loadFertilizerEnrichmentServerEnvironment({
        ...BASE_ENV,
        [FERTILIZER_ENRICHMENT_SESSION_ACCESS_HMAC_SECRET_ENV]: '   ',
      }),
    ).toThrow(FertilizerEnrichmentServerConfigurationError)
  })

  it('EC-5: invalid retention configuration throws controlled configuration error', () => {
    expect(() =>
      loadFertilizerEnrichmentServerEnvironment({
        ...BASE_ENV,
        [FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS.continuableDays]: '0',
      }),
    ).toThrow(FertilizerEnrichmentServerConfigurationError)
  })

  it('EC-6: missing cookie signing secret throws controlled configuration error', () => {
    const env: Record<string, string | undefined> = { ...BASE_ENV }
    env[FERTILIZER_ENRICHMENT_SESSION_COOKIE_SIGNING_SECRET_ENV] = undefined

    expect(() => loadFertilizerEnrichmentServerEnvironment(env)).toThrow(
      FertilizerEnrichmentServerConfigurationError,
    )

    try {
      loadFertilizerEnrichmentServerEnvironment(env)
    } catch (error) {
      expect(String(error)).not.toContain('cookie-signing-secret')
    }
  })

  it('EC-7: empty cookie signing secret is rejected', () => {
    expect(() =>
      loadFertilizerEnrichmentServerEnvironment({
        ...BASE_ENV,
        [FERTILIZER_ENRICHMENT_SESSION_COOKIE_SIGNING_SECRET_ENV]: '   ',
      }),
    ).toThrow(FertilizerEnrichmentServerConfigurationError)
  })

  it('EC-8: persistence and cookie signing secrets are loaded separately', () => {
    const environment = loadFertilizerEnrichmentServerEnvironment({
      ...BASE_ENV,
      [FERTILIZER_ENRICHMENT_SESSION_ACCESS_HMAC_SECRET_ENV]: 'persist-secret',
      [FERTILIZER_ENRICHMENT_SESSION_COOKIE_SIGNING_SECRET_ENV]: 'cookie-secret',
    })

    expect(environment.sessionAccessHmacSecret).toBe('persist-secret')
    expect(environment.sessionCookieSigningSecret).toBe('cookie-secret')
    expect(environment.sessionAccessHmacSecret).not.toBe(environment.sessionCookieSigningSecret)
  })

  it('ENV-1: session max hours load as positive safe integers', () => {
    const environment = loadFertilizerEnrichmentServerEnvironment({
      ...BASE_ENV,
      [FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS.sessionMaxHours]: '5',
    })

    expect(environment.retention.sessionMaxHours).toBe(5)
    expect(environment.sessionMaxAgeSeconds).toBe(18000)
    expect(Number.isSafeInteger(environment.retention.sessionMaxHours)).toBe(true)
    expect(Number.isSafeInteger(environment.sessionMaxAgeSeconds)).toBe(true)
  })

  it('ENV-2: overflow during seconds derivation throws controlled configuration error', () => {
    const overflowHours = String(Math.floor(Number.MAX_SAFE_INTEGER / 3600) + 1)

    expect(() =>
      loadFertilizerEnrichmentServerEnvironment({
        ...BASE_ENV,
        [FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS.sessionMaxHours]: overflowHours,
      }),
    ).toThrow(FertilizerEnrichmentServerConfigurationError)

    expect(() => deriveFertilizerEnrichmentSessionMaxAgeSeconds(Number(overflowHours))).toThrow(
      FertilizerEnrichmentServerConfigurationError,
    )
  })

  it('ENV-3: production context enables secure session cookies', () => {
    const environment = loadFertilizerEnrichmentServerEnvironment({
      ...BASE_ENV,
      CONTEXT: 'production',
    })

    expect(environment.sessionCookieSecure).toBe(true)
  })

  it('ENV-4: non-production context disables secure session cookies', () => {
    const environment = loadFertilizerEnrichmentServerEnvironment({
      ...BASE_ENV,
      CONTEXT: 'deploy-preview',
    })

    expect(environment.sessionCookieSecure).toBe(false)
  })

  it('ENV-5: configuration errors contain no secret leakage', () => {
    try {
      loadFertilizerEnrichmentServerEnvironment({
        ...BASE_ENV,
        [FERTILIZER_ENRICHMENT_SESSION_COOKIE_SIGNING_SECRET_ENV]: '',
      })
    } catch (error) {
      expect(String(error)).not.toContain('cookie-signing-secret')
      expect(String(error)).not.toContain('hmac-secret')
    }
  })
})
