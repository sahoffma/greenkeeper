import OpenAI from 'openai'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type { FertilizerSourceAdapterResult } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerManufacturerResearchSearchProviderOutcome } from '../types/fertilizerManufacturerResearchSearch'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerReadiness'
import type { FertilizerOfficialSourceCandidateCategory } from './fertilizerManufacturerResearchCore'
import type { FertilizerManufacturerResearchFetchProvider } from './fertilizerManufacturerResearchCore'
import { validateFertilizerManufacturerDocumentSource } from './fertilizerManufacturerDocumentSourceValidatorCore'
import {
  normalizeSearchCategory,
} from './fertilizerManufacturerResearchSearchProviderCore'
import {
  countStructuredMatrixEntries,
  type StructuredMatrixCounts,
} from './fertilizerManufacturerNutrientChainDiagnosticsCore'
import type {
  StructuredDeclarationCompletenessValidation,
} from '../types/fertilizerManufacturerResearchDiagnostics'
import { PRODUCT_RECOGNIZE_IMAGE_MODEL } from './productRecognizeImageCore'
import {
  validateStructuredResearchIdentityMatch,
  type StructuredResearchIdentityValidation,
} from './fertilizerManufacturerStructuredResearchIdentityCore'
import type { StructuredResearchSourceIdentityRecord } from './fertilizerManufacturerStructuredResearchSourceIdentityCore'
import {
  validateStructuredResearchNutrientProvenance,
  filterStructuredResearchRecordNutrientsByProvenance,
  type StructuredResearchNutrientProvenanceValidation,
} from './fertilizerManufacturerStructuredResearchNutrientProvenanceCore'
import {
  extractTrustedWebSearchCandidatesFromResponseOutput,
  selectCanonicalManufacturerSearchCandidate,
  type ManufacturerSearchCandidateSelection,
  type ManufacturerSearchResearchDecision,
  buildManufacturerSearchNutrientBindings,
  buildManufacturerSearchResearchDecision,
  candidateToPrimarySourceRecord,
  isModelSourceCitationVerified,
} from './fertilizerManufacturerSearchCandidateCore'
import {
  buildManufacturerProductResolutionPrompt,
  manufacturerProductResolutionSchema,
  parseManufacturerProductResolutionRecord,
  type ManufacturerProductResolutionRecord,
} from './fertilizerManufacturerProductResolutionCore'
import {
  enrichManufacturerSearchCandidatesWithFetchedEvidence,
  type EnrichedManufacturerSearchCandidate,
} from './fertilizerManufacturerSearchCandidateEvidenceCore'
import {
  extractManufacturerDeclarationFromCanonicalSource,
  phaseBExtractionUsesOnlyCanonicalSource,
} from './fertilizerManufacturerDeclarationExtractionCore'
import type {
  ManufacturerSearchCandidateDiagnostic,
  ManufacturerSearchResearchDecisionDiagnostic,
  ManufacturerStructuredResearchPhaseBDiagnostics,
} from '../types/fertilizerManufacturerResearchDiagnostics'
import { countAdapterMatrixEntries } from './fertilizerManufacturerNutrientChainDiagnosticsCore'

export const MANUFACTURER_RESEARCH_STRUCTURED_BUDGET_MS = 16_000

const NPK_MATRIX_KEYS = ['nitrogen', 'phosphate', 'potash'] as const

const nutrientMatrixSchemaProperties = Object.fromEntries(
  FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [key, { type: ['number', 'null'] }]),
)

const nutrientDeclarationBasisSchemaProperties = Object.fromEntries(
  FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [key, { type: ['string', 'null'] }]),
)

export const manufacturerStructuredResearchSchema = {
  type: 'object',
  properties: {
    manufacturer: { type: 'string' },
    productLine: { type: ['string', 'null'] },
    productName: { type: 'string' },
    productForm: { type: 'string', enum: ['granular', 'liquid', 'unknown'] },
    npk: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            nitrogen: { type: 'number' },
            phosphate: { type: 'number' },
            potash: { type: 'number' },
          },
          required: ['nitrogen', 'phosphate', 'potash'],
          additionalProperties: false,
        },
      ],
    },
    nutrientMatrix: {
      type: 'object',
      properties: nutrientMatrixSchemaProperties,
      required: [...FERTILIZER_NUTRIENT_MATRIX_KEYS],
      additionalProperties: false,
    },
    nutrientDeclarationBases: {
      type: 'object',
      properties: nutrientDeclarationBasisSchemaProperties,
      required: [...FERTILIZER_NUTRIENT_MATRIX_KEYS],
      additionalProperties: false,
    },
    nutrientSourceIndices: {
      type: 'object',
      properties: Object.fromEntries(
        FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [key, { type: ['integer', 'null'] }]),
      ),
      required: [...FERTILIZER_NUTRIENT_MATRIX_KEYS],
      additionalProperties: false,
    },
    declarationComplete: { type: 'boolean' },
    identityMatch: { type: 'boolean' },
    confidence: { type: 'number' },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          title: { type: 'string' },
          category: {
            type: 'string',
            enum: [
              'official_manufacturer',
              'official_brand',
              'official_document',
              'verified_catalog',
              'retailer',
              'other_web',
            ],
          },
          sourceIdentity: {
            type: 'object',
            properties: {
              manufacturer: { type: ['string', 'null'] },
              productLine: { type: ['string', 'null'] },
              productName: { type: ['string', 'null'] },
              npkLabel: { type: ['string', 'null'] },
            },
            required: ['manufacturer', 'productLine', 'productName', 'npkLabel'],
            additionalProperties: false,
          },
        },
        required: ['url', 'title', 'category', 'sourceIdentity'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'manufacturer',
    'productLine',
    'productName',
    'productForm',
    'npk',
    'nutrientMatrix',
    'nutrientDeclarationBases',
    'nutrientSourceIndices',
    'declarationComplete',
    'identityMatch',
    'confidence',
    'sources',
  ],
  additionalProperties: false,
} as const

export interface ManufacturerStructuredResearchSourceRecord {
  url: string
  title: string
  category: FertilizerOfficialSourceCandidateCategory
  sourceIdentity?: StructuredResearchSourceIdentityRecord | null
}

export interface ManufacturerStructuredResearchRecord {
  manufacturer: string
  productLine: string | null
  productName: string
  productForm: 'granular' | 'liquid' | 'unknown'
  npk: { nitrogen: number; phosphate: number; potash: number } | null
  nutrientMatrix: Partial<Record<(typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number], number | null>>
  nutrientDeclarationBases: Partial<
    Record<(typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number], string | null>
  >
  nutrientSourceIndices?: Partial<
    Record<(typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number], number | null>
  >
  declarationComplete: boolean
  identityMatch: boolean
  confidence: number
  sources: ManufacturerStructuredResearchSourceRecord[]
}

export interface ManufacturerStructuredResearchProviderResult {
  phaseAResolution: ManufacturerProductResolutionRecord
  webSearchToolCallObserved: boolean
  responseOutput: unknown[]
  generatedSearchQueries: string[]
}

export interface FertilizerManufacturerStructuredResearchProvider {
  runStructuredWebResearch(input: {
    identity: FertilizerEnrichmentIdentity
    queries: string[]
    manufacturerDomain: string | null
    npkLabel?: string | null
    packageSizeLabel?: string | null
    timeoutMs?: number
  }): Promise<ManufacturerStructuredResearchProviderResult | null>
}

export interface ManufacturerStructuredResearchAttemptResult {
  adapterResult: FertilizerSourceAdapterResult | null
  outcome: Exclude<FertilizerManufacturerResearchSearchProviderOutcome, 'not_configured'>
  webSearchToolCallObserved: boolean
  webSearchSourceCount: number
  officialWebSearchSourceCount: number
  structuredResearchResultPresent: boolean
  structuredDeclarationComplete: boolean
  structuredPositiveNutrientCount: number
  identityMatch: boolean
  structuredRecord: ManufacturerStructuredResearchRecord | null
  declarationCompletenessValidation: StructuredDeclarationCompletenessValidation | null
  identityValidation: StructuredResearchIdentityValidation | null
  nutrientProvenanceValidation: StructuredResearchNutrientProvenanceValidation | null
  structuredMatrixCounts: StructuredMatrixCounts | null
  generatedSearchQueries: string[]
  candidateSelection: ManufacturerSearchCandidateSelection | null
  researchDecision: ManufacturerSearchResearchDecision | null
  searchCandidateDiagnostics: ManufacturerSearchCandidateDiagnostic[]
  finalResearchDecision: ManufacturerSearchResearchDecisionDiagnostic | null
  citationVerifiedUrls: string[]
  phaseBDiagnostics: ManufacturerStructuredResearchPhaseBDiagnostics | null
}

export function buildManufacturerStructuredResearchPrompt(input: {
  identity: FertilizerEnrichmentIdentity
  queries: string[]
  manufacturerDomain: string | null
  npkLabel?: string | null
  packageSizeLabel?: string | null
}): string {
  return JSON.stringify({
    searchQueries: input.queries,
    productIdentity: {
      manufacturer: input.identity.manufacturer,
      productLine: input.identity.productLine,
      officialName: input.identity.officialName,
      variant: input.identity.variant,
      npk: input.npkLabel ?? null,
      packageSize: input.packageSizeLabel ?? null,
      manufacturerDomain: input.manufacturerDomain,
    },
    sourcePriority: [
      'official_manufacturer_page',
      'official_manufacturer_pdf_or_datasheet',
      'official_manufacturer_catalog',
      'reputable_retailer_only_as_supplement',
    ],
    instruction:
      'Recherchiere das konkrete Düngerprodukt ausschließlich über das Web-Search-Tool anhand der kanonischen Produktidentität inklusive productLine und NPK. Keine Bilddaten, keine Modell-Erinnerung, keine Schätzungen. Priorität: 1) offizielle Herstellerseite, 2) offizielles Hersteller-PDF/Datenblatt, 3) offizeller Herstellerkatalog, 4) seriöse Händlerseite nur ergänzend. Bei Widersprüchen hat die offizielle Herstellerquelle Vorrang. Lies die vollständige Hersteller-Zusammensetzung/Deklaration aus (NPK plus Zusatz- und Spurennährstoffe). Trage Werte in nutrientMatrix und die exakte Herstellerbasis in nutrientDeclarationBases ein. Für Schwefel: S bleibt S, SO3 bleibt SO3 — keine Umbenennung. Nährstoffwerte dürfen nur aus Quellen übernommen werden, die exakt zur gesuchten Produktvariante gehören; keine Mischung ähnlich benannter Varianten. Trage pro deklariertem Nährstoff den Index der verwendeten Source in nutrientSourceIndices ein. Identity-Felder (manufacturer, productLine, productName, npk) dürfen nicht aus dem Input übernommen werden, wenn die verwendete Quelle sie nicht belegt — trage pro Source sourceIdentity mit den aus der Quelle belegten Identitätsfeldern ein. Jede Deklaration muss einer konkreten Source zugeordnet sein. identityMatch nur true bei Übereinstimmung von manufacturer, productLine, productName und NPK mit der kanonischen Identität und der verwendeten Quelle; ähnliche Produktnamen anderer Produktlinie oder widersprechende NPK sind kein Match. Setze declarationComplete nur true bei vollständiger Zusammensetzungssektion mit mindestens einem Zusatz-/Spurennährstoff außerhalb reiner NPK-Makros und nur wenn die kanonische Quelle dieselbe Variante eindeutig trägt. Bei Unsicherheit keine vollständige Deklaration behaupten. Fehlende Werte als null, keine erfundenen 0-Werte.',
  })
}

function resolveStructuredNutrientDeclarationBasis(
  key: (typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number],
  record: Pick<ManufacturerStructuredResearchRecord, 'nutrientDeclarationBases'>,
): string | null {
  const explicit = record.nutrientDeclarationBases[key]
  if (typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim()
  }

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
      return null
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

export function resolvePrimaryStructuredResearchSourceIndex(
  sources: ManufacturerStructuredResearchSourceRecord[],
  primarySource: ManufacturerStructuredResearchSourceRecord | null,
): number {
  if (!primarySource) {
    return -1
  }

  return sources.findIndex(
    (source) => source.url === primarySource.url && source.title === primarySource.title,
  )
}

function isOfficialStructuredSourceCategory(
  category: FertilizerOfficialSourceCandidateCategory,
): boolean {
  return (
    category === 'official_manufacturer' ||
    category === 'official_brand' ||
    category === 'official_document'
  )
}

function sourceCategoryRank(category: FertilizerOfficialSourceCandidateCategory): number {
  switch (category) {
    case 'official_manufacturer':
    case 'official_brand':
      return 5
    case 'official_document':
      return 4
    case 'verified_catalog':
      return 3
    case 'retailer':
      return 2
    default:
      return 1
  }
}

export function selectPrimaryStructuredResearchSource(
  sources: ManufacturerStructuredResearchSourceRecord[],
): ManufacturerStructuredResearchSourceRecord | null {
  const validated = sources.flatMap((source) => {
    const validation = validateFertilizerManufacturerDocumentSource(source.url)
    if (validation.status === 'invalid') {
      return []
    }

    return [
      {
        ...source,
        url: validation.normalizedUrl,
        category: normalizeSearchCategory(source.category, validation.normalizedUrl),
      },
    ]
  })

  if (validated.length === 0) {
    return null
  }

  return [...validated].sort((left, right) => {
    const rankDiff = sourceCategoryRank(right.category) - sourceCategoryRank(left.category)
    if (rankDiff !== 0) {
      return rankDiff
    }

    const leftDocument = left.url.toLowerCase().includes('.pdf') ? 1 : 0
    const rightDocument = right.url.toLowerCase().includes('.pdf') ? 1 : 0
    return rightDocument - leftDocument
  })[0]!
}

export function countStructuredPositiveNutrients(
  record: Pick<ManufacturerStructuredResearchRecord, 'nutrientMatrix' | 'npk'>,
): number {
  return countStructuredMatrixEntries(record).structuredPositiveEntryCount
}

function hasSecondaryOrTraceNutrientEvidence(
  record: Pick<ManufacturerStructuredResearchRecord, 'nutrientMatrix'>,
): boolean {
  return FERTILIZER_NUTRIENT_MATRIX_KEYS.some((key) => {
    if ((NPK_MATRIX_KEYS as readonly string[]).includes(key)) {
      return false
    }

    const value = record.nutrientMatrix[key]
    return typeof value === 'number'
  })
}

export function syncStructuredNpkIntoNutrientMatrix(
  record: ManufacturerStructuredResearchRecord,
): ManufacturerStructuredResearchRecord {
  if (!record.npk) {
    return record
  }

  const nutrientMatrix = { ...record.nutrientMatrix }
  nutrientMatrix.nitrogen = nutrientMatrix.nitrogen ?? record.npk.nitrogen
  nutrientMatrix.phosphate = nutrientMatrix.phosphate ?? record.npk.phosphate
  nutrientMatrix.potash = nutrientMatrix.potash ?? record.npk.potash

  return {
    ...record,
    nutrientMatrix,
  }
}

export function validateStructuredDeclarationCompleteness(input: {
  record: ManufacturerStructuredResearchRecord
  primarySource: ManufacturerStructuredResearchSourceRecord | null
  identityValidation?: StructuredResearchIdentityValidation
}): StructuredDeclarationCompletenessValidation {
  const modelClaimedComplete = input.record.declarationComplete
  const declarationSectionEvidencePresent = hasSecondaryOrTraceNutrientEvidence(input.record)
  const identityAccepted = input.identityValidation?.identityMatchAccepted ?? input.record.identityMatch

  if (!identityAccepted) {
    return {
      modelClaimedComplete,
      declarationSectionEvidencePresent,
      matrixCompletenessAccepted: false,
      rejectionReason: 'identity_mismatch',
    }
  }

  if (
    !input.primarySource ||
    !isOfficialStructuredSourceCategory(input.primarySource.category)
  ) {
    return {
      modelClaimedComplete,
      declarationSectionEvidencePresent,
      matrixCompletenessAccepted: false,
      rejectionReason: 'no_declaration_section',
    }
  }

  if (!modelClaimedComplete && !declarationSectionEvidencePresent) {
    return {
      modelClaimedComplete,
      declarationSectionEvidencePresent,
      matrixCompletenessAccepted: false,
      rejectionReason: 'insufficient_matrix',
    }
  }

  if (!declarationSectionEvidencePresent) {
    return {
      modelClaimedComplete,
      declarationSectionEvidencePresent,
      matrixCompletenessAccepted: false,
      rejectionReason: 'npk_only',
    }
  }

  if (
    input.record.npk == null ||
    (input.record.productForm !== 'granular' && input.record.productForm !== 'liquid')
  ) {
    return {
      modelClaimedComplete,
      declarationSectionEvidencePresent,
      matrixCompletenessAccepted: false,
      rejectionReason: 'insufficient_matrix',
    }
  }

  return {
    modelClaimedComplete,
    declarationSectionEvidencePresent,
    matrixCompletenessAccepted: true,
    rejectionReason: 'none',
  }
}

export function resolveValidatedStructuredDeclarationComplete(
  validation: StructuredDeclarationCompletenessValidation,
): boolean {
  return validation.matrixCompletenessAccepted
}

export function parseManufacturerStructuredResearchRecord(
  record: Record<string, unknown>,
): ManufacturerStructuredResearchRecord | null {
  if (
    typeof record.manufacturer !== 'string' ||
    typeof record.productName !== 'string' ||
    typeof record.productForm !== 'string' ||
    typeof record.declarationComplete !== 'boolean' ||
    typeof record.identityMatch !== 'boolean' ||
    typeof record.confidence !== 'number' ||
    !record.nutrientMatrix ||
    typeof record.nutrientMatrix !== 'object'
  ) {
    return null
  }

  const nutrientMatrixRecord = record.nutrientMatrix as Record<string, unknown>
  const nutrientBasisRecord =
    record.nutrientDeclarationBases && typeof record.nutrientDeclarationBases === 'object'
      ? (record.nutrientDeclarationBases as Record<string, unknown>)
      : {}
  const nutrientSourceIndexRecord =
    record.nutrientSourceIndices && typeof record.nutrientSourceIndices === 'object'
      ? (record.nutrientSourceIndices as Record<string, unknown>)
      : {}
  const nutrientMatrix: ManufacturerStructuredResearchRecord['nutrientMatrix'] = {}
  const nutrientDeclarationBases: ManufacturerStructuredResearchRecord['nutrientDeclarationBases'] =
    {}
  const nutrientSourceIndices: ManufacturerStructuredResearchRecord['nutrientSourceIndices'] = {}

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    const value = nutrientMatrixRecord[key]
    nutrientMatrix[key] = typeof value === 'number' ? value : null
    const basis = nutrientBasisRecord[key]
    nutrientDeclarationBases[key] = typeof basis === 'string' ? basis.trim() : null
    const sourceIndex = nutrientSourceIndexRecord[key]
    nutrientSourceIndices[key] = typeof sourceIndex === 'number' ? sourceIndex : null
  }

  let npk: ManufacturerStructuredResearchRecord['npk'] = null
  if (record.npk && typeof record.npk === 'object') {
    const npkRecord = record.npk as Record<string, unknown>
    if (
      typeof npkRecord.nitrogen === 'number' &&
      typeof npkRecord.phosphate === 'number' &&
      typeof npkRecord.potash === 'number'
    ) {
      npk = {
        nitrogen: npkRecord.nitrogen,
        phosphate: npkRecord.phosphate,
        potash: npkRecord.potash,
      }
    }
  }

  const sources = Array.isArray(record.sources)
    ? record.sources.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') {
          return []
        }

        const item = entry as Record<string, unknown>
        if (typeof item.url !== 'string' || typeof item.title !== 'string') {
          return []
        }

        const sourceIdentityRecord =
          item.sourceIdentity && typeof item.sourceIdentity === 'object'
            ? (item.sourceIdentity as Record<string, unknown>)
            : null
        const sourceIdentity = sourceIdentityRecord
          ? {
              manufacturer:
                typeof sourceIdentityRecord.manufacturer === 'string'
                  ? sourceIdentityRecord.manufacturer.trim()
                  : null,
              productLine:
                typeof sourceIdentityRecord.productLine === 'string'
                  ? sourceIdentityRecord.productLine.trim()
                  : null,
              productName:
                typeof sourceIdentityRecord.productName === 'string'
                  ? sourceIdentityRecord.productName.trim()
                  : null,
              npkLabel:
                typeof sourceIdentityRecord.npkLabel === 'string'
                  ? sourceIdentityRecord.npkLabel.trim()
                  : null,
            }
          : null

        return [
          {
            url: item.url,
            title: item.title.trim() || item.url,
            category: normalizeSearchCategory(String(item.category ?? 'other_web'), item.url),
            sourceIdentity,
          },
        ]
      })
    : []

  const productForm =
    record.productForm === 'granular' || record.productForm === 'liquid'
      ? record.productForm
      : 'unknown'

  return syncStructuredNpkIntoNutrientMatrix({
    manufacturer: record.manufacturer.trim(),
    productLine: typeof record.productLine === 'string' ? record.productLine.trim() : null,
    productName: record.productName.trim(),
    productForm,
    npk,
    nutrientMatrix,
    nutrientDeclarationBases,
    nutrientSourceIndices,
    declarationComplete: record.declarationComplete,
    identityMatch: record.identityMatch,
    confidence: record.confidence,
    sources,
  })
}

export function mapStructuredResearchToAdapterResult(input: {
  record: ManufacturerStructuredResearchRecord
  identity: FertilizerEnrichmentIdentity
  retrievedAt: string
  npkLabel?: string | null
  declarationCompletenessValidation?: StructuredDeclarationCompletenessValidation
  identityValidation?: StructuredResearchIdentityValidation
  nutrientProvenanceValidation?: StructuredResearchNutrientProvenanceValidation
  selection: ManufacturerSearchCandidateSelection
}): FertilizerSourceAdapterResult | null {
  const canonicalCandidate = input.selection.canonicalCandidate
  const primarySource = canonicalCandidate
    ? candidateToPrimarySourceRecord({ candidate: canonicalCandidate })
    : null
  const primarySourceIndex = primarySource
    ? input.record.sources.findIndex((source) => {
        const normalized = validateFertilizerManufacturerDocumentSource(source.url)
        return (
          normalized.status === 'valid' &&
          normalized.normalizedUrl === canonicalCandidate?.candidateId &&
          isModelSourceCitationVerified({
            url: source.url,
            candidates: input.selection.candidates,
          })
        )
      })
    : -1
  const identityValidation =
    input.identityValidation ??
    validateStructuredResearchIdentityMatch({
      record: input.record,
      identity: input.identity,
      npkLabel: input.npkLabel,
      primarySource,
      selection: input.selection,
    })

  if (!primarySource || !identityValidation.identityMatchAccepted) {
    return null
  }

  const nutrientProvenanceValidation =
    input.nutrientProvenanceValidation ??
    validateStructuredResearchNutrientProvenance({
      record: input.record,
      identity: input.identity,
      npkLabel: input.npkLabel,
      primarySource,
      primarySourceIndex: primarySourceIndex >= 0 ? primarySourceIndex : 0,
      recordProductLineMatchesExpected: identityValidation.structuredProductLineMatch,
      recordNpkCompatible: identityValidation.structuredNpkMatch,
      selection: input.selection,
    })

  if (!nutrientProvenanceValidation.accepted) {
    return null
  }

  const provenanceFilteredRecord = filterStructuredResearchRecordNutrientsByProvenance({
    record: input.record,
    acceptedNutrientKeys: nutrientProvenanceValidation.acceptedNutrientKeys,
  })

  const validation =
    input.declarationCompletenessValidation ??
    validateStructuredDeclarationCompleteness({
      record: provenanceFilteredRecord,
      primarySource,
      identityValidation,
    })
  const declarationComplete = resolveValidatedStructuredDeclarationComplete(validation)

  const sourceId = `manufacturer-web-search:${primarySource.url}`
  const extractedNutrients = FERTILIZER_NUTRIENT_MATRIX_KEYS.flatMap((key) => {
    const value = provenanceFilteredRecord.nutrientMatrix[key]
    if (typeof value !== 'number') {
      return []
    }

    if (!declarationComplete && value <= 0) {
      return []
    }

    const declarationBasis = resolveStructuredNutrientDeclarationBasis(key, provenanceFilteredRecord)

    return [
      {
        key,
        value,
        declarationBasis,
        unit: '%' as const,
      },
    ]
  })

  const status =
    declarationComplete &&
    isOfficialStructuredSourceCategory(primarySource.category) &&
    input.record.npk != null &&
    (input.record.productForm === 'granular' || input.record.productForm === 'liquid')
      ? 'success'
      : 'partial'

  const sourceType = primarySource.url.toLowerCase().includes('.pdf')
    ? 'pdf_document'
    : 'web_search'

  const canonicalVariant =
    input.identity.variant?.trim() || input.record.productName.trim() || null

  return {
    adapterType: 'manufacturer_product_page',
    status,
    sourceId,
    sourceType,
    sourceCategory: 'official_document',
    sourceUrl: primarySource.url,
    sourceTitle: primarySource.title,
    retrievedAt: input.retrievedAt,
    sourceVersion: null,
    productVariantReference: canonicalVariant,
    extraction: {
      extractedIdentity: {
        manufacturer: input.record.manufacturer,
        officialName: input.record.productName,
        variant: canonicalVariant,
      },
      extractedProductForm:
        input.record.productForm === 'granular' || input.record.productForm === 'liquid'
          ? input.record.productForm
          : 'unknown',
      extractedNpk: input.record.npk
        ? {
            nitrogen: input.record.npk.nitrogen,
            phosphate: input.record.npk.phosphate,
            potash: input.record.npk.potash,
            declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
            rawLabel: `${input.record.npk.nitrogen}-${input.record.npk.phosphate}-${input.record.npk.potash}`,
          }
        : undefined,
      extractedNutrients,
      coverageMetadata: {
        fieldsCovered: [
          ...(input.record.npk ? ['npk'] : []),
          ...extractedNutrients.map((nutrient) => nutrient.key),
        ],
        nutrientSectionLocated: extractedNutrients.length > 0 || input.record.npk != null,
        nutrientSectionFullyCaptured: declarationComplete,
        variantMatched: identityValidation.identityMatchAccepted,
        productScopeConfirmed: identityValidation.identityMatchAccepted,
        coverageNotes: declarationComplete
          ? null
          : validation.rejectionReason === 'npk_only'
            ? 'structured_research_npk_only'
            : 'structured_research_incomplete',
      },
      evidence: [
        {
          evidenceId: `${sourceId}:structured_research`,
          excerpt: 'Structured manufacturer web research extraction',
          fieldPath: 'structured_research',
        },
      ],
    },
  }
}

export function observeWebSearchToolCalls(response: { output?: Array<{ type?: string }> }): boolean {
  return (response.output ?? []).some(
    (item) => typeof item.type === 'string' && item.type.includes('web_search'),
  )
}

function buildSearchCandidateDiagnostics(
  selection: ManufacturerSearchCandidateSelection,
  enrichedCandidates: readonly EnrichedManufacturerSearchCandidate[] = [],
): ManufacturerSearchCandidateDiagnostic[] {
  const enrichedById = new Map(enrichedCandidates.map((candidate) => [candidate.candidateId, candidate]))

  return selection.candidates.map((candidate) => {
    const enriched = enrichedById.get(candidate.candidateId)
    return {
      candidateId: candidate.candidateId,
      url: candidate.url,
      title: candidate.title,
      evidenceKinds: candidate.trustedEvidenceKinds,
      officialDomainMatch: candidate.officialDomainMatch,
      manufacturerEvidence: candidate.manufacturerEvidence,
      productNameEvidence: candidate.productNameEvidence,
      productLineEvidence: candidate.productLineEvidence,
      npkEvidence: candidate.npkEvidence,
      identityScore: candidate.identityScore,
      hardRejected: candidate.hardRejected,
      rejectionReason: candidate.rejectionReason,
      evidenceOrigin: enriched?.evidenceOrigin ?? null,
      fetchAttempted: enriched?.fetchAttempted ?? false,
      fetchOutcome: enriched?.fetchOutcome ?? 'not_needed',
    }
  })
}

function buildPrePhaseBResearchDecision(input: {
  selection: ManufacturerSearchCandidateSelection
  phaseAResolution: ManufacturerProductResolutionRecord
  identity: FertilizerEnrichmentIdentity
}): ManufacturerSearchResearchDecision {
  return buildManufacturerSearchResearchDecision({
    selection: input.selection,
    nutrientBindings: buildManufacturerSearchNutrientBindings({
      record: {
        nutrientMatrix: {},
        sources: input.phaseAResolution.sources.map((source) => ({ url: source.url })),
      },
      selection: input.selection,
    }),
    candidateAmbiguityOverride: input.identity.hasIdentityAmbiguity ? false : undefined,
  })
}

function buildPhaseBDiagnostics(input: {
  canonicalBodyFetched: boolean
  canonicalBodyFetchOutcome: string
  record: ManufacturerStructuredResearchRecord
  extractedPositiveNutrientCount: number
  canonicalCandidateId: string | null
  nutrientBindings: ReturnType<typeof buildManufacturerSearchNutrientBindings>
  adapterResult: FertilizerSourceAdapterResult | null
  declarationCompletenessAccepted: boolean
}): ManufacturerStructuredResearchPhaseBDiagnostics {
  const adapterCounts = countAdapterMatrixEntries(input.adapterResult)
  const extractedNutrientCount = FERTILIZER_NUTRIENT_MATRIX_KEYS.filter(
    (key) => typeof input.record.nutrientMatrix[key] === 'number',
  ).length

  return {
    canonicalBodyFetched: input.canonicalBodyFetched,
    canonicalBodyFetchOutcome: input.canonicalBodyFetchOutcome,
    extractedNutrientCount,
    extractedPositiveNutrientCount: input.extractedPositiveNutrientCount,
    canonicalDeclarationSourceId: input.canonicalCandidateId,
    nutrientSourceBindingCount: input.nutrientBindings.filter((binding) => binding.accepted).length,
    adapterMatrixEntryCount: adapterCounts.adapterMatrixEntryCount,
    adapterPositiveEntryCount: adapterCounts.adapterPositiveEntryCount,
    phaseBAdapterAccepted:
      input.adapterResult?.status === 'success' && input.declarationCompletenessAccepted,
    phaseBAdapterRejectedReason:
      input.adapterResult?.status === 'success' && input.declarationCompletenessAccepted
        ? null
        : input.adapterResult == null
          ? 'adapter_result_missing'
          : input.adapterResult.status !== 'success'
            ? `adapter_status_${input.adapterResult.status}`
            : 'declaration_incomplete',
  }
}
function buildFinalResearchDecisionDiagnostic(input: {
  selection: ManufacturerSearchCandidateSelection
  researchDecision: ManufacturerSearchResearchDecision
}): ManufacturerSearchResearchDecisionDiagnostic {
  return {
    accepted: input.researchDecision.accepted,
    reason: input.researchDecision.reason,
    canonicalSource: input.selection.canonicalCandidate
      ? {
          candidateId: input.selection.canonicalCandidate.candidateId,
          url: input.selection.canonicalCandidate.url,
          title: input.selection.canonicalCandidate.title,
          whySelected: input.selection.canonicalSelectionReason,
        }
      : null,
    nutrientSourceBindings: input.researchDecision.nutrientSourceBindings.map((binding) => ({
      nutrientKey: binding.nutrientKey,
      candidateId: binding.candidateId,
      accepted: binding.accepted,
    })),
    candidateAmbiguity: input.selection.candidateAmbiguity,
    verifiedVariantCount: input.selection.verifiedVariantCount,
  }
}

async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: string,
): Promise<T> {
  if (timeoutMs <= 0) {
    throw new Error(timeoutError)
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

export function createOpenAiManufacturerStructuredResearchProvider(
  openai: OpenAI,
  options: { model?: string } = {},
): FertilizerManufacturerStructuredResearchProvider {
  const model = options.model ?? PRODUCT_RECOGNIZE_IMAGE_MODEL

  return {
    runStructuredWebResearch: async (input) => {
      const response = await openai.responses.create({
        model,
        tools: [{ type: 'web_search' }],
        include: ['web_search_call.action.sources'],
        input: [
          {
            role: 'system',
            content:
              'Du recherchierst kanonische Hersteller-Produktquellen für Dünger. Phase A: nur Produktidentität und Quellen finden. Keine Nährstoffmatrix, keine Einzelwerte für sulfur/magnesium/iron/calcium oder andere Nährstoffe extrahieren.',
          },
          {
            role: 'user',
            content: buildManufacturerProductResolutionPrompt({
              identity: input.identity,
              queries: input.queries,
              manufacturerDomain: input.manufacturerDomain,
              npkLabel: input.npkLabel,
              packageSizeLabel: input.packageSizeLabel,
            }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'manufacturer_product_resolution',
            strict: true,
            schema: manufacturerProductResolutionSchema,
          },
        },
      })

      const outputText = response.output_text
      if (!outputText?.trim()) {
        return null
      }

      const phaseAResolution = parseManufacturerProductResolutionRecord(
        JSON.parse(outputText) as Record<string, unknown>,
      )
      if (!phaseAResolution) {
        return null
      }

      return {
        phaseAResolution,
        webSearchToolCallObserved: observeWebSearchToolCalls(response),
        responseOutput: response.output ?? [],
        generatedSearchQueries: input.queries,
      }
    },
  }
}

export function createConfiguredManufacturerStructuredResearchProvider(
  openAiApiKey: string | null | undefined,
): FertilizerManufacturerStructuredResearchProvider | null {
  const apiKey = openAiApiKey?.trim()
  if (!apiKey) {
    return null
  }

  return createOpenAiManufacturerStructuredResearchProvider(new OpenAI({ apiKey }))
}

export async function runManufacturerStructuredResearchAttempt(input: {
  structuredResearchProvider: FertilizerManufacturerStructuredResearchProvider | null | undefined
  fetchProvider: FertilizerManufacturerResearchFetchProvider
  identity: FertilizerEnrichmentIdentity
  queries: string[]
  manufacturerDomain: string | null
  npkLabel?: string | null
  packageSizeLabel?: string | null
  timeoutMs?: number
  retrievedAt?: string
}): Promise<ManufacturerStructuredResearchAttemptResult> {
  const emptyResult = (
    outcome: Exclude<FertilizerManufacturerResearchSearchProviderOutcome, 'not_configured'>,
  ): ManufacturerStructuredResearchAttemptResult => ({
    adapterResult: null,
    outcome,
    webSearchToolCallObserved: false,
    webSearchSourceCount: 0,
    officialWebSearchSourceCount: 0,
    structuredResearchResultPresent: false,
    structuredDeclarationComplete: false,
    structuredPositiveNutrientCount: 0,
    identityMatch: false,
    structuredRecord: null,
    declarationCompletenessValidation: null,
    identityValidation: null,
    nutrientProvenanceValidation: null,
    structuredMatrixCounts: null,
    generatedSearchQueries: input.queries,
    candidateSelection: null,
    researchDecision: null,
    searchCandidateDiagnostics: [],
    finalResearchDecision: null,
    citationVerifiedUrls: [],
    phaseBDiagnostics: null,
  })

  if (!input.structuredResearchProvider) {
    return emptyResult('error')
  }

  const retrievedAt = input.retrievedAt ?? new Date().toISOString()

  try {
    const providerResult = await runWithTimeout(
      input.structuredResearchProvider.runStructuredWebResearch({
        identity: input.identity,
        queries: input.queries,
        manufacturerDomain: input.manufacturerDomain,
        npkLabel: input.npkLabel,
        packageSizeLabel: input.packageSizeLabel,
        timeoutMs: input.timeoutMs,
      }),
      input.timeoutMs ?? MANUFACTURER_RESEARCH_STRUCTURED_BUDGET_MS,
      'manufacturer_research_structured_timeout',
    )

    if (!providerResult) {
      return emptyResult('no_results')
    }

    const { phaseAResolution, webSearchToolCallObserved, generatedSearchQueries } = providerResult
    const rawCandidates = extractTrustedWebSearchCandidatesFromResponseOutput({
      output: providerResult.responseOutput,
      manufacturerDomain: input.manufacturerDomain,
    })
    const enrichedCandidates = await enrichManufacturerSearchCandidatesWithFetchedEvidence({
      candidates: rawCandidates,
      identity: input.identity,
      npkLabel: input.npkLabel,
      fetchProvider: input.fetchProvider,
      timeoutMs: input.timeoutMs,
    })
    const candidateSelection = selectCanonicalManufacturerSearchCandidate({
      candidates: enrichedCandidates,
      identity: input.identity,
      npkLabel: input.npkLabel,
    })
    const webSearchSourceCount = enrichedCandidates.length
    const officialWebSearchSourceCount = enrichedCandidates.filter(
      (candidate) => candidate.officialDomainMatch,
    ).length

    let researchDecision = buildPrePhaseBResearchDecision({
      selection: candidateSelection,
      phaseAResolution,
      identity: input.identity,
    })

    const canonicalCandidate = candidateSelection.canonicalCandidate
    if (!canonicalCandidate) {
      return {
        ...emptyResult('no_results'),
        webSearchToolCallObserved,
        webSearchSourceCount,
        officialWebSearchSourceCount,
        structuredResearchResultPresent: true,
        generatedSearchQueries,
        candidateSelection,
        researchDecision,
        searchCandidateDiagnostics: buildSearchCandidateDiagnostics(candidateSelection, enrichedCandidates),
        finalResearchDecision: buildFinalResearchDecisionDiagnostic({
          selection: candidateSelection,
          researchDecision,
        }),
        citationVerifiedUrls: candidateSelection.citationVerifiedUrls,
      }
    }

    const enrichedCanonical = enrichedCandidates.find(
      (candidate) => candidate.candidateId === canonicalCandidate.candidateId,
    )
    let canonicalSourceText = enrichedCanonical?.fetchedBodyText ?? null
    let canonicalBodyFetched = Boolean(canonicalSourceText?.trim())
    let canonicalBodyFetchOutcome = canonicalBodyFetched
      ? enrichedCanonical?.fetchOutcome ?? 'enriched_cache'
      : 'not_fetched'
    if (!canonicalSourceText?.trim()) {
      const fetchResult = await input.fetchProvider.fetchSource(canonicalCandidate.url, {
        timeoutMs: input.timeoutMs,
      })
      canonicalBodyFetched = fetchResult.ok
      canonicalBodyFetchOutcome = fetchResult.ok
        ? 'fetched'
        : fetchResult.errorCode ?? 'fetch_failed'
      canonicalSourceText = fetchResult.ok ? fetchResult.text ?? null : null
    }

    if (!canonicalSourceText?.trim()) {
      return {
        ...emptyResult('no_results'),
        webSearchToolCallObserved,
        webSearchSourceCount,
        officialWebSearchSourceCount,
        structuredResearchResultPresent: true,
        generatedSearchQueries,
        candidateSelection,
        researchDecision,
        searchCandidateDiagnostics: buildSearchCandidateDiagnostics(candidateSelection, enrichedCandidates),
        finalResearchDecision: buildFinalResearchDecisionDiagnostic({
          selection: candidateSelection,
          researchDecision,
        }),
        citationVerifiedUrls: candidateSelection.citationVerifiedUrls,
      }
    }

    const extraction = extractManufacturerDeclarationFromCanonicalSource({
      sourceText: canonicalSourceText,
      sourceUrl: canonicalCandidate.url,
      sourceTitle: canonicalCandidate.title,
      identity: input.identity,
      npkLabel: input.npkLabel,
    })

    if (
      !extraction ||
      !phaseBExtractionUsesOnlyCanonicalSource({
        record: extraction.record,
        canonicalUrl: canonicalCandidate.url,
      })
    ) {
      return {
        ...emptyResult('no_results'),
        webSearchToolCallObserved,
        webSearchSourceCount,
        officialWebSearchSourceCount,
        structuredResearchResultPresent: true,
        generatedSearchQueries,
        candidateSelection,
        researchDecision,
        searchCandidateDiagnostics: buildSearchCandidateDiagnostics(candidateSelection, enrichedCandidates),
        finalResearchDecision: buildFinalResearchDecisionDiagnostic({
          selection: candidateSelection,
          researchDecision,
        }),
        citationVerifiedUrls: candidateSelection.citationVerifiedUrls,
      }
    }

    const record = syncStructuredNpkIntoNutrientMatrix(extraction.record)
    const primarySource = extraction.primarySource
    const primarySourceIndex = 0
    const identityValidation = validateStructuredResearchIdentityMatch({
      record,
      identity: input.identity,
      npkLabel: input.npkLabel,
      primarySource,
      selection: candidateSelection,
    })
    const nutrientProvenanceValidation = validateStructuredResearchNutrientProvenance({
      record,
      identity: input.identity,
      npkLabel: input.npkLabel,
      primarySource,
      primarySourceIndex,
      recordProductLineMatchesExpected: identityValidation.structuredProductLineMatch,
      recordNpkCompatible: identityValidation.structuredNpkMatch,
      selection: candidateSelection,
      canonicalSourceText,
    })
    const declarationCompletenessValidation = validateStructuredDeclarationCompleteness({
      record,
      primarySource,
      identityValidation,
    })
    const structuredDeclarationComplete =
      resolveValidatedStructuredDeclarationComplete(declarationCompletenessValidation)
    const structuredMatrixCounts = countStructuredMatrixEntries(record)

    const adapterResult = mapStructuredResearchToAdapterResult({
      record: filterStructuredResearchRecordNutrientsByProvenance({
        record,
        acceptedNutrientKeys: nutrientProvenanceValidation.acceptedNutrientKeys,
      }),
      identity: input.identity,
      retrievedAt,
      npkLabel: input.npkLabel,
      declarationCompletenessValidation,
      identityValidation,
      nutrientProvenanceValidation,
      selection: candidateSelection,
    })
    const phaseBNutrientBindings = buildManufacturerSearchNutrientBindings({
      record,
      selection: candidateSelection,
    })
    researchDecision = buildManufacturerSearchResearchDecision({
      selection: candidateSelection,
      nutrientBindings: phaseBNutrientBindings,
      candidateAmbiguityOverride: input.identity.hasIdentityAmbiguity ? false : undefined,
    })
    const structuredPositiveNutrientCount = structuredMatrixCounts.structuredPositiveEntryCount
    const phaseBDiagnostics = buildPhaseBDiagnostics({
      canonicalBodyFetched,
      canonicalBodyFetchOutcome,
      record,
      extractedPositiveNutrientCount: structuredPositiveNutrientCount,
      canonicalCandidateId: canonicalCandidate.candidateId,
      nutrientBindings: phaseBNutrientBindings,
      adapterResult,
      declarationCompletenessAccepted: structuredDeclarationComplete,
    })
    const searchCandidateDiagnostics = buildSearchCandidateDiagnostics(
      candidateSelection,
      enrichedCandidates,
    )
    const finalResearchDecision = buildFinalResearchDecisionDiagnostic({
      selection: candidateSelection,
      researchDecision,
    })

    return {
      adapterResult,
      outcome: adapterResult ? 'success' : 'no_results',
      webSearchToolCallObserved,
      webSearchSourceCount,
      officialWebSearchSourceCount,
      structuredResearchResultPresent: true,
      structuredDeclarationComplete,
      structuredPositiveNutrientCount,
      identityMatch: identityValidation.identityMatchAccepted,
      structuredRecord: record,
      declarationCompletenessValidation,
      identityValidation,
      nutrientProvenanceValidation,
      structuredMatrixCounts,
      generatedSearchQueries,
      candidateSelection,
      researchDecision,
      searchCandidateDiagnostics,
      finalResearchDecision,
      citationVerifiedUrls: candidateSelection.citationVerifiedUrls,
      phaseBDiagnostics,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'manufacturer_research_structured_error'
    return emptyResult(message.includes('timeout') ? 'timeout' : 'error')
  }
}

export function buildStructuredResearchProviderResultFromRecord(input: {
  record: ManufacturerStructuredResearchRecord
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  queries?: string[]
  manufacturerDomain?: string | null
}): ManufacturerStructuredResearchProviderResult {
  const source = input.record.sources[0]
  const excerpts = [
    input.identity.productLine,
    input.identity.officialName,
    input.npkLabel ?? input.identity.variant,
    source?.title,
  ]
    .filter(Boolean)
    .join(' ')
  const text = excerpts
  const annotations = source
    ? [
        {
          type: 'url_citation',
          url: source.url,
          title: source.title,
          start_index: 0,
          end_index: text.length,
        },
      ]
    : []

  return {
    phaseAResolution: {
      manufacturer: input.record.manufacturer,
      productLine: input.record.productLine,
      productName: input.record.productName,
      productForm: input.record.productForm,
      npk: input.record.npk,
      identityMatch: input.record.identityMatch,
      confidence: input.record.confidence,
      sources: input.record.sources,
    },
    webSearchToolCallObserved: true,
    responseOutput: [
      {
        type: 'web_search_call',
        action: {
          type: 'search',
          sources: input.record.sources.map((entry) => ({ type: 'url', url: entry.url })),
        },
      },
      {
        type: 'message',
        content: [{ type: 'output_text', text, annotations }],
      },
    ],
    generatedSearchQueries: input.queries ?? [],
  }
}
