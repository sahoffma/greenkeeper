import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import { resolveNpkTriplet } from './fertilizerRecognitionEnrichmentBasisCore'
import {
  buildManufacturerBrandToken,
  buildProductNameSearchVariants,
  normalizeResearchToken,
} from './fertilizerManufacturerResearchQueryCore'
import type {
  ManufacturerStructuredResearchRecord,
  ManufacturerStructuredResearchSourceRecord,
} from './fertilizerManufacturerStructuredResearchCore'
import { evaluateStructuredResearchSourceIdentityEvidence } from './fertilizerManufacturerStructuredResearchSourceIdentityCore'
import type { ManufacturerSearchCandidateSelection } from './fertilizerManufacturerSearchCandidateCore'
import { candidateToPrimarySourceRecord } from './fertilizerManufacturerSearchCandidateCore'

export type StructuredResearchIdentityRejectionReason =
  | 'none'
  | 'manufacturer_mismatch'
  | 'product_name_mismatch'
  | 'product_line_mismatch'
  | 'npk_mismatch'
  | 'model_identity_mismatch'
  | 'source_identity_mismatch'
  | 'source_product_line_unverified'
  | 'source_npk_unverified'
  | 'identity_echo_suspected'

export interface StructuredResearchIdentityValidation {
  modelClaimedIdentityMatch: boolean
  identityMatchAccepted: boolean
  rejectionReason: StructuredResearchIdentityRejectionReason
  expectedProductLinePresent: boolean
  recordProductLinePresent: boolean
  expectedNpkPresent: boolean
  recordNpkCompatible: boolean
  structuredProductLinePresent: boolean
  structuredProductLineMatch: boolean
  structuredNpkMatch: boolean
  canonicalDeclarationSourcePresent: boolean
  canonicalDeclarationSourceIdentityVerified: boolean
  canonicalDeclarationSourceProductLineVerified: boolean
  canonicalDeclarationSourceNpkVerified: boolean
  declarationSourceIdentityMismatch: boolean
  structuredIdentityEchoSuspected: boolean
  sourceBoundIdentityAccepted: boolean
}

function normalizeComparable(value: string | null | undefined): string {
  return normalizeResearchToken(value).replace(/\s+/g, ' ')
}

function productNamesCompatible(expectedName: string, actualName: string): boolean {
  const expected = normalizeComparable(expectedName)
  const actual = normalizeComparable(actualName)

  if (!expected || !actual) {
    return false
  }

  if (actual === expected || actual.includes(expected) || expected.includes(actual)) {
    return true
  }

  return buildProductNameSearchVariants(expectedName).some((variant) => {
    const normalizedVariant = normalizeComparable(variant)
    return normalizedVariant.length > 0 && actual.includes(normalizedVariant)
  })
}

function manufacturersCompatible(
  expectedManufacturer: string,
  actualManufacturer: string,
): boolean {
  const expected = normalizeComparable(expectedManufacturer)
  const actual = normalizeComparable(actualManufacturer)

  if (!expected || !actual) {
    return false
  }

  if (actual.includes(expected) || expected.includes(actual)) {
    return true
  }

  const expectedBrand = buildManufacturerBrandToken(expectedManufacturer)
  const actualBrand = buildManufacturerBrandToken(actualManufacturer)

  return expectedBrand != null && actualBrand != null && expectedBrand === actualBrand
}

export function productLinesCompatible(
  expectedProductLine: string | null | undefined,
  actualProductLine: string | null | undefined,
): boolean {
  const expected = normalizeComparable(expectedProductLine)
  if (!expected) {
    return true
  }

  const actual = normalizeComparable(actualProductLine)
  if (!actual) {
    return false
  }

  return actual === expected || actual.includes(expected) || expected.includes(actual)
}

export function npkTripletsCompatible(
  expected: { nitrogen: number; phosphate: number; potash: number } | null,
  actual: { nitrogen: number; phosphate: number; potash: number } | null,
): boolean {
  if (!expected) {
    return true
  }

  if (!actual) {
    return false
  }

  return (
    expected.nitrogen === actual.nitrogen &&
    expected.phosphate === actual.phosphate &&
    expected.potash === actual.potash
  )
}

export function resolveExpectedStructuredResearchNpk(input: {
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
}): { nitrogen: number; phosphate: number; potash: number } | null {
  return resolveNpkTriplet({
    rawLabel: input.npkLabel ?? input.identity.variant,
    nitrogen: null,
    phosphate: null,
    potash: null,
  })
}

export function validateStructuredResearchIdentityMatch(input: {
  record: ManufacturerStructuredResearchRecord
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  primarySource?: ManufacturerStructuredResearchSourceRecord | null
  selection?: ManufacturerSearchCandidateSelection | null
}): StructuredResearchIdentityValidation {
  const modelClaimedIdentityMatch = input.record.identityMatch
  const expectedNpk = resolveExpectedStructuredResearchNpk(input)
  const expectedProductLinePresent = Boolean(normalizeComparable(input.identity.productLine))
  const recordProductLinePresent = Boolean(normalizeComparable(input.record.productLine))
  const structuredProductLineMatch = productLinesCompatible(
    input.identity.productLine,
    input.record.productLine,
  )
  const structuredNpkMatch = npkTripletsCompatible(expectedNpk, input.record.npk)

  const canonicalCandidate = input.selection?.canonicalCandidate ?? null
  const primarySource =
    input.primarySource ??
    (canonicalCandidate ? candidateToPrimarySourceRecord({ candidate: canonicalCandidate }) : null)

  const sourceEvidence = evaluateStructuredResearchSourceIdentityEvidence({
    identity: input.identity,
    npkLabel: input.npkLabel,
    primarySource,
    trustedEvidenceText: canonicalCandidate?.trustedEvidenceText ?? null,
    recordProductLineMatchesExpected: structuredProductLineMatch,
    recordNpkCompatible: structuredNpkMatch,
  })

  const base = {
    modelClaimedIdentityMatch,
    expectedProductLinePresent,
    recordProductLinePresent,
    expectedNpkPresent: expectedNpk != null,
    recordNpkCompatible: structuredNpkMatch,
    structuredProductLinePresent: recordProductLinePresent,
    structuredProductLineMatch,
    structuredNpkMatch,
    ...sourceEvidence,
  }

  const reject = (
    rejectionReason: StructuredResearchIdentityRejectionReason,
  ): StructuredResearchIdentityValidation => ({
    ...base,
    identityMatchAccepted: false,
    rejectionReason,
  })

  if (!modelClaimedIdentityMatch && !sourceEvidence.sourceBoundIdentityAccepted) {
    return reject('model_identity_mismatch')
  }

  if (!manufacturersCompatible(input.identity.manufacturer ?? '', input.record.manufacturer)) {
    return reject('manufacturer_mismatch')
  }

  if (!productNamesCompatible(input.identity.officialName ?? '', input.record.productName)) {
    return reject('product_name_mismatch')
  }

  if (!structuredProductLineMatch) {
    return reject('product_line_mismatch')
  }

  if (!structuredNpkMatch) {
    return reject('npk_mismatch')
  }

  if (!primarySource) {
    return reject('source_identity_mismatch')
  }

  if (input.selection?.candidateAmbiguity && !input.identity.hasIdentityAmbiguity) {
    return reject('source_identity_mismatch')
  }

  if (!canonicalCandidate) {
    return reject(sourceEvidence.declarationSourceIdentityMismatch ? 'source_identity_mismatch' : 'source_product_line_unverified')
  }

  if (sourceEvidence.declarationSourceIdentityMismatch) {
    return reject('source_identity_mismatch')
  }

  if (sourceEvidence.structuredIdentityEchoSuspected) {
    return reject('identity_echo_suspected')
  }

  if (expectedProductLinePresent && !sourceEvidence.canonicalDeclarationSourceProductLineVerified) {
    return reject('source_product_line_unverified')
  }

  if (expectedNpk != null && !sourceEvidence.canonicalDeclarationSourceNpkVerified) {
    return reject('source_npk_unverified')
  }

  return {
    ...base,
    identityMatchAccepted: true,
    rejectionReason: 'none',
  }
}
