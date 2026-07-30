import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerEnrichmentServerRequestContext } from './fertilizerEnrichmentServerServiceCore'
import { FertilizerEnrichmentServerApiError } from './fertilizerEnrichmentServerServiceCore'
import type { FertilizerEnrichmentSessionCookieManager } from './fertilizerEnrichmentSessionCookieCore'

/** Legacy insecure header — rejected when present; never used as session source. */
export const FERTILIZER_ENRICHMENT_SESSION_ID_HEADER = 'x-greenkeeper-enrichment-session-id'

export interface FertilizerEnrichmentAuthValidator {
  validateBearerToken(token: string): Promise<string | null>
}

export interface FertilizerEnrichmentAccessContextResolverDependencies {
  authValidator: FertilizerEnrichmentAuthValidator
  sessionCookieManager: FertilizerEnrichmentSessionCookieManager
  createRequestId?: () => string
}

export interface FertilizerEnrichmentResolvedServerContexts {
  accessContext: FertilizerEnrichmentAccessContext
  requestContext: FertilizerEnrichmentServerRequestContext
  setCookieHeader?: string
}

const FORBIDDEN_CLIENT_ACCESS_BODY_FIELDS = [
  'accessContext',
  'userId',
  'sessionId',
  'sessionAccessHash',
  'session_access_hash',
  'revision',
  'recordSchemaVersion',
  'orchestrationInput',
  'lastSourceProvisionIdempotencyKey',
  'expiresAt',
] as const

function defaultCreateRequestId(): string {
  return crypto.randomUUID()
}

function readHeader(
  headers: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const direct = headers[name]?.trim()
  if (direct) {
    return direct
  }

  const lowerName = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName && value?.trim()) {
      return value.trim()
    }
  }

  return undefined
}

function readBearerToken(headers: Record<string, string | undefined>): string | null {
  const authorization = readHeader(headers, 'authorization')
  if (!authorization?.startsWith('Bearer ')) {
    return null
  }

  const token = authorization.slice('Bearer '.length).trim()
  return token || null
}

function assertLegacySessionHeaderNotUsed(headers: Record<string, string | undefined>): void {
  if (readHeader(headers, FERTILIZER_ENRICHMENT_SESSION_ID_HEADER)) {
    throw new FertilizerEnrichmentServerApiError(
      {
        code: 'invalid_request',
        message: 'Client-provided enrichment session headers are not accepted.',
      },
      400,
    )
  }
}

export function assertNoClientAccessContextFields(body: Record<string, unknown>): void {
  for (const field of FORBIDDEN_CLIENT_ACCESS_BODY_FIELDS) {
    if (field in body) {
      throw new FertilizerEnrichmentServerApiError(
        {
          code: 'invalid_request',
          message: 'Client-provided access context fields are not accepted.',
        },
        400,
      )
    }
  }
}

function resolveAnonymousSessionAccess(
  headers: Record<string, string | undefined>,
  sessionCookieManager: FertilizerEnrichmentSessionCookieManager,
): { accessContext: Extract<FertilizerEnrichmentAccessContext, { kind: 'session' }>; setCookieHeader?: string } {
  const validatedSessionId = sessionCookieManager.readValidatedSessionId(headers)
  if (validatedSessionId) {
    return {
      accessContext: {
        kind: 'session',
        sessionId: validatedSessionId,
      },
    }
  }

  const issued = sessionCookieManager.issueSession()
  return {
    accessContext: {
      kind: 'session',
      sessionId: issued.sessionId,
    },
    setCookieHeader: issued.setCookieHeader,
  }
}

export async function resolveFertilizerEnrichmentAccessContext(
  headers: Record<string, string | undefined>,
  dependencies: FertilizerEnrichmentAccessContextResolverDependencies,
): Promise<FertilizerEnrichmentAccessContext> {
  assertLegacySessionHeaderNotUsed(headers)

  const bearerToken = readBearerToken(headers)
  if (bearerToken) {
    const userId = await dependencies.authValidator.validateBearerToken(bearerToken)
    if (!userId) {
      throw new FertilizerEnrichmentServerApiError(
        { code: 'unauthorized', message: 'Access to this enrichment job is not authorized.' },
        401,
      )
    }

    return {
      kind: 'authenticated_user',
      userId,
      sessionId: null,
    }
  }

  return resolveAnonymousSessionAccess(headers, dependencies.sessionCookieManager).accessContext
}

export function buildFertilizerEnrichmentRequestContext(
  accessContext: FertilizerEnrichmentAccessContext,
  dependencies: FertilizerEnrichmentAccessContextResolverDependencies,
): FertilizerEnrichmentServerRequestContext {
  const createRequestId = dependencies.createRequestId ?? defaultCreateRequestId

  if (accessContext.kind === 'authenticated_user') {
    return {
      userId: accessContext.userId,
      sessionId: null,
      requestId: createRequestId(),
    }
  }

  return {
    userId: null,
    sessionId: accessContext.sessionId,
    requestId: createRequestId(),
  }
}

export async function resolveFertilizerEnrichmentServerContexts(
  headers: Record<string, string | undefined>,
  dependencies: FertilizerEnrichmentAccessContextResolverDependencies,
): Promise<FertilizerEnrichmentResolvedServerContexts> {
  assertLegacySessionHeaderNotUsed(headers)

  const bearerToken = readBearerToken(headers)
  if (bearerToken) {
    const userId = await dependencies.authValidator.validateBearerToken(bearerToken)
    if (!userId) {
      throw new FertilizerEnrichmentServerApiError(
        { code: 'unauthorized', message: 'Access to this enrichment job is not authorized.' },
        401,
      )
    }

    const accessContext: FertilizerEnrichmentAccessContext = {
      kind: 'authenticated_user',
      userId,
      sessionId: null,
    }

    return {
      accessContext,
      requestContext: buildFertilizerEnrichmentRequestContext(accessContext, dependencies),
    }
  }

  const anonymous = resolveAnonymousSessionAccess(headers, dependencies.sessionCookieManager)
  return {
    accessContext: anonymous.accessContext,
    requestContext: buildFertilizerEnrichmentRequestContext(
      anonymous.accessContext,
      dependencies,
    ),
    setCookieHeader: anonymous.setCookieHeader,
  }
}
