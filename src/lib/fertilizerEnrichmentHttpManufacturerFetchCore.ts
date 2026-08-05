import type {
  FertilizerManufacturerDocumentFetchFailure,
  FertilizerManufacturerDocumentFetchResult,
} from './fertilizerManufacturerProductDocumentAdapterCore'
import { isExternalSourceReference } from './fertilizerEnrichmentStorageLocatorCore'
import { validateFertilizerManufacturerDocumentSource } from './fertilizerManufacturerDocumentSourceValidatorCore'

const DEFAULT_TIMEOUT_MS = 15_000
const MAX_RESPONSE_BYTES = 2_000_000

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function mapFetchFailure(
  errorCode: FertilizerManufacturerDocumentFetchFailure['errorCode'],
  retryable: boolean,
): FertilizerManufacturerDocumentFetchFailure {
  return { ok: false, errorCode, retryable }
}

export async function fetchExternalManufacturerDocument(
  sourceUrl: string,
  options: { timeoutMs?: number; now?: () => string } = {},
): Promise<FertilizerManufacturerDocumentFetchResult> {
  const trimmed = sourceUrl.trim()
  if (!trimmed || !isExternalSourceReference(trimmed)) {
    return mapFetchFailure('unsupported_source', false)
  }

  const initialValidation = validateFertilizerManufacturerDocumentSource(trimmed)
  if (initialValidation.status === 'invalid') {
    return mapFetchFailure('unsupported_source', false)
  }

  const requestUrl = initialValidation.normalizedUrl
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        Accept: 'text/html,application/pdf,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'GreenkeeperFertilizerEnrichment/1.0',
      },
    })

    if (response.status === 404) {
      return mapFetchFailure('source_not_found', false)
    }

    if (response.status === 401 || response.status === 403) {
      return mapFetchFailure('access_denied', false)
    }

    if (response.status === 429) {
      return mapFetchFailure('rate_limited', true)
    }

    if (!response.ok) {
      return mapFetchFailure('network_error', response.status >= 500)
    }

    const finalUrl = response.url?.trim() || requestUrl
    const finalValidation = validateFertilizerManufacturerDocumentSource(finalUrl)
    if (finalValidation.status === 'invalid') {
      return mapFetchFailure('unsupported_source', false)
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? 'text/plain'
    const buffer = await response.arrayBuffer()

    if (buffer.byteLength === 0) {
      return mapFetchFailure('invalid_document', false)
    }

    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      return mapFetchFailure('invalid_document', false)
    }

    let text: string | null = null

    if (contentType === 'application/pdf') {
      return mapFetchFailure('unsupported_source', false)
    }

    const rawText = new TextDecoder('utf-8', { fatal: false }).decode(buffer)
    text =
      contentType === 'text/html' || rawText.includes('<html') || rawText.includes('<body')
        ? stripHtmlToText(rawText)
        : rawText.trim()

    if (!text) {
      return mapFetchFailure('invalid_document', false)
    }

    return {
      ok: true,
      finalUrl: finalValidation.normalizedUrl,
      contentType: 'text/plain',
      text,
      retrievedAt: options.now?.() ?? new Date().toISOString(),
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
      statusCode: response.status,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return mapFetchFailure('timeout', true)
    }

    return mapFetchFailure('network_error', true)
  } finally {
    clearTimeout(timeout)
  }
}
