import type { Handler, HandlerEvent } from '@netlify/functions'
import { FertilizerEnrichmentServerConfigurationError } from './fertilizerEnrichmentServerEnvironmentCore'
import {
  createFertilizerEnrichmentServerRuntime,
  type FertilizerEnrichmentServerRuntime,
} from './fertilizerEnrichmentServerCompositionCore'
import type { FertilizerEnrichmentHttpRequest } from './fertilizerEnrichmentServerHandlerCore'
import {
  diagnoseFertilizerEnrichmentStartResponse,
  extractSafeFertilizerEnrichmentStartInputCounts,
  logFertilizerEnrichmentStartFailure,
  buildFertilizerEnrichmentStartFailureDiagnostic,
  resolveFertilizerEnrichmentStartRequestId,
} from './fertilizerEnrichmentStartDiagnosticCore'

export type FertilizerEnrichmentNetlifyOperation =
  | 'start'
  | 'status'
  | 'additionalSource'
  | 'cancel'

function jsonResponse(statusCode: number, body: string) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  }
}

function mapConfigurationError(_error: unknown) {
  return jsonResponse(
    500,
    JSON.stringify({
      error: {
        code: 'internal_server_error',
        message: 'Fertilizer enrichment server request failed unexpectedly.',
      },
    }),
  )
}

function toHttpRequest(event: HandlerEvent): FertilizerEnrichmentHttpRequest {
  return {
    httpMethod: event.httpMethod,
    body: event.body,
    headers: event.headers,
    queryStringParameters: event.queryStringParameters ?? undefined,
  }
}

export function createFertilizerEnrichmentNetlifyHandler(
  operation: FertilizerEnrichmentNetlifyOperation,
  runtimeFactory: () => FertilizerEnrichmentServerRuntime = createFertilizerEnrichmentServerRuntime,
): Handler {
  let cachedRuntime: FertilizerEnrichmentServerRuntime | null = null
  let cachedConfigurationError: FertilizerEnrichmentServerConfigurationError | null = null

  function getRuntime(): FertilizerEnrichmentServerRuntime {
    if (cachedRuntime) {
      return cachedRuntime
    }

    if (cachedConfigurationError) {
      throw cachedConfigurationError
    }

    try {
      cachedRuntime = runtimeFactory()
      return cachedRuntime
    } catch (error) {
      if (error instanceof FertilizerEnrichmentServerConfigurationError) {
        cachedConfigurationError = error
      }

      throw error
    }
  }

  return async (event) => {
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: {
          'Content-Type': 'application/json',
        },
        body: '',
      }
    }

    const isStartOperation = operation === 'start'
    const requestId = isStartOperation ? resolveFertilizerEnrichmentStartRequestId(event) : null
    const inputCounts = isStartOperation
      ? extractSafeFertilizerEnrichmentStartInputCounts(event.body)
      : null

    let runtime: FertilizerEnrichmentServerRuntime
    try {
      runtime = getRuntime()
    } catch (error) {
      if (isStartOperation) {
        logFertilizerEnrichmentStartFailure(
          buildFertilizerEnrichmentStartFailureDiagnostic({
            requestId,
            phase: 'runtime_init',
            error,
            httpStatus: 500,
            inputCounts: inputCounts ?? undefined,
          }),
        )
      }

      return mapConfigurationError(error)
    }

    const request = toHttpRequest(event)

    try {
      switch (operation) {
        case 'start': {
          const response = await runtime.handlers.handleStart(request)
          diagnoseFertilizerEnrichmentStartResponse({
            requestId,
            httpStatus: response.statusCode,
            responseBody: response.body,
            requestBody: event.body,
            inputCounts: inputCounts ?? extractSafeFertilizerEnrichmentStartInputCounts(event.body),
            error: response.diagnosticError,
          })
          return response
        }
        case 'status':
          return runtime.handlers.handleStatus(request)
        case 'additionalSource':
          return runtime.handlers.handleAdditionalSource(request)
        case 'cancel':
          return runtime.handlers.handleCancel(request)
      }
    } catch (error) {
      if (isStartOperation) {
        logFertilizerEnrichmentStartFailure(
          buildFertilizerEnrichmentStartFailureDiagnostic({
            requestId,
            phase: 'unknown',
            error,
            httpStatus: 500,
            inputCounts: inputCounts ?? undefined,
          }),
        )
      }

      throw error
    }
  }
}
