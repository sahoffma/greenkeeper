import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import {
  assertNoClientAccessContextFields,
  type FertilizerEnrichmentAccessContextResolverDependencies,
  resolveFertilizerEnrichmentServerContexts,
} from './fertilizerEnrichmentAccessContextResolverCore'
import type { FertilizerEnrichmentServerRequestContext } from './fertilizerEnrichmentServerServiceCore'
import { FertilizerEnrichmentServerApiError } from './fertilizerEnrichmentServerServiceCore'
import {
  buildFertilizerEnrichmentSourceAccessScope,
  runWithFertilizerEnrichmentSourceAccessScopeAsync,
} from './fertilizerEnrichmentSourceAccessScopeCore'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import { createFertilizerProductProfileSaveHttpHandlers } from './fertilizerProductProfileSaveHandlerCore'
import type { FertilizerProductProfileSaveHttpRequest } from './fertilizerProductProfileSaveHandlerCore'
import type { FertilizerProductProfileSaveHttpResponse } from './fertilizerProductProfileSaveHandlerCore'
import {
  assertNoClientProductProfileSaveFields,
  FertilizerProductProfileSaveServerApiError,
  type FertilizerProductProfileSaveServerService,
} from './fertilizerProductProfileSaveServerServiceCore'

export interface FertilizerProductProfileSaveProductionHttpHandlerDependencies {
  service: FertilizerProductProfileSaveServerService
  accessContextResolver: FertilizerEnrichmentAccessContextResolverDependencies
  deriveSessionAccessHash?: DeriveSessionAccessHash
  isCompositionEnabled?: () => boolean
}

interface ResolvedProductionRequest {
  body: Record<string, unknown>
  accessContext: FertilizerEnrichmentAccessContext
  requestContext: FertilizerEnrichmentServerRequestContext
  setCookieHeader?: string
}

function mergeResponseHeaders(
  response: FertilizerProductProfileSaveHttpResponse,
  setCookieHeader?: string,
): FertilizerProductProfileSaveHttpResponse {
  if (!setCookieHeader) {
    return response
  }

  return {
    ...response,
    headers: {
      ...response.headers,
      'Set-Cookie': setCookieHeader,
    },
  }
}

async function resolveProductionRequest(
  request: FertilizerProductProfileSaveHttpRequest,
  dependencies: FertilizerProductProfileSaveProductionHttpHandlerDependencies,
): Promise<ResolvedProductionRequest> {
  let body: Record<string, unknown>

  try {
    body = JSON.parse(request.body ?? '{}') as Record<string, unknown>
  } catch {
    throw new FertilizerProductProfileSaveServerApiError(
      { code: 'invalid_request', message: 'Request body must be valid JSON.' },
      400,
    )
  }

  assertNoClientAccessContextFields(body)
  assertNoClientProductProfileSaveFields(body)

  const { accessContext, requestContext, setCookieHeader } =
    await resolveFertilizerEnrichmentServerContexts(
      request.headers ?? {},
      dependencies.accessContextResolver,
    )

  return { body, accessContext, requestContext, setCookieHeader }
}

function mapHandlerError(error: unknown): FertilizerProductProfileSaveHttpResponse {
  if (
    error instanceof FertilizerProductProfileSaveServerApiError ||
    error instanceof FertilizerEnrichmentServerApiError
  ) {
    return {
      statusCode: error.httpStatus,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.apiError }),
    }
  }

  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: {
        code: 'internal_server_error',
        message: 'Fertilizer product profile save request failed unexpectedly.',
      },
    }),
  }
}

async function runWithinSourceAccessScope<T>(
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const scope = buildFertilizerEnrichmentSourceAccessScope({
    userId: accessContext.kind === 'authenticated_user' ? accessContext.userId : null,
    sessionId:
      accessContext.kind === 'session'
        ? accessContext.sessionId
        : accessContext.sessionId ?? null,
    deriveSessionAccessHash,
  })

  if (!scope) {
    return fn()
  }

  return runWithFertilizerEnrichmentSourceAccessScopeAsync(scope, fn)
}

export function createFertilizerProductProfileSaveProductionHttpHandlers(
  dependencies: FertilizerProductProfileSaveProductionHttpHandlerDependencies,
) {
  async function withProductionRequest(
    request: FertilizerProductProfileSaveHttpRequest,
    run: (
      resolved: ResolvedProductionRequest,
      handlers: ReturnType<typeof createFertilizerProductProfileSaveHttpHandlers>,
    ) => Promise<FertilizerProductProfileSaveHttpResponse>,
  ): Promise<FertilizerProductProfileSaveHttpResponse> {
    try {
      const resolved = await resolveProductionRequest(request, dependencies)
      const handlers = createFertilizerProductProfileSaveHttpHandlers({
        service: dependencies.service,
        isCompositionEnabled: dependencies.isCompositionEnabled ?? (() => true),
        buildAccessContext: async () => resolved.accessContext,
      })

      const response = await runWithinSourceAccessScope(
        resolved.accessContext,
        dependencies.deriveSessionAccessHash,
        () => run(resolved, handlers),
      )
      return mergeResponseHeaders(response, resolved.setCookieHeader)
    } catch (error) {
      return mapHandlerError(error)
    }
  }

  return {
    async handleSave(request: FertilizerProductProfileSaveHttpRequest) {
      return withProductionRequest(request, (_resolved, handlers) => handlers.handleSave(request))
    },
  }
}
