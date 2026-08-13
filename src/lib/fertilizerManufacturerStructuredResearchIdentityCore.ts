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

export type StructuredResearchIdentityRejectionReason =
  | 'none'
  | 'manufacturer_mismatch'
  | 'product_name_mismatch'
  | 'product_line_mismatch'
  | 'npk_mismatch'
  | 'model_identity_mismatch'

export interface StructuredResearchIdentityValidation {
  modelClaimedIdentityMatch: boolean
  identityMatchAccepted: boolean
  rejectionReason: StructuredResearchIdentityRejectionReason
  expectedProductLinePresent: boolean
  recordProductLinePresent: boolean
  expectedNpkPresent: boolean
  recordNpkCompatible: boolean
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
}): StructuredResearchIdentityValidation {
  const modelClaimedIdentityMatch = input.record.identityMatch
  const expectedNpk = resolveExpectedStructuredResearchNpk(input)
  const expectedProductLinePresent = Boolean(normalizeComparable(input.identity.productLine))
  const recordProductLinePresent = Boolean(normalizeComparable(input.record.productLine))
  const recordNpkCompatible = npkTripletsCompatible(expectedNpk, input.record.npk)

  const base = {
    modelClaimedIdentityMatch,
    expectedProductLinePresent,
    recordProductLinePresent,
    expectedNpkPresent: expectedNpk != null,
    recordNpkCompatible,
  }

  if (!modelClaimedIdentityMatch) {
    return {
      ...base,
      identityMatchAccepted: false,
      rejectionReason: 'model_identity_mismatch',
    }
  }

  if (!manufacturersCompatible(input.identity.manufacturer ?? '', input.record.manufacturer)) {
    return {
      ...base,
      identityMatchAccepted: false,
      rejectionReason: 'manufacturer_mismatch',
    }
  }

  if (!productNamesCompatible(input.identity.officialName ?? '', input.record.productName)) {
    return {
      ...base,
      identityMatchAccepted: false,
      rejectionReason: 'product_name_mismatch',
    }
  }

  if (!productLinesCompatible(input.identity.productLine, input.record.productLine)) {
    return {
      ...base,
      identityMatchAccepted: false,
      rejectionReason: 'product_line_mismatch',
    }
  }

  if (!recordNpkCompatible) {
    return {
      ...base,
      identityMatchAccepted: false,
      rejectionReason: 'npk_mismatch',
    }
  }

  return {
    ...base,
    identityMatchAccepted: true,
    rejectionReason: 'none',
  }
}
