import type { FertilizerEnrichmentRetentionPolicyConfig } from './fertilizerEnrichmentRetentionPolicyCore'

export class FertilizerEnrichmentServerConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FertilizerEnrichmentServerConfigurationError'
  }
}

export interface FertilizerEnrichmentSourceStorageEnvironment {
  bucket: string
  maxTextBytes: number
}

export interface FertilizerEnrichmentServerEnvironment {
  supabaseUrl: string
  supabaseServiceRoleKey: string
  sessionAccessHmacSecret: string
  sessionCookieSigningSecret: string
  sessionCookieSecure: boolean
  sessionMaxAgeSeconds: number
  retention: FertilizerEnrichmentRetentionPolicyConfig
  sourceStorage?: FertilizerEnrichmentSourceStorageEnvironment | null
}

export const FERTILIZER_ENRICHMENT_SOURCE_STORAGE_BUCKET_ENV =
  'FERTILIZER_ENRICHMENT_SOURCE_STORAGE_BUCKET'

export const FERTILIZER_ENRICHMENT_SOURCE_STORAGE_MAX_TEXT_BYTES_ENV =
  'FERTILIZER_ENRICHMENT_SOURCE_STORAGE_MAX_TEXT_BYTES'

export const FERTILIZER_ENRICHMENT_SESSION_ACCESS_HMAC_SECRET_ENV =
  'FERTILIZER_ENRICHMENT_SESSION_ACCESS_HMAC_SECRET'

export const FERTILIZER_ENRICHMENT_SESSION_COOKIE_SIGNING_SECRET_ENV =
  'FERTILIZER_ENRICHMENT_SESSION_COOKIE_SIGNING_SECRET'

export const FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS = {
  continuableDays: 'FERTILIZER_ENRICHMENT_RETENTION_CONTINUABLE_DAYS',
  sessionMaxHours: 'FERTILIZER_ENRICHMENT_RETENTION_SESSION_MAX_HOURS',
  terminalDays: 'FERTILIZER_ENRICHMENT_RETENTION_TERMINAL_DAYS',
  intakeReadyDays: 'FERTILIZER_ENRICHMENT_RETENTION_INTAKE_READY_DAYS',
} as const

function readRequiredNonEmpty(env: Record<string, string | undefined>, key: string): string {
  const value = env[key]?.trim()
  if (!value) {
    throw new FertilizerEnrichmentServerConfigurationError(
      `Fertilizer enrichment server configuration is incomplete (${key}).`,
    )
  }

  return value
}

function readRequiredPositiveInteger(
  env: Record<string, string | undefined>,
  key: string,
): number {
  const raw = readRequiredNonEmpty(env, key)
  const parsed = Number.parseInt(raw, 10)

  if (!Number.isFinite(parsed) || !Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new FertilizerEnrichmentServerConfigurationError(
      `Fertilizer enrichment server configuration is invalid (${key}).`,
    )
  }

  return parsed
}

export function deriveFertilizerEnrichmentSessionMaxAgeSeconds(sessionMaxHours: number): number {
  if (!Number.isSafeInteger(sessionMaxHours) || sessionMaxHours <= 0) {
    throw new FertilizerEnrichmentServerConfigurationError(
      'Fertilizer enrichment server configuration is invalid (session max hours).',
    )
  }

  const maxAgeSeconds = sessionMaxHours * 3600
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new FertilizerEnrichmentServerConfigurationError(
      'Fertilizer enrichment server configuration is invalid (session max age seconds).',
    )
  }

  return maxAgeSeconds
}

function readSessionCookieSecure(env: Record<string, string | undefined>): boolean {
  return env.CONTEXT?.trim() === 'production'
}

function loadOptionalSourceStorageEnvironment(
  env: Record<string, string | undefined>,
): FertilizerEnrichmentSourceStorageEnvironment | null {
  const bucket = env[FERTILIZER_ENRICHMENT_SOURCE_STORAGE_BUCKET_ENV]?.trim()
  const maxTextBytesRaw = env[FERTILIZER_ENRICHMENT_SOURCE_STORAGE_MAX_TEXT_BYTES_ENV]?.trim()

  if (!bucket && !maxTextBytesRaw) {
    return null
  }

  if (!bucket || !maxTextBytesRaw) {
    throw new FertilizerEnrichmentServerConfigurationError(
      'Fertilizer enrichment source storage configuration is incomplete.',
    )
  }

  const maxTextBytes = Number.parseInt(maxTextBytesRaw, 10)
  if (!Number.isFinite(maxTextBytes) || !Number.isSafeInteger(maxTextBytes) || maxTextBytes <= 0) {
    throw new FertilizerEnrichmentServerConfigurationError(
      'Fertilizer enrichment source storage configuration is invalid (max text bytes).',
    )
  }

  return {
    bucket,
    maxTextBytes,
  }
}

export function loadFertilizerEnrichmentServerEnvironment(
  env: Record<string, string | undefined> = process.env,
): FertilizerEnrichmentServerEnvironment {
  const sessionMaxHours = readRequiredPositiveInteger(
    env,
    FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS.sessionMaxHours,
  )

  return {
    supabaseUrl: readRequiredNonEmpty(env, 'SUPABASE_URL'),
    supabaseServiceRoleKey: readRequiredNonEmpty(env, 'SUPABASE_SERVICE_ROLE_KEY'),
    sessionAccessHmacSecret: readRequiredNonEmpty(
      env,
      FERTILIZER_ENRICHMENT_SESSION_ACCESS_HMAC_SECRET_ENV,
    ),
    sessionCookieSigningSecret: readRequiredNonEmpty(
      env,
      FERTILIZER_ENRICHMENT_SESSION_COOKIE_SIGNING_SECRET_ENV,
    ),
    sessionCookieSecure: readSessionCookieSecure(env),
    sessionMaxAgeSeconds: deriveFertilizerEnrichmentSessionMaxAgeSeconds(sessionMaxHours),
    retention: {
      continuableDays: readRequiredPositiveInteger(
        env,
        FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS.continuableDays,
      ),
      sessionMaxHours,
      terminalDays: readRequiredPositiveInteger(
        env,
        FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS.terminalDays,
      ),
      intakeReadyDays: readRequiredPositiveInteger(
        env,
        FERTILIZER_ENRICHMENT_RETENTION_ENV_KEYS.intakeReadyDays,
      ),
    },
    sourceStorage: loadOptionalSourceStorageEnvironment(env),
  }
}
