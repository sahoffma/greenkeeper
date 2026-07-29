import type {
  FertilizerDeclarationConflict,
  FertilizerFieldProvenance,
  RawFertilizerDeclarationCoverageMetadata,
  RawFertilizerDeclarationInput,
  RawFertilizerDeclarationValue,
} from '../types/fertilizerDeclarationNormalization'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerDeclarationNormalization'
import type {
  FertilizerEnrichmentSourceCategory,
  FertilizerEnrichmentSourceType,
} from '../types/fertilizerEnrichment'
import type {
  FertilizerEnrichmentOrchestrationInput,
  FertilizerSourceAdapterResult,
  FertilizerSourceAdapterSourceType,
} from '../types/fertilizerEnrichmentOrchestration'

const OFFICIAL_SOURCE_CATEGORIES = new Set<FertilizerEnrichmentSourceCategory>([
  'official_manufacturer',
  'official_document',
  'official_catalog',
])

interface FieldContribution {
  fieldPath: string
  numericValue: number | null
  declarationBasis: string | null
  status: RawFertilizerDeclarationValue['status']
  provenanceId: string
  sourceId: string
  sourceCategory: FertilizerEnrichmentSourceCategory
  adapterOrder: number
  categoryRank: number
}

function sourceCategoryRank(category: FertilizerEnrichmentSourceCategory): number {
  switch (category) {
    case 'official_manufacturer':
    case 'official_document':
      return 1
    case 'official_catalog':
      return 2
    case 'packaging_evidence':
      return 3
    case 'user_provided':
      return 4
    case 'supplementary':
      return 5
    default:
      return 6
  }
}

function mapAdapterSourceType(sourceType: FertilizerSourceAdapterSourceType): FertilizerEnrichmentSourceType {
  switch (sourceType) {
    case 'product_profile':
      return 'catalog'
    case 'web_page':
      return 'manufacturer_page'
    case 'pdf_document':
      return 'product_document'
    case 'catalog_entry':
      return 'catalog'
    case 'packaging_image':
      return 'packaging'
    case 'user_upload':
      return 'user_document'
    case 'web_search':
      return 'other'
    default:
      return 'other'
  }
}

function normalizeVariant(value: string | null | undefined): string | null {
  if (value == null) return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.toLowerCase() : null
}

function valuesEqual(a: number | null, b: number | null, basisA: string | null, basisB: string | null): boolean {
  if (a !== b) return false
  const normalizedBasisA = basisA?.trim() ?? null
  const normalizedBasisB = basisB?.trim() ?? null
  return normalizedBasisA === normalizedBasisB
}

function sortContributions(contributions: FieldContribution[]): FieldContribution[] {
  return [...contributions].sort((left, right) => {
    if (left.categoryRank !== right.categoryRank) {
      return left.categoryRank - right.categoryRank
    }
    return left.adapterOrder - right.adapterOrder
  })
}

function buildProvenanceRecord(
  result: FertilizerSourceAdapterResult,
  fieldPath: string,
  evidence?: string | null,
): FertilizerFieldProvenance {
  return {
    provenanceId: result.sourceId,
    fieldPath,
    sourceType: mapAdapterSourceType(result.sourceType),
    sourceCategory: result.sourceCategory,
    sourceUrl: result.sourceUrl ?? null,
    sourceTitle: result.sourceTitle ?? null,
    evidence: evidence ?? null,
    retrievedAt: result.retrievedAt,
    confidence: null,
    productVariantReference: result.productVariantReference ?? null,
    sourceVersion: result.sourceVersion ?? null,
    isPrimary: OFFICIAL_SOURCE_CATEGORIES.has(result.sourceCategory),
  }
}

function mergeFieldContributions(
  contributions: FieldContribution[],
  conflictIdPrefix: string,
): { value: RawFertilizerDeclarationValue; conflicts: FertilizerDeclarationConflict[] } {
  if (contributions.length === 0) {
    return { value: { status: 'not_extracted' }, conflicts: [] }
  }

  const sorted = sortContributions(contributions)
  const primary = sorted[0]
  const provenanceIds = [primary.provenanceId]
  const conflicts: FertilizerDeclarationConflict[] = []

  for (const next of sorted.slice(1)) {
    if (
      valuesEqual(primary.numericValue, next.numericValue, primary.declarationBasis, next.declarationBasis)
    ) {
      if (!provenanceIds.includes(next.provenanceId)) {
        provenanceIds.push(next.provenanceId)
      }
      continue
    }

    const bothOfficial =
      OFFICIAL_SOURCE_CATEGORIES.has(primary.sourceCategory) &&
      OFFICIAL_SOURCE_CATEGORIES.has(next.sourceCategory)
    const secondaryOverridesOfficial =
      OFFICIAL_SOURCE_CATEGORIES.has(primary.sourceCategory) &&
      next.sourceCategory === 'supplementary'

    if (secondaryOverridesOfficial) {
      conflicts.push({
        conflictId: `${conflictIdPrefix}-${conflicts.length + 1}`,
        type: primary.fieldPath.startsWith('npk.')
          ? 'npk_conflict'
          : primary.fieldPath.startsWith('nutrientMatrix.')
            ? 'nutrient_value_conflict'
            : 'source_version_conflict',
        fieldPath: primary.fieldPath,
        sourceIds: [primary.sourceId, next.sourceId],
        values: [
          {
            sourceId: primary.sourceId,
            value: primary.numericValue,
            declarationBasis: primary.declarationBasis,
          },
          {
            sourceId: next.sourceId,
            value: next.numericValue,
            declarationBasis: next.declarationBasis,
          },
        ],
        blocking: true,
        resolvable: true,
        resolutionStatus: 'unresolved',
        reasonCode: bothOfficial ? 'official_sources_mismatch' : 'secondary_source_mismatch',
      })
      continue
    }

    conflicts.push({
      conflictId: `${conflictIdPrefix}-${conflicts.length + 1}`,
      type: primary.fieldPath.startsWith('npk.')
        ? 'npk_conflict'
        : primary.fieldPath.startsWith('nutrientMatrix.')
          ? 'nutrient_value_conflict'
          : 'source_version_conflict',
      fieldPath: primary.fieldPath,
      sourceIds: [primary.sourceId, next.sourceId],
      values: [
        {
          sourceId: primary.sourceId,
          value: primary.numericValue,
          declarationBasis: primary.declarationBasis,
        },
        {
          sourceId: next.sourceId,
          value: next.numericValue,
          declarationBasis: next.declarationBasis,
        },
      ],
      blocking: true,
      resolvable: !bothOfficial,
      resolutionStatus: 'unresolved',
      reasonCode: bothOfficial ? 'official_sources_mismatch' : 'source_value_mismatch',
    })
  }

  return {
    value: {
      status: primary.status,
      value: primary.numericValue ?? undefined,
      declarationBasis: primary.declarationBasis ?? undefined,
      provenanceIds,
      conflictIds: conflicts.map((conflict) => conflict.conflictId),
    },
    conflicts,
  }
}

type ExtractableAdapterResult = Extract<FertilizerSourceAdapterResult, { status: 'success' | 'partial' }>

function collectExtractions(
  results: FertilizerSourceAdapterResult[],
): Array<{ result: ExtractableAdapterResult; order: number }> {
  return results
    .map((result, index) => ({ result, order: index }))
    .filter(
      (entry): entry is { result: ExtractableAdapterResult; order: number } =>
        entry.result.status === 'success' || entry.result.status === 'partial',
    )
}

function appendNpkContributions(
  contributions: FieldContribution[],
  result: Extract<FertilizerSourceAdapterResult, { status: 'success' | 'partial' }>,
  order: number,
): void {
  const npk = result.extraction.extractedNpk
  if (!npk) return

  const entries: Array<[string, number | null | undefined, string | null | undefined]> = [
    ['npk.nitrogen', npk.nitrogen, npk.declarationBasis?.nitrogen ?? 'N'],
    ['npk.phosphate', npk.phosphate, npk.declarationBasis?.phosphate ?? 'P2O5'],
    ['npk.potash', npk.potash, npk.declarationBasis?.potash ?? 'K2O'],
  ]

  for (const [fieldPath, numericValue, declarationBasis] of entries) {
    if (numericValue == null) continue
    contributions.push({
      fieldPath,
      numericValue,
      declarationBasis: declarationBasis ?? null,
      status: 'declared',
      provenanceId: result.sourceId,
      sourceId: result.sourceId,
      sourceCategory: result.sourceCategory,
      adapterOrder: order,
      categoryRank: sourceCategoryRank(result.sourceCategory),
    })
  }
}

function mergeCoverageMetadata(
  extractions: Array<{ result: Extract<FertilizerSourceAdapterResult, { status: 'success' | 'partial' }> }>,
  conflicts: FertilizerDeclarationConflict[],
): RawFertilizerDeclarationCoverageMetadata {
  const evaluatedSourceIds = extractions.map((entry) => entry.result.sourceId)
  const anyFullyCaptured = extractions.some(
    (entry) => entry.result.extraction.coverageMetadata?.nutrientSectionFullyCaptured === true,
  )
  const anyLocated = extractions.some(
    (entry) => entry.result.extraction.coverageMetadata?.nutrientSectionLocated === true,
  )
  const variantMatched = extractions.every(
    (entry) => entry.result.extraction.coverageMetadata?.variantMatched !== false,
  )
  const productScopeConfirmed = extractions.some(
    (entry) => entry.result.extraction.coverageMetadata?.productScopeConfirmed === true,
  )

  return {
    sourceEvaluationStatus: anyFullyCaptured ? 'source_fully_evaluated' : anyLocated ? 'source_partial' : 'not_started',
    evaluatedSourceIds,
    productScopeConfirmed,
    variantMatched,
    nutrientSectionLocated: anyLocated,
    nutrientSectionFullyCaptured: anyFullyCaptured,
    declarationBasisResolved: anyFullyCaptured,
    hasBlockingDeclarationConflict: conflicts.some((conflict) => conflict.blocking),
  }
}

function buildIdentity(
  input: FertilizerEnrichmentOrchestrationInput,
  extractions: Array<{ result: Extract<FertilizerSourceAdapterResult, { status: 'success' | 'partial' }> }>,
): { identity: RawFertilizerDeclarationInput['identity']; conflicts: FertilizerDeclarationConflict[] } {
  const base = input.identity
  const conflicts: FertilizerDeclarationConflict[] = []
  const expectedVariant = normalizeVariant(base.variant)

  for (const { result } of extractions) {
    const adapterVariant = normalizeVariant(
      result.productVariantReference ?? result.extraction.extractedIdentity?.variant ?? null,
    )
    if (adapterVariant && expectedVariant && adapterVariant !== expectedVariant) {
      conflicts.push({
        conflictId: `conflict-variant-${result.sourceId}`,
        type: 'variant_conflict',
        fieldPath: 'identity.variant',
        sourceIds: [result.sourceId],
        values: [
          { sourceId: result.sourceId, value: adapterVariant },
          { sourceId: 'recognition', value: expectedVariant },
        ],
        blocking: true,
        resolvable: true,
        resolutionStatus: 'unresolved',
        reasonCode: 'variant_mismatch',
      })
    }
  }

  return {
    identity: {
      manufacturer: base.manufacturer,
      officialName: base.officialName,
      productLine: base.productLine ?? null,
      variant: base.variant,
      identityFingerprint: base.identityFingerprint,
      identityConfidence: base.identityConfidence,
      hasIdentityAmbiguity: base.hasIdentityAmbiguity,
      identityAmbiguityResolvable: base.identityAmbiguityResolvable,
      identityNotActionable: base.identityNotActionable,
    },
    conflicts,
  }
}

function selectProductForm(
  _input: FertilizerEnrichmentOrchestrationInput,
  extractions: Array<{ result: Extract<FertilizerSourceAdapterResult, { status: 'success' | 'partial' }>; order: number }>,
): RawFertilizerDeclarationInput['productForm'] {
  const sorted = [...extractions].sort((left, right) => {
    const leftRank = sourceCategoryRank(left.result.sourceCategory)
    const rightRank = sourceCategoryRank(right.result.sourceCategory)
    if (leftRank !== rightRank) return leftRank - rightRank
    return left.order - right.order
  })

  for (const entry of sorted) {
    const form = entry.result.extraction.extractedProductForm
    if (form != null) {
      return {
        value: form,
        provenanceIds: [entry.result.sourceId],
      }
    }
  }

  return { value: null }
}

export function mergeFertilizerSourceAdapterResults(
  input: FertilizerEnrichmentOrchestrationInput,
  adapterResults: FertilizerSourceAdapterResult[],
): {
  conflicts: FertilizerDeclarationConflict[]
  provenanceRecords: Record<string, FertilizerFieldProvenance>
  extractions: Array<{
    result: ExtractableAdapterResult
    order: number
  }>
} {
  const extractions = collectExtractions(adapterResults)
  const provenanceRecords: Record<string, FertilizerFieldProvenance> = {}
  const conflicts: FertilizerDeclarationConflict[] = []

  for (const entry of extractions) {
    provenanceRecords[entry.result.sourceId] = buildProvenanceRecord(entry.result, 'declaration')
    for (const evidence of entry.result.extraction.evidence ?? []) {
      const fieldPath = evidence.fieldPath ?? 'declaration'
      provenanceRecords[`${entry.result.sourceId}:${evidence.evidenceId}`] = buildProvenanceRecord(
        entry.result,
        fieldPath,
        evidence.excerpt,
      )
    }
  }

  const { conflicts: identityConflicts } = buildIdentity(input, extractions)
  conflicts.push(...identityConflicts)

  return { conflicts, provenanceRecords, extractions }
}

export function buildRawFertilizerDeclarationInput(
  input: FertilizerEnrichmentOrchestrationInput,
  adapterResults: FertilizerSourceAdapterResult[],
  options: {
    enrichmentRunId: string
    extractedAt: string
  },
): RawFertilizerDeclarationInput {
  const merged = mergeFertilizerSourceAdapterResults(input, adapterResults)
  const npkContributions: FieldContribution[] = []
  const nutrientContributions = new Map<string, FieldContribution[]>()

  for (const entry of merged.extractions) {
    appendNpkContributions(npkContributions, entry.result, entry.order)
    for (const nutrient of entry.result.extraction.extractedNutrients ?? []) {
      const fieldPath = `nutrientMatrix.${nutrient.key}`
      const existing = nutrientContributions.get(fieldPath) ?? []
      existing.push({
        fieldPath,
        numericValue: nutrient.value,
        declarationBasis: nutrient.declarationBasis ?? null,
        status: nutrient.value == null ? 'not_extracted' : 'declared',
        provenanceId: entry.result.sourceId,
        sourceId: entry.result.sourceId,
        sourceCategory: entry.result.sourceCategory,
        adapterOrder: entry.order,
        categoryRank: sourceCategoryRank(entry.result.sourceCategory),
      })
      nutrientContributions.set(fieldPath, existing)
    }
  }

  const npkNitrogen = mergeFieldContributions(
    npkContributions.filter((contribution) => contribution.fieldPath === 'npk.nitrogen'),
    'conflict-npk-n',
  )
  const npkPhosphate = mergeFieldContributions(
    npkContributions.filter((contribution) => contribution.fieldPath === 'npk.phosphate'),
    'conflict-npk-p',
  )
  const npkPotash = mergeFieldContributions(
    npkContributions.filter((contribution) => contribution.fieldPath === 'npk.potash'),
    'conflict-npk-k',
  )

  const nutrientMatrix = Object.fromEntries(
    FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => {
      const mergedNutrient = mergeFieldContributions(
        nutrientContributions.get(`nutrientMatrix.${key}`) ?? [],
        `conflict-nutrient-${key}`,
      )
      return [key, mergedNutrient.value]
    }),
  ) as RawFertilizerDeclarationInput['nutrientMatrix']

  const fieldConflicts = [
    npkNitrogen.conflicts,
    npkPhosphate.conflicts,
    npkPotash.conflicts,
    ...FERTILIZER_NUTRIENT_MATRIX_KEYS.map(
      (key) =>
        mergeFieldContributions(
          nutrientContributions.get(`nutrientMatrix.${key}`) ?? [],
          `conflict-nutrient-${key}`,
        ).conflicts,
    ),
  ].flat()

  const sourceConflicts = [...merged.conflicts, ...fieldConflicts]
  const coverageMetadata = mergeCoverageMetadata(merged.extractions, sourceConflicts)
  const hasNpkBasis =
    npkNitrogen.value.status === 'declared' ||
    npkPhosphate.value.status === 'declared' ||
    npkPotash.value.status === 'declared'

  return {
    objectCategory: input.objectCategory,
    identity: buildIdentity(input, merged.extractions).identity,
    productForm: selectProductForm(input, merged.extractions),
    npk: {
      nitrogen: npkNitrogen.value,
      phosphate: npkPhosphate.value,
      potash: npkPotash.value,
      declarationBasis: hasNpkBasis
        ? { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' }
        : null,
      provenanceIds: [
        ...(npkNitrogen.value.provenanceIds ?? []),
        ...(npkPhosphate.value.provenanceIds ?? []),
        ...(npkPotash.value.provenanceIds ?? []),
      ],
      conflictIds: [
        ...npkNitrogen.value.conflictIds ?? [],
        ...npkPhosphate.value.conflictIds ?? [],
        ...npkPotash.value.conflictIds ?? [],
      ],
    },
    nutrientMatrix,
    coverageMetadata,
    provenanceRecords: merged.provenanceRecords,
    sourceConflicts,
    enrichmentRunId: options.enrichmentRunId,
    extractedAt: options.extractedAt,
  }
}

export function hasSufficientStructuredDataForPipeline(raw: RawFertilizerDeclarationInput): boolean {
  if (raw.coverageMetadata.sourceEvaluationStatus !== 'not_started') {
    return true
  }
  if (raw.coverageMetadata.nutrientSectionLocated) {
    return true
  }

  const npkValues = [raw.npk.nitrogen, raw.npk.phosphate, raw.npk.potash]
  if (npkValues.some((value) => value?.status === 'declared')) {
    return true
  }

  return Object.values(raw.nutrientMatrix).some((value) => value?.status === 'declared')
}

export function isFastPathEligible(
  assessment: { decision: string },
): assessment is { decision: 'eligible' } {
  return assessment.decision === 'eligible'
}
