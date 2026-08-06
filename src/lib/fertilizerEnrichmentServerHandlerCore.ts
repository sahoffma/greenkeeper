import type {
  CancelFertilizerEnrichmentRequest,
  GetFertilizerEnrichmentStatusRequest,
  ProvideFertilizerAdditionalSourceRequest,
  StartFertilizerEnrichmentRequest,
} from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerEnrichmentServerService } from './fertilizerEnrichmentServerServiceCore'
import {
  FertilizerEnrichmentServerApiError,
  type FertilizerEnrichmentServerRequestContext,
} from './fertilizerEnrichmentServerServiceCore'

export interface FertilizerEnrichmentHttpResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
  /** Internal-only error reference for server-side diagnostics — never serialized to clients. */
  diagnosticError?: unknown
}

export interface FertilizerEnrichmentHttpRequest {
  httpMethod: string
  body?: string | null
  headers?: Record<string, string | undefined>
  pathParameters?: Record<string, string | undefined>
  queryStringParameters?: Record<string, string | undefined>
}

export interface FertilizerEnrichmentHttpHandlerDependencies {
  service: FertilizerEnrichmentServerService | null
  buildRequestContext: (
    headers: Record<string, string | undefined>,
  ) => FertilizerEnrichmentServerRequestContext
  isCompositionEnabled?: () => boolean
}

function jsonResponse(statusCode: number, payload: unknown): FertilizerEnrichmentHttpResponse {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }
}

function parseJsonBody(body: string | null | undefined): unknown {
  try {
    return JSON.parse(body ?? '{}')
  } catch {
    throw new FertilizerEnrichmentServerApiError(
      { code: 'invalid_request', message: 'Request body must be valid JSON.' },
      400,
    )
  }
}

function assertMethod(request: FertilizerEnrichmentHttpRequest, method: string): void {
  if (request.httpMethod !== method) {
    throw new FertilizerEnrichmentServerApiError(
      { code: 'invalid_request', message: `Only ${method} requests are supported.` },
      405,
    )
  }
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

function ensureEnabled(deps: FertilizerEnrichmentHttpHandlerDependencies): FertilizerEnrichmentServerService {
  if (deps.isCompositionEnabled?.() === false || deps.service == null) {
    throw new FertilizerEnrichmentServerApiError(
      {
        code: 'temporarily_unavailable',
        message: 'Fertilizer enrichment server composition is not available yet.',
      },
      503,
    )
  }

  return deps.service
}

export function createFertilizerEnrichmentHttpHandlers(
  dependencies: FertilizerEnrichmentHttpHandlerDependencies,
) {
  return {
    async handleStart(request: FertilizerEnrichmentHttpRequest): Promise<FertilizerEnrichmentHttpResponse> {
      try {
        assertMethod(request, 'POST')
        const service = ensureEnabled(dependencies)
        const body = parseJsonBody(request.body) as Record<string, unknown>
        const requestContext = dependencies.buildRequestContext(request.headers ?? {})
        const job = await service.startFertilizerEnrichment(
          {
            input: body.input,
            accessContext: body.accessContext,
            idempotencyKey: String(body.idempotencyKey ?? ''),
          } as StartFertilizerEnrichmentRequest,
          requestContext,
        )

        return jsonResponse(200, { job })
      } catch (error) {
        return mapHandlerError(error)
      }
    },

    async handleStatus(request: FertilizerEnrichmentHttpRequest): Promise<FertilizerEnrichmentHttpResponse> {
      try {
        assertMethod(request, 'POST')
        const service = ensureEnabled(dependencies)
        const body = parseJsonBody(request.body) as Record<string, unknown>
        const requestContext = dependencies.buildRequestContext(request.headers ?? {})
        const job = await service.getFertilizerEnrichmentStatus(
          {
            jobId: String(body.jobId ?? request.pathParameters?.jobId ?? ''),
            accessContext: body.accessContext,
          } as GetFertilizerEnrichmentStatusRequest,
          requestContext,
        )

        return jsonResponse(200, { job })
      } catch (error) {
        return mapHandlerError(error)
      }
    },

    async handleAdditionalSource(
      request: FertilizerEnrichmentHttpRequest,
    ): Promise<FertilizerEnrichmentHttpResponse> {
      try {
        assertMethod(request, 'POST')
        const service = ensureEnabled(dependencies)
        const body = parseJsonBody(request.body) as Record<string, unknown>
        const requestContext = dependencies.buildRequestContext(request.headers ?? {})
        const job = await service.provideAdditionalFertilizerEnrichmentSource(
          {
            jobId: String(body.jobId ?? ''),
            accessContext: body.accessContext,
            idempotencyKey: String(body.idempotencyKey ?? ''),
            additionalSources: Array.isArray(body.additionalSources) ? body.additionalSources : [],
            priorOrchestrationRunId:
              typeof body.priorOrchestrationRunId === 'string' ? body.priorOrchestrationRunId : null,
          } as ProvideFertilizerAdditionalSourceRequest,
          requestContext,
        )

        return jsonResponse(200, { job })
      } catch (error) {
        return mapHandlerError(error)
      }
    },

    async handleCancel(request: FertilizerEnrichmentHttpRequest): Promise<FertilizerEnrichmentHttpResponse> {
      try {
        assertMethod(request, 'POST')
        const service = ensureEnabled(dependencies)
        const body = parseJsonBody(request.body) as Record<string, unknown>
        const requestContext = dependencies.buildRequestContext(request.headers ?? {})
        const job = await service.cancelFertilizerEnrichment(
          {
            jobId: String(body.jobId ?? request.pathParameters?.jobId ?? ''),
            accessContext: body.accessContext,
          } as CancelFertilizerEnrichmentRequest,
          requestContext,
        )

        return jsonResponse(200, { job })
      } catch (error) {
        return mapHandlerError(error)
      }
    },
  }
}
