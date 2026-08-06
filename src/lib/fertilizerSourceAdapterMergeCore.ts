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
import type { FertilizerNutrientMatrixKey } from '../types/fertilizerReadiness'
import {
  CAPTURE_RECOGNITION_PACKAGING_SOURCE_ID,
  mapAdapterExtractedProductFormToEnrichment,
  PRODUCT_FORM_UNIT_CONFLICT_ID,
  resolveCapturePackageUnitInferredFormProvenanceId,
  resolveExplicitOrchestrationRecognitionProductForm,
  resolveProductFormFromCapturePackageUnit,
} from './fertilizerRecognitionEnrichmentBasisCore'

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
    case 'text_document':
      return 'product_document'
    case 'catalog_entry':
      return 'catalog'
    case 'packaging_image':
    case 'packaging_label_text':
      return 'packaging'
    case 'user_upload':
      return 'user_document'
    case 'web_search':
      return 'other'
    default:
      return 'other'
  }
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function defaultDeclarationBasisForMatrixKey(key: FertilizerNutrientMatrixKey): string {
  switch (key) {
    case 'phosphate':
      return 'P2O5'
    case 'potash':
      return 'K2O'
    case 'magnesium':
      return 'MgO'
    case 'calcium':
      return 'CaO'
    case 'sulfur':
      return 'SO3'
    case 'iron':
      return 'Fe'
    case 'manganese':
      return 'Mn'
    case 'copper':
      return 'Cu'
    case 'zinc':
      return 'Zn'
    case 'boron':
      return 'B'
    case 'molybdenum':
      return 'Mo'
    default:
      return 'N'
  }
}

function resolveRecognitionPackagingSourceId(
  input: FertilizerEnrichmentOrchestrationInput,
  extractions: Array<{ result: ExtractableAdapterResult }>,
): string | null {
  const basisSourceId = input.captureRecognitionPackagingBasis?.sourceId
  if (basisSourceId) {
    return basisSourceId
  }

  for (const entry of extractions) {
    if (entry.result.sourceCategory === 'packaging_evidence') {
      return entry.result.sourceId
    }
  }

  return null
}

function resolveIdentityManufacturer(
  input: FertilizerEnrichmentOrchestrationInput,
  extractions: Array<{ result: ExtractableAdapterResult }>,
): string | null {
  if (isNonEmptyString(input.identity.manufacturer)) {
    return input.identity.manufacturer.trim()
  }

  const basisManufacturer = input.captureRecognitionPackagingBasis?.manufacturer
  if (isNonEmptyString(basisManufacturer)) {
    return basisManufacturer.trim()
  }

  for (const { result } of extractions) {
    const adapterManufacturer = result.extraction.extractedIdentity?.manufacturer
    if (isNonEmptyString(adapterManufacturer)) {
      return adapterManufacturer.trim()
    }
  }

  return null
}

function appendRecognitionBasisNpkContributions(
  contributions: FieldContribution[],
  input: FertilizerEnrichmentOrchestrationInput,
): void {
  const npk = input.captureRecognitionPackagingBasis?.npk
  const sourceId = input.captureRecognitionPackagingBasis?.sourceId ?? CAPTURE_RECOGNITION_PACKAGING_SOURCE_ID

  if (!npk) {
    return
  }

  const entries: Array<[string, number, string]> = [
    ['npk.nitrogen', npk.nitrogen, 'N'],
    ['npk.phosphate', npk.phosphate, 'P2O5'],
    ['npk.potash', npk.potash, 'K2O'],
  ]

  for (const [fieldPath, numericValue, declarationBasis] of entries) {
    if (contributions.some((contribution) => contribution.fieldPath === fieldPath)) {
      continue
    }

    contributions.push({
      fieldPath,
      numericValue,
      declarationBasis,
      status: 'declared',
      provenanceId: sourceId,
      sourceId,
      sourceCategory: 'packaging_evidence',
      adapterOrder: -1,
      categoryRank: sourceCategoryRank('packaging_evidence'),
    })
  }
}

function applyRecognitionPackagingMatrixCompletion(
  nutrientMatrix: RawFertilizerDeclarationInput['nutrientMatrix'],
  npk: Pick<RawFertilizerDeclarationInput, 'npk'>['npk'],
  coverageMetadata: RawFertilizerDeclarationCoverageMetadata,
  packagingSourceId: string | null,
): RawFertilizerDeclarationInput['nutrientMatrix'] {
  if (
    !coverageMetadata.nutrientSectionFullyCaptured ||
    !coverageMetadata.productScopeConfirmed ||
    packagingSourceId == null
  ) {
    return nutrientMatrix
  }

  const completed = { ...nutrientMatrix }
  const npkMatrixKeys: Array<[FertilizerNutrientMatrixKey, RawFertilizerDeclarationValue | null | undefined]> =
    [
      ['nitrogen', npk.nitrogen],
      ['phosphate', npk.phosphate],
      ['potash', npk.potash],
    ]

  for (const [key, npkValue] of npkMatrixKeys) {
    const current = completed[key]
    if (current?.status === 'declared') {
      continue
    }

    if (npkValue?.status === 'declared' && npkValue.value != null) {
      completed[key] = {
        status: 'declared',
        value: npkValue.value,
        declarationBasis: npkValue.declarationBasis ?? defaultDeclarationBasisForMatrixKey(key),
        provenanceIds: npkValue.provenanceIds ?? [packagingSourceId],
      }
    }
  }

  const hasDeclaredAdditionalNutrient = FERTILIZER_NUTRIENT_MATRIX_KEYS.some((key) => {
    if (key === 'nitrogen' || key === 'phosphate' || key === 'potash') {
      return false
    }

    return completed[key]?.status === 'declared'
  })

  if (!hasDeclaredAdditionalNutrient) {
    return completed
  }

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    const current = completed[key]
    if (current?.status === 'declared' || current?.status === 'not_declared') {
      continue
    }

    completed[key] = {
      status: 'not_declared',
      declarationBasis: defaultDeclarationBasisForMatrixKey(key),
      provenanceIds: [packagingSourceId],
    }
  }

  return completed
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
      manufacturer: resolveIdentityManufacturer(input, extractions),
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
  input: FertilizerEnrichmentOrchestrationInput,
  extractions: Array<{ result: Extract<FertilizerSourceAdapterResult, { status: 'success' | 'partial' }>; order: number }>,
): {
  productForm: RawFertilizerDeclarationInput['productForm']
  conflicts: FertilizerDeclarationConflict[]
} {
  const basisSourceId =
    input.captureRecognitionPackagingBasis?.sourceId ?? CAPTURE_RECOGNITION_PACKAGING_SOURCE_ID
  const explicitRecognition = resolveExplicitOrchestrationRecognitionProductForm(input)
  const unitInferred = resolveProductFormFromCapturePackageUnit(input)
  const unitProvenanceId = resolveCapturePackageUnitInferredFormProvenanceId(input)

  const sorted = [...extractions].sort((left, right) => {
    const leftRank = sourceCategoryRank(left.result.sourceCategory)
    const rightRank = sourceCategoryRank(right.result.sourceCategory)
    if (leftRank !== rightRank) return leftRank - rightRank
    return left.order - right.order
  })

  let adapterForm: 'granular' | 'liquid' | null = null
  let adapterProvenanceId: string | null = null

  for (const entry of sorted) {
    const mapped = mapAdapterExtractedProductFormToEnrichment(
      entry.result.extraction.extractedProductForm ?? null,
    )
    if (mapped != null) {
      adapterForm = mapped
      adapterProvenanceId = entry.result.sourceId
      break
    }
  }

  const selectedBeforeUnit = explicitRecognition ?? adapterForm

  if (selectedBeforeUnit && unitInferred && selectedBeforeUnit !== unitInferred) {
    const explicitSourceId = explicitRecognition ? basisSourceId : (adapterProvenanceId ?? basisSourceId)
    return {
      productForm: {
        value: null,
        conflictIds: [PRODUCT_FORM_UNIT_CONFLICT_ID],
      },
      conflicts: [
        {
          conflictId: PRODUCT_FORM_UNIT_CONFLICT_ID,
          type: 'product_form_conflict',
          fieldPath: 'basis.product_form',
          sourceIds: [explicitSourceId, unitProvenanceId],
          values: [
            { sourceId: explicitSourceId, value: selectedBeforeUnit },
            { sourceId: unitProvenanceId, value: unitInferred },
          ],
          blocking: true,
          resolvable: true,
          resolutionStatus: 'requires_user_input',
          reasonCode: 'form_unit_mismatch',
        },
      ],
    }
  }

  if (explicitRecognition) {
    return {
      productForm: {
        value: explicitRecognition,
        provenanceIds: [basisSourceId],
      },
      conflicts: [],
    }
  }

  if (adapterForm && adapterProvenanceId) {
    return {
      productForm: {
        value: adapterForm,
        provenanceIds: [adapterProvenanceId],
      },
      conflicts: [],
    }
  }

  if (unitInferred) {
    return {
      productForm: {
        value: unitInferred,
        provenanceIds: [unitProvenanceId],
      },
      conflicts: [],
    }
  }

  return {
    productForm: { value: null },
    conflicts: [],
  }
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

  appendRecognitionBasisNpkContributions(npkContributions, input)

  const recognitionBasis = input.captureRecognitionPackagingBasis
  const provenanceRecords = { ...merged.provenanceRecords }
  if (recognitionBasis?.sourceId && !provenanceRecords[recognitionBasis.sourceId]) {
    provenanceRecords[recognitionBasis.sourceId] = {
      provenanceId: recognitionBasis.sourceId,
      fieldPath: 'declaration',
      sourceType: 'packaging',
      sourceCategory: 'packaging_evidence',
      sourceUrl: null,
      sourceTitle: 'Capture recognition packaging',
      evidence: null,
      retrievedAt: options.extractedAt,
      confidence: null,
      productVariantReference: recognitionBasis.variant,
      sourceVersion: null,
      isPrimary: false,
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

  const productFormSelection = selectProductForm(input, merged.extractions)
  const unitInferredProvenanceId = resolveCapturePackageUnitInferredFormProvenanceId(input)
  if (
    productFormSelection.productForm.provenanceIds?.includes(unitInferredProvenanceId) &&
    !provenanceRecords[unitInferredProvenanceId]
  ) {
    const basis = input.captureRecognitionPackagingBasis
    provenanceRecords[unitInferredProvenanceId] = {
      provenanceId: unitInferredProvenanceId,
      fieldPath: 'basis.product_form',
      sourceType: 'packaging',
      sourceCategory: 'packaging_evidence',
      sourceUrl: null,
      sourceTitle: 'Package unit inferred product form',
      evidence:
        basis?.packageSizeValue != null && basis.packageSizeUnit
          ? `${basis.packageSizeValue} ${basis.packageSizeUnit}`
          : basis?.packageSizeUnit ?? null,
      retrievedAt: options.extractedAt,
      confidence: null,
      productVariantReference: basis?.variant ?? null,
      sourceVersion: null,
      isPrimary: false,
    }
  }

  const sourceConflicts = [
    ...merged.conflicts,
    ...fieldConflicts,
    ...productFormSelection.conflicts,
  ]
  const coverageMetadata = mergeCoverageMetadata(merged.extractions, sourceConflicts)

  const nutrientMatrix = applyRecognitionPackagingMatrixCompletion(
    Object.fromEntries(
      FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => {
        const mergedNutrient = mergeFieldContributions(
          nutrientContributions.get(`nutrientMatrix.${key}`) ?? [],
          `conflict-nutrient-${key}`,
        )
        return [key, mergedNutrient.value]
      }),
    ) as RawFertilizerDeclarationInput['nutrientMatrix'],
    {
      nitrogen: npkNitrogen.value,
      phosphate: npkPhosphate.value,
      potash: npkPotash.value,
      declarationBasis: null,
      provenanceIds: [],
      conflictIds: [],
    },
    coverageMetadata,
    resolveRecognitionPackagingSourceId(input, merged.extractions),
  )

  const hasNpkBasis =
    npkNitrogen.value.status === 'declared' ||
    npkPhosphate.value.status === 'declared' ||
    npkPotash.value.status === 'declared'

  return {
    objectCategory: input.objectCategory,
    identity: buildIdentity(input, merged.extractions).identity,
    productForm: productFormSelection.productForm,
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
    provenanceRecords,
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
