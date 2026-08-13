import type { RawFertilizerDeclarationInput } from '../types/fertilizerDeclarationNormalization'
import type { FertilizerEnrichmentSourceCategory } from '../types/fertilizerEnrichment'

const OFFICIAL_SOURCE_CATEGORIES = new Set<FertilizerEnrichmentSourceCategory>([
  'official_manufacturer',
  'official_document',
  'official_catalog',
])

export type FertilizerSourceConflictWinner =
  | 'manufacturer'
  | 'packaging'
  | 'unresolved'
  | 'none'

export interface FertilizerSourceProvenanceReadinessDiagnostic {
  structuredDeclarationSourcePresent: boolean
  structuredDeclarationSourceAccepted: boolean
  declarationSourceIdPresent: boolean
  declarationSourceType: string
  declarationSourceOfficial: boolean
  nutrientMatrixSourceIdPresent: boolean
  nutrientMatrixSourceMatchesDeclarationSource: boolean
  sourceConflictDetected: boolean
  sourceConflictFieldCount: number
  sourceConflictKinds: string[]
  sourceConflictWinner: FertilizerSourceConflictWinner
  acceptedManufacturerSourceCount: number
  acceptedPackagingSourceCount: number
}

export interface BuildFertilizerSourceProvenanceReadinessDiagnosticInput {
  rawDeclarationInput?: RawFertilizerDeclarationInput | null
  adapterOutcomes?: Array<{
    adapterType: string
    status: string
    sourceCategory?: string | null
    sourceType?: string | null
  }>
}

function readOfficialDeclarationSourceId(
  raw: RawFertilizerDeclarationInput | null | undefined,
): string | null {
  if (!raw?.coverageMetadata?.nutrientSectionFullyCaptured) {
    return null
  }

  for (const sourceId of raw.coverageMetadata.evaluatedSourceIds ?? []) {
    const record = raw.provenanceRecords[sourceId]
    if (record && OFFICIAL_SOURCE_CATEGORIES.has(record.sourceCategory)) {
      return sourceId
    }
  }

  for (const record of Object.values(raw.provenanceRecords)) {
    if (
      record.isPrimary === true &&
      OFFICIAL_SOURCE_CATEGORIES.has(record.sourceCategory) &&
      record.fieldPath === 'declaration'
    ) {
      return record.provenanceId
    }
  }

  return null
}

function readMatrixProvenanceSourceId(
  raw: RawFertilizerDeclarationInput | null | undefined,
): string | null {
  if (!raw) {
    return null
  }

  for (const key of Object.keys(raw.nutrientMatrix)) {
    const entry = raw.nutrientMatrix[key as keyof typeof raw.nutrientMatrix]
    const provenanceId = entry?.provenanceIds?.[0]
    if (provenanceId) {
      return provenanceId
    }
  }

  const npkProvenanceId = raw.npk.nitrogen?.provenanceIds?.[0]
  return npkProvenanceId ?? null
}

function resolveSourceConflictWinner(
  conflicts: RawFertilizerDeclarationInput['sourceConflicts'],
): FertilizerSourceConflictWinner {
  if (conflicts.length === 0) {
    return 'none'
  }

  const blocking = conflicts.filter((conflict) => conflict.blocking)
  if (blocking.length === 0) {
    return 'none'
  }

  if (blocking.some((conflict) => !conflict.resolvable)) {
    return 'unresolved'
  }

  const hasPackaging = blocking.some((conflict) =>
    conflict.sourceIds.some((sourceId) => sourceId.includes('packaging')),
  )

  return hasPackaging ? 'packaging' : 'manufacturer'
}

export function buildFertilizerSourceProvenanceReadinessDiagnostic(
  input: BuildFertilizerSourceProvenanceReadinessDiagnosticInput,
): FertilizerSourceProvenanceReadinessDiagnostic {
  const raw = input.rawDeclarationInput ?? null
  const adapterOutcomes = input.adapterOutcomes ?? []
  const declarationSourceId = readOfficialDeclarationSourceId(raw)
  const matrixSourceId = readMatrixProvenanceSourceId(raw)
  const declarationRecord = declarationSourceId
    ? raw?.provenanceRecords[declarationSourceId]
    : null
  const blockingConflicts =
    raw?.sourceConflicts.filter((conflict) => conflict.blocking) ?? []
  const structuredWebSourcePresent = Boolean(
    declarationSourceId?.startsWith('manufacturer-web-search:'),
  )

  const acceptedManufacturerSourceCount = adapterOutcomes.filter(
    (outcome) =>
      (outcome.status === 'success' || outcome.status === 'partial') &&
      outcome.adapterType.startsWith('manufacturer'),
  ).length

  const acceptedPackagingSourceCount = adapterOutcomes.filter(
    (outcome) =>
      (outcome.status === 'success' || outcome.status === 'partial') &&
      outcome.adapterType === 'packaging',
  ).length

  return {
    structuredDeclarationSourcePresent: structuredWebSourcePresent,
    structuredDeclarationSourceAccepted:
      structuredWebSourcePresent && declarationSourceId != null,
    declarationSourceIdPresent: declarationSourceId != null,
    declarationSourceType: declarationRecord?.sourceType ?? 'missing',
    declarationSourceOfficial: declarationRecord
      ? OFFICIAL_SOURCE_CATEGORIES.has(declarationRecord.sourceCategory)
      : false,
    nutrientMatrixSourceIdPresent: matrixSourceId != null,
    nutrientMatrixSourceMatchesDeclarationSource:
      declarationSourceId != null &&
      matrixSourceId != null &&
      declarationSourceId === matrixSourceId,
    sourceConflictDetected: blockingConflicts.length > 0,
    sourceConflictFieldCount: blockingConflicts.length,
    sourceConflictKinds: [...new Set(blockingConflicts.map((conflict) => conflict.type))].sort(),
    sourceConflictWinner: resolveSourceConflictWinner(raw?.sourceConflicts ?? []),
    acceptedManufacturerSourceCount,
    acceptedPackagingSourceCount,
  }
}
