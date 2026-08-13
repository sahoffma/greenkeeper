import { normalizeResearchToken } from './fertilizerManufacturerResearchQueryCore'
import type { ManufacturerStructuredResearchSourceRecord } from './fertilizerManufacturerStructuredResearchCore'
import {
  npkTripletsCompatible,
  productLinesCompatible,
  resolveExpectedStructuredResearchNpk,
} from './fertilizerManufacturerStructuredResearchIdentityCore'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'

export interface StructuredResearchSourceIdentityRecord {
  manufacturer: string | null
  productLine: string | null
  productName: string | null
  npkLabel: string | null
}

export interface StructuredResearchSourceIdentityEvidence {
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

export function parseNpkTripletFromText(
  text: string | null | undefined,
): { nitrogen: number; phosphate: number; potash: number } | null {
  const normalized = text ?? ''
  const match = normalized.match(/\b(\d+)\s*[-–—]\s*(\d+)\s*[-–—]\s*(\d+)\b/)
  if (!match) {
    return null
  }

  return {
    nitrogen: Number(match[1]),
    phosphate: Number(match[2]),
    potash: Number(match[3]),
  }
}

export function buildStructuredResearchSourceIdentityText(
  source: Pick<ManufacturerStructuredResearchSourceRecord, 'url' | 'title' | 'sourceIdentity'>,
): string {
  const parts = [source.url, source.title]

  if (source.sourceIdentity) {
    parts.push(
      source.sourceIdentity.manufacturer ?? '',
      source.sourceIdentity.productLine ?? '',
      source.sourceIdentity.productName ?? '',
      source.sourceIdentity.npkLabel ?? '',
    )
  }

  return normalizeComparable(parts.join(' '))
}

export function sourceTextEvidencesProductLine(
  sourceText: string,
  expectedProductLine: string | null | undefined,
): boolean {
  const expected = normalizeComparable(expectedProductLine)
  if (!expected) {
    return true
  }

  const normalizedSource = normalizeComparable(sourceText)
  return normalizedSource.includes(expected)
}

export function sourceTextEvidencesNpk(
  sourceText: string,
  expectedNpk: { nitrogen: number; phosphate: number; potash: number } | null,
): boolean {
  if (!expectedNpk) {
    return true
  }

  const parsedFromText = parseNpkTripletFromText(sourceText)
  if (parsedFromText && npkTripletsCompatible(expectedNpk, parsedFromText)) {
    return true
  }

  const normalizedSource = normalizeComparable(sourceText)
  const spaceSeparatedMatch = normalizedSource.match(/\b(\d+)\s+(\d+)\s+(\d+)\b/)
  if (spaceSeparatedMatch) {
    const parsedFromNormalized = {
      nitrogen: Number(spaceSeparatedMatch[1]),
      phosphate: Number(spaceSeparatedMatch[2]),
      potash: Number(spaceSeparatedMatch[3]),
    }
    if (npkTripletsCompatible(expectedNpk, parsedFromNormalized)) {
      return true
    }
  }

  return false
}

export function evaluateStructuredResearchSourceIdentityEvidence(input: {
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  primarySource?: ManufacturerStructuredResearchSourceRecord | null
  recordProductLineMatchesExpected: boolean
  recordNpkCompatible: boolean
}): StructuredResearchSourceIdentityEvidence {
  const primarySource = input.primarySource
  const expectedNpk = resolveExpectedStructuredResearchNpk(input)
  const expectedProductLinePresent = Boolean(normalizeComparable(input.identity.productLine))

  if (!primarySource) {
    return {
      canonicalDeclarationSourcePresent: false,
      canonicalDeclarationSourceIdentityVerified: false,
      canonicalDeclarationSourceProductLineVerified: false,
      canonicalDeclarationSourceNpkVerified: false,
      declarationSourceIdentityMismatch: true,
      structuredIdentityEchoSuspected: false,
      sourceBoundIdentityAccepted: false,
    }
  }

  const sourceText = buildStructuredResearchSourceIdentityText(primarySource)
  const rawSourceIdentityText = [
    primarySource.url,
    primarySource.title,
    primarySource.sourceIdentity?.npkLabel ?? '',
  ].join(' ')
  const declaredSourceIdentity = primarySource.sourceIdentity

  const canonicalDeclarationSourceProductLineVerified = sourceTextEvidencesProductLine(
    sourceText,
    input.identity.productLine,
  )
  const canonicalDeclarationSourceNpkVerified = sourceTextEvidencesNpk(
    rawSourceIdentityText,
    expectedNpk,
  )

  const declaredProductLineMismatch =
    expectedProductLinePresent &&
    declaredSourceIdentity?.productLine != null &&
    !productLinesCompatible(input.identity.productLine, declaredSourceIdentity.productLine)

  const declaredNpkMismatch =
    expectedNpk != null &&
    declaredSourceIdentity?.npkLabel != null &&
    !npkTripletsCompatible(expectedNpk, parseNpkTripletFromText(declaredSourceIdentity.npkLabel))

  const declarationSourceIdentityMismatch =
    declaredProductLineMismatch || declaredNpkMismatch

  const structuredIdentityEchoSuspected =
    input.recordProductLineMatchesExpected &&
    input.recordNpkCompatible &&
    expectedProductLinePresent &&
    !canonicalDeclarationSourceProductLineVerified

  const canonicalDeclarationSourceIdentityVerified =
    !declarationSourceIdentityMismatch &&
    canonicalDeclarationSourceProductLineVerified &&
    canonicalDeclarationSourceNpkVerified

  return {
    canonicalDeclarationSourcePresent: true,
    canonicalDeclarationSourceIdentityVerified,
    canonicalDeclarationSourceProductLineVerified,
    canonicalDeclarationSourceNpkVerified,
    declarationSourceIdentityMismatch,
    structuredIdentityEchoSuspected,
    sourceBoundIdentityAccepted: canonicalDeclarationSourceIdentityVerified && !structuredIdentityEchoSuspected,
  }
}
