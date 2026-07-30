import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FertilizerEnrichmentSourceStorageError } from './fertilizerEnrichmentSourceStorageCore'
import { createFertilizerEnrichmentSupabaseSourceStorage } from './fertilizerEnrichmentSupabaseSourceStorageCore'

const BUCKET = 'fertilizer-enrichment-sources'
const MAX_TEXT_BYTES = 512 * 1024

function createBlob(content: string, type = 'text/plain'): Blob {
  return new Blob([content], { type })
}

function createSupabaseStorageMock(
  downloadImpl: (path: string) => Promise<{ data: Blob | null; error: { message?: string; statusCode?: string | number } | null }>,
) {
  const download = vi.fn(downloadImpl)
  const from = vi.fn(() => ({ download }))
  const supabase = {
    storage: { from },
  } as unknown as SupabaseClient

  return { supabase, from, download }
}

describe('fertilizerEnrichmentSupabaseSourceStorageCore', () => {
  it('SD-1: successful text download returns neutral storage object', async () => {
    const text = 'Manufacturer: ICL\nProduct: Spring Start\nNPK 15-0-26'
    const { supabase, from, download } = createSupabaseStorageMock(async () => ({
      data: createBlob(text),
      error: null,
    }))

    const storage = createFertilizerEnrichmentSupabaseSourceStorage(supabase, {
      bucket: BUCKET,
      maxTextBytes: MAX_TEXT_BYTES,
    })

    const result = await storage.loadTextObject('manufacturer/sources/doc-1')

    expect(from).toHaveBeenCalledWith(BUCKET)
    expect(download).toHaveBeenCalledTimes(1)
    expect(download).toHaveBeenCalledWith('manufacturer/sources/doc-1')
    expect(result.bucket).toBe(BUCKET)
    expect(result.objectPath).toBe('manufacturer/sources/doc-1')
    expect(result.contentType).toBe('text/plain')
    expect(result.text).toBe(text)
  })

  it('SD-2: missing object maps to source_not_found', async () => {
    const { supabase } = createSupabaseStorageMock(async () => ({
      data: null,
      error: { message: 'Object not found', statusCode: '404' },
    }))

    const storage = createFertilizerEnrichmentSupabaseSourceStorage(supabase, {
      bucket: BUCKET,
      maxTextBytes: MAX_TEXT_BYTES,
    })

    await expect(storage.loadTextObject('manufacturer/sources/missing')).rejects.toMatchObject({
      code: 'source_not_found',
    })
  })

  it('SD-3: temporary storage failure maps to retryable timeout without original message', async () => {
    const { supabase } = createSupabaseStorageMock(async () => ({
      data: null,
      error: { message: 'upstream postgres timeout details', statusCode: '503' },
    }))

    const storage = createFertilizerEnrichmentSupabaseSourceStorage(supabase, {
      bucket: BUCKET,
      maxTextBytes: MAX_TEXT_BYTES,
    })

    try {
      await storage.loadTextObject('manufacturer/sources/doc-1')
      throw new Error('expected rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(FertilizerEnrichmentSourceStorageError)
      const storageError = error as FertilizerEnrichmentSourceStorageError
      expect(storageError.code).toBe('timeout')
      expect(storageError.retryable).toBe(true)
      expect(storageError.message).not.toContain('postgres')
    }
  })

  it('SD-4: oversized source is rejected before adapter execution', async () => {
    const oversized = 'x'.repeat(MAX_TEXT_BYTES + 1)
    const { supabase } = createSupabaseStorageMock(async () => ({
      data: createBlob(oversized),
      error: null,
    }))

    const storage = createFertilizerEnrichmentSupabaseSourceStorage(supabase, {
      bucket: BUCKET,
      maxTextBytes: MAX_TEXT_BYTES,
    })

    await expect(storage.loadTextObject('manufacturer/sources/large')).rejects.toMatchObject({
      code: 'invalid_document',
    })
  })

  it('SD-5: unsupported MIME type is rejected', async () => {
    const { supabase } = createSupabaseStorageMock(async () => ({
      data: createBlob('%PDF-1.4', 'application/pdf'),
      error: null,
    }))

    const storage = createFertilizerEnrichmentSupabaseSourceStorage(supabase, {
      bucket: BUCKET,
      maxTextBytes: MAX_TEXT_BYTES,
    })

    await expect(storage.loadTextObject('manufacturer/sources/doc.pdf')).rejects.toMatchObject({
      code: 'unsupported_source',
    })
  })

  it('SD-7: loader uses internal download only', async () => {
    const { supabase, from } = createSupabaseStorageMock(async () => ({
      data: createBlob('NPK 10-0-20'),
      error: null,
    }))

    const storage = createFertilizerEnrichmentSupabaseSourceStorage(supabase, {
      bucket: BUCKET,
      maxTextBytes: MAX_TEXT_BYTES,
    })

    await storage.loadTextObject('manufacturer/sources/doc-1')

    expect(from).toHaveBeenCalledWith(BUCKET)
    expect(from).not.toHaveBeenCalledWith(expect.stringContaining('http'))
  })

  it('SL-5: disallowed bucket name is never requested by client input', async () => {
    const { supabase, from } = createSupabaseStorageMock(async () => ({
      data: createBlob('NPK 10-0-20'),
      error: null,
    }))

    const storage = createFertilizerEnrichmentSupabaseSourceStorage(supabase, {
      bucket: BUCKET,
      maxTextBytes: MAX_TEXT_BYTES,
    })

    await storage.loadTextObject('manufacturer/sources/doc-1')

    expect(from).toHaveBeenCalledWith(BUCKET)
    expect(from).not.toHaveBeenCalledWith('other-bucket')
  })

  it('SL-4/SL-3: invalid object path is rejected without storage download', async () => {
    const { supabase, download } = createSupabaseStorageMock(async () => ({
      data: createBlob('unused'),
      error: null,
    }))

    const storage = createFertilizerEnrichmentSupabaseSourceStorage(supabase, {
      bucket: BUCKET,
      maxTextBytes: MAX_TEXT_BYTES,
    })

    await expect(storage.loadTextObject('../secret.txt')).rejects.toMatchObject({
      code: 'unsupported_source',
    })
    expect(download).not.toHaveBeenCalled()
  })
})
