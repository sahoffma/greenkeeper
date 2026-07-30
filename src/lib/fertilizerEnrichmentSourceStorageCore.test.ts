import { describe, expect, it } from 'vitest'
import {
  FertilizerEnrichmentSourceStorageError,
  assertFertilizerEnrichmentSourceTextWithinLimit,
  decodeFertilizerEnrichmentSourceText,
  isAllowedFertilizerEnrichmentTextContentType,
} from './fertilizerEnrichmentSourceStorageCore'

describe('fertilizerEnrichmentSourceStorageCore', () => {
  it('decodes valid UTF-8 text', () => {
    const bytes = new TextEncoder().encode('NPK 15-0-26\nDeclaration basis (N / P2O5 / K2O)')
    expect(decodeFertilizerEnrichmentSourceText(bytes)).toContain('NPK 15-0-26')
  })

  it('SD-6: rejects invalid UTF-8 sequences', () => {
    const invalid = new Uint8Array([0xff, 0xfe, 0xfd])
    expect(() => decodeFertilizerEnrichmentSourceText(invalid)).toThrow(
      FertilizerEnrichmentSourceStorageError,
    )
  })

  it('SD-6: rejects null bytes in decoded text', () => {
    const bytes = new TextEncoder().encode('before\u0000after')
    expect(() => decodeFertilizerEnrichmentSourceText(bytes)).toThrow(
      FertilizerEnrichmentSourceStorageError,
    )
  })

  it('SD-5: allows only configured text MIME types', () => {
    expect(isAllowedFertilizerEnrichmentTextContentType('text/plain')).toBe(true)
    expect(isAllowedFertilizerEnrichmentTextContentType('text/plain; charset=utf-8')).toBe(true)
    expect(isAllowedFertilizerEnrichmentTextContentType('application/pdf')).toBe(false)
    expect(isAllowedFertilizerEnrichmentTextContentType('image/jpeg')).toBe(false)
  })

  it('SD-4: rejects text exceeding configured byte limit', () => {
    const text = 'a'.repeat(20)
    expect(() => assertFertilizerEnrichmentSourceTextWithinLimit(text, 10)).toThrow(
      FertilizerEnrichmentSourceStorageError,
    )
  })
})
