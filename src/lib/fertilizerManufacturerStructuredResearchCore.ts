import OpenAI from 'openai'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type { FertilizerSourceAdapterResult } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerManufacturerResearchSearchProviderOutcome } from '../types/fertilizerManufacturerResearchSearch'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerReadiness'
import type { FertilizerOfficialSourceCandidateCategory } from './fertilizerManufacturerResearchCore'
import { validateFertilizerManufacturerDocumentSource } from './fertilizerManufacturerDocumentSourceValidatorCore'
import {
  countOfficialSearchResults,
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

export const MANUFACTURER_RESEARCH_STRUCTURED_BUDGET_MS = 16_000

const NPK_MATRIX_KEYS = ['nitrogen', 'phosphate', 'potash'] as const

const nutrientMatrixSchemaProperties = Object.fromEntries(
  FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [key, { type: ['number', 'null'] }]),
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
        },
        required: ['url', 'title', 'category'],
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
}

export interface ManufacturerStructuredResearchRecord {
  manufacturer: string
  productLine: string | null
  productName: string
  productForm: 'granular' | 'liquid' | 'unknown'
  npk: { nitrogen: number; phosphate: number; potash: number } | null
  nutrientMatrix: Partial<Record<(typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number], number | null>>
  declarationComplete: boolean
  identityMatch: boolean
  confidence: number
  sources: ManufacturerStructuredResearchSourceRecord[]
}

export interface ManufacturerStructuredResearchProviderResult {
  record: ManufacturerStructuredResearchRecord
  webSearchToolCallObserved: boolean
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
  structuredMatrixCounts: StructuredMatrixCounts | null
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
      'Recherchiere das konkrete Düngerprodukt ausschließlich über das Web-Search-Tool anhand der kanonischen Produktidentität. Keine Bilddaten, keine Modell-Erinnerung, keine Schätzungen. Priorität: 1) offizielle Herstellerseite, 2) offizielles Hersteller-PDF/Datenblatt, 3) offizieller Herstellerkatalog, 4) seriöse Händlerseite nur ergänzend. Bei Widersprüchen hat die offizielle Herstellerquelle Vorrang. Lies die vollständige Hersteller-Zusammensetzung/Deklaration aus (NPK plus Zusatz- und Spurennährstoffe wie Magnesium, Calcium, Schwefel, Eisen, Mangan, Kupfer, Zink, Bor, Molybdän). Trage alle explizit deklarierten Werte in nutrientMatrix mit den kanonischen Schlüsseln ein (nitrogen, phosphate, potash, magnesium, calcium, sulfur, iron, manganese, copper, zinc, boron, molybdenum; keine Abkürzungen wie Fe oder S). Mappe Oxidformen auf unsere Schlüssel: K2O→potash, P2O5→phosphate, MgO→magnesium, CaO→calcium, SO3→sulfur. Setze declarationComplete nur true, wenn die offizielle Quelle eine vollständige Zusammensetzungs-/Deklarationssektion enthält und du mindestens einen Zusatz- oder Spurennährstoff außerhalb reiner NPK-Makros extrahiert hast oder die Quelle ausdrücklich alle Nährstoffe vollständig auflistet. Eine reine NPK-Zeile ohne Zusammensetzung ist nicht vollständig. Übernimm Nährstoffwerte nur, wenn sie in der Quelle ausdrücklich deklariert sind; explizit deklarierte 0-Werte als 0 setzen; fehlende Werte als null belassen, keine erfundenen 0-Werte für nicht deklarierte Nährstoffe. NPK nur übernehmen, wenn klar zur identifizierten Variante gehörig.',
  })
}

function defaultStructuredNutrientDeclarationBasis(
  key: (typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number],
): string {
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
}): StructuredDeclarationCompletenessValidation {
  const modelClaimedComplete = input.record.declarationComplete
  const declarationSectionEvidencePresent = hasSecondaryOrTraceNutrientEvidence(input.record)

  if (!input.record.identityMatch) {
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

  if (!modelClaimedComplete) {
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
  const nutrientMatrix: ManufacturerStructuredResearchRecord['nutrientMatrix'] = {}

  for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
    const value = nutrientMatrixRecord[key]
    nutrientMatrix[key] = typeof value === 'number' ? value : null
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

        return [
          {
            url: item.url,
            title: item.title.trim() || item.url,
            category: normalizeSearchCategory(String(item.category ?? 'other_web'), item.url),
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
  declarationCompletenessValidation?: StructuredDeclarationCompletenessValidation
}): FertilizerSourceAdapterResult | null {
  const primarySource = selectPrimaryStructuredResearchSource(input.record.sources)
  if (!primarySource || !input.record.identityMatch) {
    return null
  }

  const validation =
    input.declarationCompletenessValidation ??
    validateStructuredDeclarationCompleteness({
      record: input.record,
      primarySource,
    })
  const declarationComplete = resolveValidatedStructuredDeclarationComplete(validation)

  const sourceId = `manufacturer-web-search:${primarySource.url}`
  const extractedNutrients = FERTILIZER_NUTRIENT_MATRIX_KEYS.flatMap((key) => {
    const value = input.record.nutrientMatrix[key]
    if (typeof value !== 'number') {
      return []
    }

    if (!declarationComplete && value <= 0) {
      return []
    }

    return [
      {
        key,
        value,
        declarationBasis: defaultStructuredNutrientDeclarationBasis(key),
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
        variantMatched: input.record.identityMatch,
        productScopeConfirmed: input.record.identityMatch,
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
        input: [
          {
            role: 'system',
            content:
              'Du recherchierst kanonische Herstellerinformationen für Düngerprodukte. Nutze das Web-Search-Tool und gib ein strukturiertes, quellenbasiertes Ergebnis zurück. Extrahiere die vollständige offizielle Zusammensetzung inklusive Zusatz- und Spurennährstoffe in die kanonischen nutrientMatrix-Schlüssel. Keine Erfindungen, keine reinen NPK-Schätzungen ohne Zusammensetzungssektion.',
          },
          {
            role: 'user',
            content: buildManufacturerStructuredResearchPrompt({
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
            name: 'manufacturer_structured_research',
            strict: true,
            schema: manufacturerStructuredResearchSchema,
          },
        },
      })

      const outputText = response.output_text
      if (!outputText?.trim()) {
        return null
      }

      const record = parseManufacturerStructuredResearchRecord(
        JSON.parse(outputText) as Record<string, unknown>,
      )
      if (!record) {
        return null
      }

      return {
        record,
        webSearchToolCallObserved: observeWebSearchToolCalls(response),
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
    structuredMatrixCounts: null,
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

    const { record, webSearchToolCallObserved } = providerResult
    const webSearchSourceCount = record.sources.length
    const officialWebSearchSourceCount = countOfficialSearchResults(
      record.sources.map((source) => ({
        url: source.url,
        title: source.title,
        category: source.category,
        priority: sourceCategoryRank(source.category),
      })),
    )

    const primarySource = selectPrimaryStructuredResearchSource(record.sources)
    const declarationCompletenessValidation = validateStructuredDeclarationCompleteness({
      record,
      primarySource,
    })
    const structuredDeclarationComplete =
      resolveValidatedStructuredDeclarationComplete(declarationCompletenessValidation)
    const structuredMatrixCounts = countStructuredMatrixEntries(record)

    const adapterResult = mapStructuredResearchToAdapterResult({
      record,
      identity: input.identity,
      retrievedAt,
      declarationCompletenessValidation,
    })
    const structuredPositiveNutrientCount = structuredMatrixCounts.structuredPositiveEntryCount

    return {
      adapterResult,
      outcome: adapterResult ? 'success' : 'no_results',
      webSearchToolCallObserved,
      webSearchSourceCount,
      officialWebSearchSourceCount,
      structuredResearchResultPresent: true,
      structuredDeclarationComplete,
      structuredPositiveNutrientCount,
      identityMatch: record.identityMatch,
      structuredRecord: record,
      declarationCompletenessValidation,
      structuredMatrixCounts,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'manufacturer_research_structured_error'
    return emptyResult(message.includes('timeout') ? 'timeout' : 'error')
  }
}
