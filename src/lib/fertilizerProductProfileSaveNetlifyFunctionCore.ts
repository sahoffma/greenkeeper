import type { Handler, HandlerEvent } from '@netlify/functions'
import { FertilizerEnrichmentServerConfigurationError } from './fertilizerEnrichmentServerEnvironmentCore'
import {
  createFertilizerProductProfileSaveServerRuntime,
  type FertilizerProductProfileSaveServerRuntime,
} from './fertilizerProductProfileSaveCompositionCore'
import type { FertilizerProductProfileSaveHttpRequest } from './fertilizerProductProfileSaveHandlerCore'

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
        message: 'Fertilizer product profile save request failed unexpectedly.',
      },
    }),
  )
}

function toHttpRequest(event: HandlerEvent): FertilizerProductProfileSaveHttpRequest {
  return {
    httpMethod: event.httpMethod,
    body: event.body,
    headers: event.headers,
  }
}

export function createFertilizerProductProfileSaveNetlifyHandler(
  runtimeFactory: () => FertilizerProductProfileSaveServerRuntime = createFertilizerProductProfileSaveServerRuntime,
): Handler {
  let cachedRuntime: FertilizerProductProfileSaveServerRuntime | null = null
  let cachedConfigurationError: FertilizerEnrichmentServerConfigurationError | null = null

  function getRuntime(): FertilizerProductProfileSaveServerRuntime {
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

    let runtime: FertilizerProductProfileSaveServerRuntime
    try {
      runtime = getRuntime()
    } catch (error) {
      return mapConfigurationError(error)
    }

    const request = toHttpRequest(event)
    return runtime.handlers.handleSave(request)
  }
}
