import type { SupabaseClient } from '@supabase/supabase-js'
import {
  assertFertilizerEnrichmentSourceTextWithinLimit,
  decodeFertilizerEnrichmentSourceText,
  FertilizerEnrichmentSourceStorageError,
  isAllowedFertilizerEnrichmentTextContentType,
  normalizeFertilizerEnrichmentSourceContentType,
  type FertilizerEnrichmentSourceStorage,
  type FertilizerEnrichmentSourceStorageConfig,
  type FertilizerEnrichmentSourceStorageObject,
} from './fertilizerEnrichmentSourceStorageCore'
import { validateFertilizerEnrichmentStorageObjectPath } from './fertilizerEnrichmentStorageLocatorCore'

interface SupabaseStorageDownloadResponse {
  data: Blob | null
  error: { message?: string; statusCode?: string | number } | null
}

function mapSupabaseStorageError(error: { message?: string; statusCode?: string | number }): never {
  const status = String(error.statusCode ?? '')
  const message = error.message?.toLowerCase() ?? ''

  if (status === '404' || message.includes('not found') || message.includes('object not found')) {
    throw new FertilizerEnrichmentSourceStorageError(
      'source_not_found',
      'Stored enrichment source was not found.',
      false,
    )
  }

  if (
    status === '408' ||
    status === '429' ||
    status === '503' ||
    message.includes('timeout') ||
    message.includes('temporarily')
  ) {
    throw new FertilizerEnrichmentSourceStorageError(
      'timeout',
      'Stored enrichment source is temporarily unavailable.',
      true,
    )
  }

  throw new FertilizerEnrichmentSourceStorageError(
    'unknown_adapter_error',
    'Stored enrichment source could not be loaded.',
    false,
  )
}

async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const buffer = await blob.arrayBuffer()
  return new Uint8Array(buffer)
}

export function createFertilizerEnrichmentSupabaseSourceStorage(
  supabase: SupabaseClient,
  config: FertilizerEnrichmentSourceStorageConfig,
): FertilizerEnrichmentSourceStorage {
  const bucket = config.bucket.trim()
  if (!bucket) {
    throw new FertilizerEnrichmentSourceStorageError(
      'unknown_adapter_error',
      'Enrichment source storage bucket is not configured.',
      false,
    )
  }

  return {
    async loadTextObject(objectPath: string): Promise<FertilizerEnrichmentSourceStorageObject> {
      const validatedPath = validateFertilizerEnrichmentStorageObjectPath(objectPath)
      if (validatedPath.status === 'invalid') {
        throw new FertilizerEnrichmentSourceStorageError(
          'unsupported_source',
          'Stored enrichment source reference is invalid.',
          false,
        )
      }

      const storage = supabase.storage.from(bucket)
      const download = (await storage.download(validatedPath.objectPath)) as SupabaseStorageDownloadResponse

      if (download.error) {
        mapSupabaseStorageError(download.error)
      }

      if (!download.data) {
        throw new FertilizerEnrichmentSourceStorageError(
          'source_not_found',
          'Stored enrichment source was not found.',
          false,
        )
      }

      const bytes = await blobToUint8Array(download.data)
      if (bytes.byteLength > config.maxTextBytes) {
        throw new FertilizerEnrichmentSourceStorageError(
          'invalid_document',
          'Stored enrichment source exceeds the configured size limit.',
          false,
        )
      }

      const contentType = normalizeFertilizerEnrichmentSourceContentType(download.data.type || 'text/plain')
      if (!isAllowedFertilizerEnrichmentTextContentType(contentType)) {
        throw new FertilizerEnrichmentSourceStorageError(
          'unsupported_source',
          'Stored enrichment source content type is not supported.',
          false,
        )
      }

      const text = decodeFertilizerEnrichmentSourceText(bytes)
      assertFertilizerEnrichmentSourceTextWithinLimit(text, config.maxTextBytes)

      return {
        bucket,
        objectPath: validatedPath.objectPath,
        contentType,
        size: bytes.byteLength,
        text,
        bytes,
        etag: null,
      }
    },
  }
}
