import { describe, expect, it } from 'vitest'
import {
  FERTILIZER_ENRICHMENT_STORAGE_LOCATOR_PREFIX,
  buildFertilizerEnrichmentManufacturerSourceObjectPath,
  buildFertilizerEnrichmentUserSourceObjectPath,
  isExternalSourceReference,
  isFertilizerEnrichmentStorageLocator,
  parseFertilizerEnrichmentStorageLocator,
  validateFertilizerEnrichmentStorageObjectPath,
} from './fertilizerEnrichmentStorageLocatorCore'

describe('fertilizerEnrichmentStorageLocatorCore', () => {
  it('SL-1: valid internal locator accepts allowed bucket path segment and calls validation once', () => {
    const reference = `${FERTILIZER_ENRICHMENT_STORAGE_LOCATOR_PREFIX}manufacturer/sources/doc-1`
    expect(isFertilizerEnrichmentStorageLocator(reference)).toBe(true)
    expect(parseFertilizerEnrichmentStorageLocator(reference)).toEqual({
      status: 'valid',
      objectPath: 'manufacturer/sources/doc-1',
    })
  })

  it('SL-2: external URL is rejected', () => {
    expect(isExternalSourceReference('https://example.com/doc.txt')).toBe(true)
    expect(parseFertilizerEnrichmentStorageLocator('https://example.com/doc.txt')).toEqual({
      status: 'invalid',
      reason: 'external_url',
    })
  })

  it('SL-3: path traversal variants are rejected', () => {
    expect(validateFertilizerEnrichmentStorageObjectPath('../secret.txt')).toEqual({
      status: 'invalid',
      reason: 'path_traversal',
    })
    expect(validateFertilizerEnrichmentStorageObjectPath('users/a/sources/../b/doc')).toEqual({
      status: 'invalid',
      reason: 'path_traversal',
    })
    expect(validateFertilizerEnrichmentStorageObjectPath('users\\a\\sources\\doc')).toEqual({
      status: 'invalid',
      reason: 'path_traversal',
    })
    expect(
      validateFertilizerEnrichmentStorageObjectPath('users/a/sources/%2e%2e/doc'),
    ).toEqual({
      status: 'invalid',
      reason: 'path_traversal',
    })
  })

  it('SL-4: empty or absolute paths are rejected', () => {
    expect(validateFertilizerEnrichmentStorageObjectPath('')).toEqual({
      status: 'invalid',
      reason: 'empty',
    })
    expect(validateFertilizerEnrichmentStorageObjectPath('/absolute/path')).toEqual({
      status: 'invalid',
      reason: 'absolute_path',
    })
  })

  it('SL-6: error reasons contain no secrets or full sensitive paths', () => {
    const parsed = parseFertilizerEnrichmentStorageLocator('https://evil.example/doc?token=secret')
    expect(parsed.status).toBe('invalid')
    if (parsed.status === 'invalid') {
      expect(JSON.stringify(parsed)).not.toContain('secret')
      expect(JSON.stringify(parsed)).not.toContain('service-role')
    }
  })

  it('builds canonical user and manufacturer object paths from opaque reference ids', () => {
    expect(buildFertilizerEnrichmentUserSourceObjectPath('users', 'user-1', 'doc-1')).toBe(
      'users/user-1/sources/doc-1',
    )
    expect(buildFertilizerEnrichmentManufacturerSourceObjectPath('doc-1')).toBe(
      'manufacturer/sources/doc-1',
    )
  })

  it('opaque reference ids validate independently from storage locators', () => {
    expect(parseFertilizerEnrichmentStorageLocator('doc-1')).toEqual({
      status: 'valid',
      objectPath: 'doc-1',
    })
    expect(parseFertilizerEnrichmentStorageLocator('..')).toEqual({
      status: 'invalid',
      reason: 'invalid_reference_id',
    })
  })
})
