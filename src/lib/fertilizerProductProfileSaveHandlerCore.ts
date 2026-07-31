import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import type { SaveFertilizerProductProfileResponse } from '../types/fertilizerProductProfileSave'
import {
  FertilizerProductProfileSaveServerApiError,
  validateSaveFertilizerProductProfileRequest,
  type FertilizerProductProfileSaveServerService,
} from './fertilizerProductProfileSaveServerServiceCore'

export interface FertilizerProductProfileSaveHttpResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
}

export interface FertilizerProductProfileSaveHttpRequest {
  httpMethod: string
  body?: string | null
  headers?: Record<string, string | undefined>
}

export interface FertilizerProductProfileSaveHttpHandlerDependencies {
  service: FertilizerProductProfileSaveServerService | null
  buildAccessContext: (
    headers: Record<string, string | undefined>,
  ) => Promise<FertilizerEnrichmentAccessContext>
  isCompositionEnabled?: () => boolean
}

function jsonResponse(statusCode: number, payload: unknown): FertilizerProductProfileSaveHttpResponse {
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
    throw new FertilizerProductProfileSaveServerApiError(
      { code: 'invalid_request', message: 'Request body must be valid JSON.' },
      400,
    )
  }
}

function assertMethod(request: FertilizerProductProfileSaveHttpRequest, method: string): void {
  if (request.httpMethod !== method) {
    throw new FertilizerProductProfileSaveServerApiError(
      { code: 'invalid_request', message: `Only ${method} requests are supported.` },
      405,
    )
  }
}

function mapHandlerError(error: unknown): FertilizerProductProfileSaveHttpResponse {
  if (error instanceof FertilizerProductProfileSaveServerApiError) {
    return jsonResponse(error.httpStatus, { error: error.apiError })
  }

  return jsonResponse(500, {
    error: {
      code: 'internal_server_error',
      message: 'Fertilizer product profile save request failed unexpectedly.',
    },
  })
}

function ensureEnabled(
  deps: FertilizerProductProfileSaveHttpHandlerDependencies,
): FertilizerProductProfileSaveServerService {
  if (deps.isCompositionEnabled?.() === false || deps.service == null) {
    throw new FertilizerProductProfileSaveServerApiError(
      {
        code: 'temporarily_unavailable',
        message: 'Fertilizer product profile save composition is not available yet.',
      },
      503,
    )
  }

  return deps.service
}

export function createFertilizerProductProfileSaveHttpHandlers(
  dependencies: FertilizerProductProfileSaveHttpHandlerDependencies,
) {
  return {
    async handleSave(
      request: FertilizerProductProfileSaveHttpRequest,
    ): Promise<FertilizerProductProfileSaveHttpResponse> {
      try {
        assertMethod(request, 'POST')
        const service = ensureEnabled(dependencies)
        const body = parseJsonBody(request.body)
        const saveRequest = validateSaveFertilizerProductProfileRequest(body)
        const accessContext = await dependencies.buildAccessContext(request.headers ?? {})
        const result: SaveFertilizerProductProfileResponse =
          await service.saveFertilizerProductProfile(saveRequest, accessContext)

        return jsonResponse(200, result)
      } catch (error) {
        return mapHandlerError(error)
      }
    },
  }
}
