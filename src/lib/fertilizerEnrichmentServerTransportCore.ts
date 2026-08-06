import type {
  FertilizerEnrichmentHttpRequest,
  FertilizerEnrichmentHttpResponse,
} from './fertilizerEnrichmentServerHandlerCore'
import { createFertilizerEnrichmentHttpHandlers } from './fertilizerEnrichmentServerHandlerCore'
import {
  assertNoClientAccessContextFields,
  type FertilizerEnrichmentAccessContextResolverDependencies,
  resolveFertilizerEnrichmentServerContexts,
} from './fertilizerEnrichmentAccessContextResolverCore'
import type { FertilizerEnrichmentServerService } from './fertilizerEnrichmentServerServiceCore'
import {
  FertilizerEnrichmentServerApiError,
  type FertilizerEnrichmentServerRequestContext,
} from './fertilizerEnrichmentServerServiceCore'
import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import {
  buildFertilizerEnrichmentSourceAccessScope,
  runWithFertilizerEnrichmentSourceAccessScopeAsync,
} from './fertilizerEnrichmentSourceAccessScopeCore'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'

export interface FertilizerEnrichmentProductionHttpHandlerDependencies {
  service: FertilizerEnrichmentServerService
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
  response: FertilizerEnrichmentHttpResponse,
  setCookieHeader?: string,
): FertilizerEnrichmentHttpResponse {
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
  request: FertilizerEnrichmentHttpRequest,
  dependencies: FertilizerEnrichmentProductionHttpHandlerDependencies,
): Promise<ResolvedProductionRequest> {
  let body: Record<string, unknown>

  try {
    body = JSON.parse(request.body ?? '{}') as Record<string, unknown>
  } catch {
    throw new FertilizerEnrichmentServerApiError(
      { code: 'invalid_request', message: 'Request body must be valid JSON.' },
      400,
    )
  }

  assertNoClientAccessContextFields(body)

  const { accessContext, requestContext, setCookieHeader } =
    await resolveFertilizerEnrichmentServerContexts(
      request.headers ?? {},
      dependencies.accessContextResolver,
    )

  return { body, accessContext, requestContext, setCookieHeader }
}

function mapHandlerError(error: unknown): FertilizerEnrichmentHttpResponse {
  if (error instanceof FertilizerEnrichmentServerApiError) {
    return {
      statusCode: error.httpStatus,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.apiError }),
      diagnosticError: error,
    }
  }

  return {
    statusCode: 500,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      error: {
        code: 'internal_server_error',
        message: 'Fertilizer enrichment server request failed unexpectedly.',
      },
    }),
    diagnosticError: error,
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

export function createFertilizerEnrichmentProductionHttpHandlers(
  dependencies: FertilizerEnrichmentProductionHttpHandlerDependencies,
) {
  async function withProductionRequest(
    request: FertilizerEnrichmentHttpRequest,
    run: (
      resolved: ResolvedProductionRequest,
      handlers: ReturnType<typeof createFertilizerEnrichmentHttpHandlers>,
    ) => Promise<FertilizerEnrichmentHttpResponse>,
  ): Promise<FertilizerEnrichmentHttpResponse> {
    try {
      const resolved = await resolveProductionRequest(request, dependencies)
      const handlers = createFertilizerEnrichmentHttpHandlers({
        service: dependencies.service,
        isCompositionEnabled: dependencies.isCompositionEnabled ?? (() => true),
        buildRequestContext: () => resolved.requestContext,
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
    async handleStart(request: FertilizerEnrichmentHttpRequest) {
      return withProductionRequest(request, (resolved, handlers) =>
        handlers.handleStart({
          ...request,
          body: JSON.stringify({
            ...resolved.body,
            accessContext: resolved.accessContext,
          }),
        }),
      )
    },

    async handleStatus(request: FertilizerEnrichmentHttpRequest) {
      return withProductionRequest(request, (resolved, handlers) =>
        handlers.handleStatus({
          ...request,
          body: JSON.stringify({
            ...resolved.body,
            accessContext: resolved.accessContext,
          }),
        }),
      )
    },

    async handleAdditionalSource(request: FertilizerEnrichmentHttpRequest) {
      return withProductionRequest(request, (resolved, handlers) =>
        handlers.handleAdditionalSource({
          ...request,
          body: JSON.stringify({
            ...resolved.body,
            accessContext: resolved.accessContext,
          }),
        }),
      )
    },

    async handleCancel(request: FertilizerEnrichmentHttpRequest) {
      return withProductionRequest(request, (resolved, handlers) =>
        handlers.handleCancel({
          ...request,
          body: JSON.stringify({
            ...resolved.body,
            accessContext: resolved.accessContext,
          }),
        }),
      )
    },
  }
}
