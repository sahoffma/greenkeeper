import type { ProductRecognizeResult } from '../types/productRecognize'
import {
  logRecognitionClientFetchOutcome,
  type RecognitionClientPreFetchDiagnostics,
} from './productRecognizeClientDiagnosticsCore'

const PRODUCT_RECOGNIZE_URL = '/.netlify/functions/product-recognize'
export const PRODUCT_RECOGNIZE_CLIENT_DEFAULT_TIMEOUT_MS = 90_000

export type ProductRecognizeClientErrorKind =
  | 'network'
  | 'unreachable'
  | 'timeout'
  | 'invalid_response'
  | 'not_configured'
  | 'invalid_image'
  | 'server'

export class ProductRecognizeClientError extends Error {
  statusCode: number
  kind: ProductRecognizeClientErrorKind

  constructor(
    message: string,
    options: { statusCode?: number; kind: ProductRecognizeClientErrorKind },
  ) {
    super(message)
    this.name = 'ProductRecognizeClientError'
    this.statusCode = options.statusCode ?? 500
    this.kind = options.kind
  }
}

interface ParsedRecognitionResponse {
  payload: (ProductRecognizeResult & { error?: string }) | null
  parseError: boolean
}

async function readRecognitionResponse(response: Response): Promise<ParsedRecognitionResponse> {
  const text = await response.text()

  if (!text.trim()) {
    return { payload: null, parseError: true }
  }

  try {
    return {
      payload: JSON.parse(text) as ProductRecognizeResult & { error?: string },
      parseError: false,
    }
  } catch {
    return { payload: null, parseError: true }
  }
}

function classifyHttpFailure(statusCode: number, message: string): ProductRecognizeClientError {
  if (statusCode === 503) {
    return new ProductRecognizeClientError(message || 'Der Erkennungsdienst ist nicht konfiguriert.', {
      statusCode,
      kind: 'not_configured',
    })
  }

  if (statusCode === 400) {
    return new ProductRecognizeClientError(message || 'Das Foto ist ungültig.', {
      statusCode,
      kind: 'invalid_image',
    })
  }

  if (statusCode === 404 || statusCode === 502 || statusCode === 504) {
    return new ProductRecognizeClientError(
      'Der Erkennungsdienst ist nicht erreichbar.',
      {
        statusCode,
        kind: 'unreachable',
      },
    )
  }

  return new ProductRecognizeClientError(message || 'Produkterkennung fehlgeschlagen.', {
    statusCode,
    kind: 'server',
  })
}

function classifyFetchFailure(error: unknown, timedOut: boolean): ProductRecognizeClientError {
  if (timedOut) {
    return new ProductRecognizeClientError(
      'Die Produkterkennung hat zu lange gedauert. Bitte versuche es erneut.',
      {
        statusCode: 408,
        kind: 'timeout',
      },
    )
  }

  if (error instanceof ProductRecognizeClientError) {
    return error
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return new ProductRecognizeClientError(
      'Die Produkterkennung wurde abgebrochen.',
      {
        statusCode: 499,
        kind: 'timeout',
      },
    )
  }

  return new ProductRecognizeClientError(
    'Der Erkennungsdienst ist nicht erreichbar.',
    {
      statusCode: 0,
      kind: 'network',
    },
  )
}

export async function recognizeProductFromImage(input: {
  imageBase64: string
  mimeType: string
  fileName?: string
  signal?: AbortSignal
  timeoutMs?: number
  preFetchDiagnostics?: RecognitionClientPreFetchDiagnostics
}): Promise<ProductRecognizeResult> {
  const timeoutMs = input.timeoutMs ?? PRODUCT_RECOGNIZE_CLIENT_DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  let timedOut = false
  const fetchStartedAtMs = Date.now()

  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  if (input.signal) {
    if (input.signal.aborted) {
      clearTimeout(timeoutId)
      throw classifyFetchFailure(new DOMException('Aborted', 'AbortError'), false)
    }

    input.signal.addEventListener(
      'abort',
      () => {
        controller.abort()
      },
      { once: true },
    )
  }

  let httpStatus: number | null = null

  try {
    const response = await fetch(PRODUCT_RECOGNIZE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        fileName: input.fileName,
      }),
      signal: controller.signal,
    })

    httpStatus = response.status

    const { payload, parseError } = await readRecognitionResponse(response)

    if (parseError) {
      throw new ProductRecognizeClientError(
        response.status === 404
          ? 'Der Erkennungsdienst ist nicht erreichbar.'
          : 'Die Antwort des Erkennungsdienstes war ungültig.',
        {
          statusCode: response.status,
          kind: response.status === 404 ? 'unreachable' : 'invalid_response',
        },
      )
    }

    if (!response.ok) {
      throw classifyHttpFailure(response.status, payload?.error ?? '')
    }

    if (!payload || typeof payload.status !== 'string') {
      throw new ProductRecognizeClientError('Die Antwort des Erkennungsdienstes war ungültig.', {
        statusCode: response.status,
        kind: 'invalid_response',
      })
    }

    logRecognitionClientFetchOutcome({
      elapsedMs: Date.now() - fetchStartedAtMs,
      timedOut: false,
      httpStatus,
      fetchFinishedAt: new Date().toISOString(),
    })

    return payload
  } catch (error) {
    logRecognitionClientFetchOutcome({
      elapsedMs: Date.now() - fetchStartedAtMs,
      timedOut,
      httpStatus,
      fetchFinishedAt: new Date().toISOString(),
    })

    throw classifyFetchFailure(error, timedOut)
  } finally {
    clearTimeout(timeoutId)
  }
}

export function logProductRecognizeClientError(error: ProductRecognizeClientError): void {
  console.error('[product-recognize-client]', {
    kind: error.kind,
    statusCode: error.statusCode,
    message: error.message,
  })
}
