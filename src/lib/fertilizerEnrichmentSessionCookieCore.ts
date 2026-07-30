import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const FERTILIZER_ENRICHMENT_SESSION_COOKIE_NAME = 'gk_fe_session'
export const FERTILIZER_ENRICHMENT_SESSION_COOKIE_VERSION = 'v1'
export const FERTILIZER_ENRICHMENT_SESSION_ID_BYTE_LENGTH = 32

const SESSION_ID_HEX_PATTERN = /^[0-9a-f]{64}$/
const SIGNATURE_HEX_PATTERN = /^[0-9a-f]{64}$/

export class FertilizerEnrichmentSessionCookieError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FertilizerEnrichmentSessionCookieError'
  }
}

export interface FertilizerEnrichmentSessionCookieConfig {
  maxAgeSeconds: number
  secure: boolean
  path?: string
}

export interface FertilizerEnrichmentSessionCookieIssueResult {
  sessionId: string
  setCookieHeader: string
}

export interface FertilizerEnrichmentSessionCookieManager {
  issueSession(): FertilizerEnrichmentSessionCookieIssueResult
  readValidatedSessionId(headers: Record<string, string | undefined>): string | null
  buildSetCookieHeader(sessionId: string): string
}

function assertSigningSecret(signingSecret: string): string {
  const normalized = signingSecret.trim()
  if (!normalized) {
    throw new FertilizerEnrichmentSessionCookieError('Session cookie signing secret must not be empty.')
  }

  return normalized
}

function assertMaxAgeSeconds(maxAgeSeconds: number): number {
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds <= 0) {
    throw new FertilizerEnrichmentSessionCookieError(
      'Session cookie max age must be a positive safe integer.',
    )
  }

  return maxAgeSeconds
}

function signSessionPayload(signingSecret: string, sessionId: string): string {
  return createHmac('sha256', signingSecret)
    .update(`${FERTILIZER_ENRICHMENT_SESSION_COOKIE_VERSION}.${sessionId}`, 'utf8')
    .digest('hex')
}

function encodeCookieValue(sessionId: string, signature: string): string {
  return `${FERTILIZER_ENRICHMENT_SESSION_COOKIE_VERSION}.${sessionId}.${signature}`
}

function decodeCookieValue(rawValue: string): { sessionId: string; signature: string } | null {
  const parts = rawValue.split('.')
  if (parts.length !== 3) {
    return null
  }

  const [version, sessionId, signature] = parts
  if (version !== FERTILIZER_ENRICHMENT_SESSION_COOKIE_VERSION) {
    return null
  }

  if (!SESSION_ID_HEX_PATTERN.test(sessionId) || !SIGNATURE_HEX_PATTERN.test(signature)) {
    return null
  }

  return { sessionId, signature }
}

function signaturesEqual(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, 'utf8')
  const actualBuffer = Buffer.from(actual, 'utf8')

  if (expectedBuffer.length !== actualBuffer.length) {
    return false
  }

  return timingSafeEqual(expectedBuffer, actualBuffer)
}

export function generateFertilizerEnrichmentSessionId(): string {
  return randomBytes(FERTILIZER_ENRICHMENT_SESSION_ID_BYTE_LENGTH).toString('hex')
}

export function parseCookieHeader(
  cookieHeader: string | undefined,
  cookieName: string,
): string | undefined {
  if (!cookieHeader?.trim()) {
    return undefined
  }

  const target = cookieName.trim()
  for (const segment of cookieHeader.split(';')) {
    const trimmed = segment.trim()
    if (!trimmed) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const name = trimmed.slice(0, separatorIndex).trim()
    if (name !== target) {
      continue
    }

    return trimmed.slice(separatorIndex + 1).trim()
  }

  return undefined
}

export function validateFertilizerEnrichmentSessionCookieValue(
  rawValue: string,
  signingSecret: string,
): string | null {
  const decoded = decodeCookieValue(rawValue)
  if (!decoded) {
    return null
  }

  const expectedSignature = signSessionPayload(signingSecret, decoded.sessionId)
  if (!signaturesEqual(expectedSignature, decoded.signature)) {
    return null
  }

  return decoded.sessionId
}

export function buildFertilizerEnrichmentSessionSetCookieHeader(
  sessionId: string,
  signingSecret: string,
  config: FertilizerEnrichmentSessionCookieConfig,
): string {
  const normalizedSecret = assertSigningSecret(signingSecret)
  const signature = signSessionPayload(normalizedSecret, sessionId)
  const value = encodeCookieValue(sessionId, signature)
  const path = config.path ?? '/'
  const maxAgeSeconds = assertMaxAgeSeconds(config.maxAgeSeconds)
  const attributes = [
    `${FERTILIZER_ENRICHMENT_SESSION_COOKIE_NAME}=${value}`,
    'HttpOnly',
    `Path=${path}`,
    `Max-Age=${maxAgeSeconds}`,
    'SameSite=Lax',
  ]

  if (config.secure) {
    attributes.push('Secure')
  }

  return attributes.join('; ')
}

export function createFertilizerEnrichmentSessionCookieManager(
  signingSecret: string,
  config: FertilizerEnrichmentSessionCookieConfig,
): FertilizerEnrichmentSessionCookieManager {
  const normalizedSecret = assertSigningSecret(signingSecret)
  const cookieConfig = {
    ...config,
    maxAgeSeconds: assertMaxAgeSeconds(config.maxAgeSeconds),
  }

  return {
    issueSession() {
      const sessionId = generateFertilizerEnrichmentSessionId()
      return {
        sessionId,
        setCookieHeader: buildFertilizerEnrichmentSessionSetCookieHeader(
          sessionId,
          normalizedSecret,
          cookieConfig,
        ),
      }
    },

    readValidatedSessionId(headers) {
      const cookieHeader = headers.cookie ?? headers.Cookie
      const rawValue = parseCookieHeader(cookieHeader, FERTILIZER_ENRICHMENT_SESSION_COOKIE_NAME)
      if (!rawValue) {
        return null
      }

      return validateFertilizerEnrichmentSessionCookieValue(rawValue, normalizedSecret)
    },

    buildSetCookieHeader(sessionId) {
      if (!SESSION_ID_HEX_PATTERN.test(sessionId)) {
        throw new FertilizerEnrichmentSessionCookieError('Session identifier format is invalid.')
      }

      return buildFertilizerEnrichmentSessionSetCookieHeader(
        sessionId,
        normalizedSecret,
        cookieConfig,
      )
    },
  }
}
