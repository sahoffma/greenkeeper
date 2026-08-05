export const PRODUCT_RECOGNIZE_CLIENT_LOG_PREFIX = '[product-recognize-client]'

export interface RecognitionClientPreFetchDiagnostics {
  fileName: string
  browserMimeType: string
  originalBytes: number
  resolvedUploadMimeType: string
  base64Length: number
  estimatedJsonPayloadBytes: number
  encodeMs: number
  fetchStartedAt: string
}

export interface RecognitionClientFetchOutcomeDiagnostics {
  elapsedMs: number
  timedOut: boolean
  httpStatus: number | null
  fetchFinishedAt: string
}

export function estimateRecognitionJsonPayloadBytes(input: {
  imageBase64: string
  mimeType: string
  fileName?: string
}): number {
  return JSON.stringify({
    imageBase64: input.imageBase64,
    mimeType: input.mimeType,
    fileName: input.fileName,
  }).length
}

export function buildRecognitionClientPreFetchDiagnostics(input: {
  fileName: string
  browserMimeType: string
  originalBytes: number
  resolvedUploadMimeType: string
  base64Length: number
  imageBase64: string
  encodeMs: number
  fetchStartedAt?: string
}): RecognitionClientPreFetchDiagnostics {
  return {
    fileName: input.fileName,
    browserMimeType: input.browserMimeType,
    originalBytes: input.originalBytes,
    resolvedUploadMimeType: input.resolvedUploadMimeType,
    base64Length: input.base64Length,
    estimatedJsonPayloadBytes: estimateRecognitionJsonPayloadBytes({
      imageBase64: input.imageBase64,
      mimeType: input.resolvedUploadMimeType,
      fileName: input.fileName,
    }),
    encodeMs: input.encodeMs,
    fetchStartedAt: input.fetchStartedAt ?? new Date().toISOString(),
  }
}

export function logRecognitionClientPreFetch(
  diagnostics: RecognitionClientPreFetchDiagnostics,
): void {
  console.info(PRODUCT_RECOGNIZE_CLIENT_LOG_PREFIX, {
    stage: 'pre_fetch',
    ...diagnostics,
  })
}

export function logRecognitionClientFetchOutcome(
  diagnostics: RecognitionClientFetchOutcomeDiagnostics,
): void {
  console.info(PRODUCT_RECOGNIZE_CLIENT_LOG_PREFIX, {
    stage: 'fetch_outcome',
    ...diagnostics,
  })
}

export function recognitionClientDiagnosticsExcludeBase64(
  payload: Record<string, unknown>,
): boolean {
  const serialized = JSON.stringify(payload)
  return !serialized.includes('imageBase64') && !serialized.match(/\/9j\/|iVBOR|AAAA/i)
}
