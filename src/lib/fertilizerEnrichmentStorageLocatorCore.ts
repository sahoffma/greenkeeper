export const FERTILIZER_ENRICHMENT_STORAGE_LOCATOR_PREFIX = 'gk-storage:v1/'

export const FERTILIZER_ENRICHMENT_STORAGE_REFERENCE_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/

export const FERTILIZER_ENRICHMENT_STORAGE_OBJECT_PATH_MAX_LENGTH = 512

export type FertilizerEnrichmentStorageLocatorInvalidReason =
  | 'empty'
  | 'external_url'
  | 'absolute_path'
  | 'path_traversal'
  | 'invalid_characters'
  | 'too_long'
  | 'invalid_reference_id'

export type FertilizerEnrichmentStorageLocatorParseResult =
  | { status: 'valid'; objectPath: string }
  | { status: 'invalid'; reason: FertilizerEnrichmentStorageLocatorInvalidReason }

const EXTERNAL_URL_PATTERN = /^[a-zA-Z][a-zA-Z\d+\-.]*:/

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function containsTraversalSegment(objectPath: string): boolean {
  const decoded = decodePathSegment(objectPath)

  if (decoded.includes('\\') || decoded.includes('\0')) {
    return true
  }

  for (const segment of decoded.split('/')) {
    const trimmed = segment.trim()
    if (!trimmed || trimmed === '.' || trimmed === '..') {
      return true
    }
  }

  return false
}

export function isExternalSourceReference(reference: string): boolean {
  const trimmed = reference.trim()
  if (!trimmed) {
    return false
  }

  if (trimmed.startsWith(FERTILIZER_ENRICHMENT_STORAGE_LOCATOR_PREFIX)) {
    return false
  }

  return EXTERNAL_URL_PATTERN.test(trimmed)
}

export function isFertilizerEnrichmentStorageLocator(reference: string): boolean {
  return reference.trim().startsWith(FERTILIZER_ENRICHMENT_STORAGE_LOCATOR_PREFIX)
}

export function parseFertilizerEnrichmentStorageLocator(
  reference: string,
): FertilizerEnrichmentStorageLocatorParseResult {
  const trimmed = reference.trim()
  if (!trimmed) {
    return { status: 'invalid', reason: 'empty' }
  }

  if (trimmed.startsWith(FERTILIZER_ENRICHMENT_STORAGE_LOCATOR_PREFIX)) {
    const objectPath = trimmed.slice(FERTILIZER_ENRICHMENT_STORAGE_LOCATOR_PREFIX.length).trim()
    return validateFertilizerEnrichmentStorageObjectPath(objectPath)
  }

  if (isExternalSourceReference(trimmed)) {
    return { status: 'invalid', reason: 'external_url' }
  }

  if (!FERTILIZER_ENRICHMENT_STORAGE_REFERENCE_ID_PATTERN.test(trimmed)) {
    return { status: 'invalid', reason: 'invalid_reference_id' }
  }

  return { status: 'valid', objectPath: trimmed }
}

export function validateFertilizerEnrichmentStorageObjectPath(
  objectPath: string,
): FertilizerEnrichmentStorageLocatorParseResult {
  const trimmed = objectPath.trim()
  if (!trimmed) {
    return { status: 'invalid', reason: 'empty' }
  }

  if (trimmed.startsWith('/') || trimmed.includes('://') || trimmed.includes('?') || trimmed.includes('#')) {
    return { status: 'invalid', reason: 'absolute_path' }
  }

  if (trimmed.length > FERTILIZER_ENRICHMENT_STORAGE_OBJECT_PATH_MAX_LENGTH) {
    return { status: 'invalid', reason: 'too_long' }
  }

  if (containsTraversalSegment(trimmed)) {
    return { status: 'invalid', reason: 'path_traversal' }
  }

  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return { status: 'invalid', reason: 'invalid_characters' }
  }

  return { status: 'valid', objectPath: trimmed }
}

export function buildFertilizerEnrichmentUserSourceObjectPath(
  ownerPrefix: 'users' | 'sessions',
  ownerKey: string,
  referenceId: string,
): string {
  const parsedReference = parseFertilizerEnrichmentStorageLocator(referenceId)
  if (parsedReference.status !== 'valid' || parsedReference.objectPath !== referenceId.trim()) {
    throw new Error('Reference identifier format is invalid.')
  }

  const sanitizedOwnerKey = ownerKey.trim()
  if (!sanitizedOwnerKey || /[/\\]/.test(sanitizedOwnerKey)) {
    throw new Error('Owner key format is invalid.')
  }

  return `${ownerPrefix}/${sanitizedOwnerKey}/sources/${referenceId.trim()}`
}

export function buildFertilizerEnrichmentManufacturerSourceObjectPath(referenceId: string): string {
  const parsedReference = parseFertilizerEnrichmentStorageLocator(referenceId)
  if (parsedReference.status !== 'valid' || parsedReference.objectPath !== referenceId.trim()) {
    throw new Error('Reference identifier format is invalid.')
  }

  return `manufacturer/sources/${referenceId.trim()}`
}

export function assertUserScopedStorageObjectPath(
  objectPath: string,
  ownerPrefix: 'users' | 'sessions',
  ownerKey: string,
): boolean {
  const expectedPrefix = `${ownerPrefix}/${ownerKey.trim()}/sources/`
  return objectPath.startsWith(expectedPrefix)
}

export function assertManufacturerScopedStorageObjectPath(objectPath: string): boolean {
  return objectPath.startsWith('manufacturer/sources/')
}
