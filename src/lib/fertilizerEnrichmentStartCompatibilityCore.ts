import type {
  FertilizerEnrichmentAccessContext,
  FertilizerEnrichmentOrchestrationInput,
} from '../types/fertilizerEnrichmentOrchestration'
import {
  accessContextsMatch,
  type FertilizerEnrichmentJobRecord,
} from './fertilizerEnrichmentJobRepositoryCore'

export class FertilizerEnrichmentStartCompatibilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FertilizerEnrichmentStartCompatibilityError'
  }
}

export interface FertilizerEnrichmentImmutableStartProjection {
  objectCategory: FertilizerEnrichmentOrchestrationInput['objectCategory']
  identityFingerprint: string
  manufacturer: string | null
  officialName: string | null
  productLine: string | null
  variant: string | null
  identityConfidence: number
  hasIdentityAmbiguity: boolean
  recognitionCandidateId: string | null
  existingProductProfileId: string | null
  catalogProfileHint: string | null
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function projectImmutableStartFields(
  input: FertilizerEnrichmentOrchestrationInput,
): FertilizerEnrichmentImmutableStartProjection {
  return {
    objectCategory: input.objectCategory,
    identityFingerprint: normalizeNullableString(input.identity.identityFingerprint) ?? '',
    manufacturer: normalizeNullableString(input.identity.manufacturer),
    officialName: normalizeNullableString(input.identity.officialName),
    productLine: normalizeNullableString(input.identity.productLine),
    variant: normalizeNullableString(input.identity.variant),
    identityConfidence:
      typeof input.identity.identityConfidence === 'number' ? input.identity.identityConfidence : 0,
    hasIdentityAmbiguity: input.identity.hasIdentityAmbiguity === true,
    recognitionCandidateId: normalizeNullableString(input.references?.recognitionCandidateId),
    existingProductProfileId: normalizeNullableString(input.references?.existingProductProfileId),
    catalogProfileHint: normalizeNullableString(input.references?.catalogProfileHint),
  }
}

function projectionsEqual(
  left: FertilizerEnrichmentImmutableStartProjection,
  right: FertilizerEnrichmentImmutableStartProjection,
): boolean {
  return (
    left.objectCategory === right.objectCategory &&
    left.identityFingerprint === right.identityFingerprint &&
    left.manufacturer === right.manufacturer &&
    left.officialName === right.officialName &&
    left.productLine === right.productLine &&
    left.variant === right.variant &&
    left.identityConfidence === right.identityConfidence &&
    left.hasIdentityAmbiguity === right.hasIdentityAmbiguity &&
    left.recognitionCandidateId === right.recognitionCandidateId &&
    left.existingProductProfileId === right.existingProductProfileId &&
    left.catalogProfileHint === right.catalogProfileHint
  )
}

export function areFertilizerEnrichmentStartsCompatible(
  record: FertilizerEnrichmentJobRecord,
  input: FertilizerEnrichmentOrchestrationInput,
  accessContext: FertilizerEnrichmentAccessContext,
): boolean {
  try {
    assertCompatibleFertilizerEnrichmentStart(record, input, accessContext)
    return true
  } catch {
    return false
  }
}

export function assertCompatibleFertilizerEnrichmentStart(
  record: FertilizerEnrichmentJobRecord,
  input: FertilizerEnrichmentOrchestrationInput,
  accessContext: FertilizerEnrichmentAccessContext,
): void {
  if (!accessContextsMatch(record.job.accessContext, accessContext)) {
    throw new FertilizerEnrichmentStartCompatibilityError(
      'Start access context does not match the stored enrichment job.',
    )
  }

  if (record.job.objectCategory !== input.objectCategory) {
    throw new FertilizerEnrichmentStartCompatibilityError(
      'Start object category does not match the stored enrichment job.',
    )
  }

  const requestedFingerprint = normalizeNullableString(input.identity.identityFingerprint) ?? ''
  if (record.job.identityFingerprint !== requestedFingerprint) {
    throw new FertilizerEnrichmentStartCompatibilityError(
      'Start identity fingerprint does not match the stored enrichment job.',
    )
  }

  const storedProjection = projectImmutableStartFields(record.orchestrationInput)
  const requestedProjection = projectImmutableStartFields(input)
  if (!projectionsEqual(storedProjection, requestedProjection)) {
    throw new FertilizerEnrichmentStartCompatibilityError(
      'Start request is not compatible with the stored enrichment job.',
    )
  }
}
