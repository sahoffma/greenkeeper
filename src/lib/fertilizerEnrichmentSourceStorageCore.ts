export const FERTILIZER_ENRICHMENT_SOURCE_STORAGE_TEXT_MIME_TYPES = ['text/plain'] as const

export const FERTILIZER_ENRICHMENT_SOURCE_STORAGE_PDF_MIME_TYPES = ['application/pdf'] as const

export type FertilizerEnrichmentSourceStorageErrorCode =
  | 'source_not_found'
  | 'unsupported_source'
  | 'invalid_document'
  | 'timeout'
  | 'unknown_adapter_error'

export interface FertilizerEnrichmentSourceStorageConfig {
  bucket: string
  maxTextBytes: number
}

export interface FertilizerEnrichmentSourceStorageObject {
  bucket: string
  objectPath: string
  contentType: string
  size: number
  text?: string
  bytes?: Uint8Array
  etag?: string | null
}

export class FertilizerEnrichmentSourceStorageError extends Error {
  readonly code: FertilizerEnrichmentSourceStorageErrorCode

  readonly retryable: boolean

  constructor(code: FertilizerEnrichmentSourceStorageErrorCode, message: string, retryable: boolean) {
    super(message)
    this.name = 'FertilizerEnrichmentSourceStorageError'
    this.code = code
    this.retryable = retryable
  }
}

export interface FertilizerEnrichmentSourceStorage {
  loadTextObject(objectPath: string): Promise<FertilizerEnrichmentSourceStorageObject>
}

export function normalizeFertilizerEnrichmentSourceContentType(contentType: string): string {
  return contentType.trim().toLowerCase().split(';')[0]?.trim() ?? ''
}

export function isAllowedFertilizerEnrichmentTextContentType(contentType: string): boolean {
  return FERTILIZER_ENRICHMENT_SOURCE_STORAGE_TEXT_MIME_TYPES.includes(
    normalizeFertilizerEnrichmentSourceContentType(contentType) as (typeof FERTILIZER_ENRICHMENT_SOURCE_STORAGE_TEXT_MIME_TYPES)[number],
  )
}

export function decodeFertilizerEnrichmentSourceText(bytes: Uint8Array): string {
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new FertilizerEnrichmentSourceStorageError(
      'invalid_document',
      'Stored source text uses an invalid UTF-8 encoding.',
      false,
    )
  }

  if (decoded.includes('\0')) {
    throw new FertilizerEnrichmentSourceStorageError(
      'invalid_document',
      'Stored source text contains invalid control characters.',
      false,
    )
  }

  return decoded
}

export function assertFertilizerEnrichmentSourceTextWithinLimit(
  text: string,
  maxTextBytes: number,
): void {
  const byteLength = new TextEncoder().encode(text).byteLength
  if (byteLength > maxTextBytes) {
    throw new FertilizerEnrichmentSourceStorageError(
      'invalid_document',
      'Stored source text exceeds the configured size limit.',
      false,
    )
  }
}
