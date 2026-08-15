import OpenAI from 'openai'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type { FertilizerSourceAdapterResult } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerManufacturerResearchDiagnostics } from '../types/fertilizerManufacturerResearchDiagnostics'
import type {
  ManufacturerResearchV2CaptureContext,
  ManufacturerResearchV2GateDiagnostics,
  ManufacturerResearchV2Result,
  ManufacturerResearchV2ShadowComparison,
  ManufacturerResearchV2ShadowDiagnostics,
  ManufacturerResearchV2ShadowFinalDecision,
} from '../types/fertilizerManufacturerResearchV2'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerReadiness'
import type { FertilizerNutrientMatrixKey } from '../types/fertilizerReadiness'
import { validateFertilizerManufacturerDocumentSource } from './fertilizerManufacturerDocumentSourceValidatorCore'
import type { FertilizerManufacturerResearchFetchProvider } from './fertilizerManufacturerResearchCore'
import { PRODUCT_RECOGNIZE_IMAGE_MODEL } from './productRecognizeImageCore'

export const MANUFACTURER_RESEARCH_V2_SHADOW_ENV = 'MANUFACTURER_RESEARCH_V2_SHADOW'

export const manufacturerResearchV2JsonSchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['resolved', 'ambiguous', 'not_found'] },
    product: {
      type: 'object',
      properties: {
        manufacturer: { type: 'string' },
        productLine: { type: ['string', 'null'] },
        productName: { type: 'string' },
        variant: { type: ['string', 'null'] },
        form: { type: 'string', enum: ['granular', 'liquid', 'unknown'] },
        npk: {
          type: 'object',
          properties: {
            n: { type: ['number', 'null'] },
            p2o5: { type: ['number', 'null'] },
            k2o: { type: ['number', 'null'] },
            rawLabel: { type: ['string', 'null'] },
          },
          required: ['n', 'p2o5', 'k2o', 'rawLabel'],
          additionalProperties: false,
        },
      },
      required: ['manufacturer', 'productLine', 'productName', 'variant', 'form', 'npk'],
      additionalProperties: false,
    },
    declaration: {
      type: 'object',
      properties: {
        nutrients: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nutrientKey: { type: 'string' },
              value: { type: 'number' },
              unit: { type: 'string' },
              declarationBasis: { type: ['string', 'null'] },
            },
            required: ['nutrientKey', 'value', 'unit', 'declarationBasis'],
            additionalProperties: false,
          },
        },
      },
      required: ['nutrients'],
      additionalProperties: false,
    },
    declarationSource: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            url: { type: 'string' },
            title: { type: ['string', 'null'] },
            sourceType: {
              type: 'string',
              enum: ['manufacturer_web_page', 'manufacturer_pdf', 'manufacturer_document', 'other'],
            },
          },
          required: ['url', 'title', 'sourceType'],
          additionalProperties: false,
        },
      ],
    },
    supportingSources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          title: { type: ['string', 'null'] },
        },
        required: ['url', 'title'],
        additionalProperties: false,
      },
    },
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          manufacturer: { type: ['string', 'null'] },
          productLine: { type: ['string', 'null'] },
          productName: { type: ['string', 'null'] },
          variant: { type: ['string', 'null'] },
          npkLabel: { type: ['string', 'null'] },
          reasonDifferent: { type: ['string', 'null'] },
        },
        required: [
          'manufacturer',
          'productLine',
          'productName',
          'variant',
          'npkLabel',
          'reasonDifferent',
        ],
        additionalProperties: false,
      },
    },
    ambiguity: {
      type: 'object',
      properties: {
        unresolved: { type: 'boolean' },
        reason: { type: ['string', 'null'] },
        questionForUser: { type: ['string', 'null'] },
      },
      required: ['unresolved', 'reason', 'questionForUser'],
      additionalProperties: false,
    },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    shortReasoningSummary: { type: ['string', 'null'] },
  },
  required: [
    'status',
    'product',
    'declaration',
    'declarationSource',
    'supportingSources',
    'alternatives',
    'ambiguity',
    'confidence',
    'shortReasoningSummary',
  ],
  additionalProperties: false,
} as const

const KNOWN_NUTRIENT_KEYS = new Set<string>(FERTILIZER_NUTRIENT_MATRIX_KEYS)

export function isManufacturerResearchV2ShadowEnabled(
  env: Record<string, string | undefined> = process.env,
  override?: boolean,
): boolean {
  if (override != null) {
    return override
  }

  return env[MANUFACTURER_RESEARCH_V2_SHADOW_ENV]?.trim().toLowerCase() === 'true'
}

function normalizeToken(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function normalizeProductLine(value: string | null | undefined): string | null {
  const normalized = normalizeToken(value)
  return normalized.length > 0 ? normalized : null
}

function npkLabelFromTriplet(input: {
  n: number | null
  p2o5: number | null
  k2o: number | null
  rawLabel?: string | null
}): string | null {
  if (input.rawLabel?.trim()) {
    return input.rawLabel.trim()
  }

  if (input.n == null || input.p2o5 == null || input.k2o == null) {
    return null
  }

  return `${input.n}-${input.p2o5}-${input.k2o}`
}

function npkLabelsCompatible(left: string | null, right: string | null): boolean {
  if (!left || !right) {
    return true
  }

  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/^npk\s*/i, '')
      .replace(/\s+/g, '')
      .replace(/[–—]/g, '-')

  return normalize(left) === normalize(right)
}

function productLinesContradict(
  expected: string | null | undefined,
  actual: string | null | undefined,
): boolean {
  const left = normalizeProductLine(expected)
  const right = normalizeProductLine(actual)
  if (!left || !right) {
    return false
  }

  return !(left === right || left.includes(right) || right.includes(left))
}

function buildValueEvidencePatterns(value: number): string[] {
  const patterns = new Set<string>()
  patterns.add(String(value))
  patterns.add(value.toFixed(1))
  patterns.add(value.toFixed(2))
  patterns.add(value.toFixed(1).replace('.', ','))
  patterns.add(value.toFixed(2).replace('.', ','))
  return [...patterns].filter(Boolean)
}

export function isNutrientValuePresentInSourceText(sourceText: string, value: number): boolean {
  const normalized = sourceText.toLowerCase()
  return buildValueEvidencePatterns(value).some((pattern) => normalized.includes(pattern.toLowerCase()))
}

export function buildManufacturerResearchV2Prompt(input: {
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  captureContext?: ManufacturerResearchV2CaptureContext | null
}): string {
  const lines = [
    'Captured product identity (strong evidence):',
    `- manufacturer: ${input.identity.manufacturer ?? 'unknown'}`,
    `- productLine: ${input.identity.productLine ?? 'unknown'}`,
    `- productName: ${input.identity.officialName ?? 'unknown'}`,
    `- variant: ${input.identity.variant ?? 'unknown'}`,
    `- npk: ${input.npkLabel ?? input.identity.variant ?? 'unknown'}`,
    `- identityConfidence: ${input.identity.identityConfidence ?? 'unknown'}`,
    `- hasIdentityAmbiguity: ${input.identity.hasIdentityAmbiguity ? 'true' : 'false'}`,
  ]

  if (input.captureContext?.packageSizeLabel) {
    lines.push(`- packageSize: ${input.captureContext.packageSizeLabel}`)
  }

  if (input.captureContext?.recognitionConfidence != null) {
    lines.push(`- recognitionConfidence: ${input.captureContext.recognitionConfidence}`)
  }

  if (input.captureContext?.labelText?.trim()) {
    lines.push('', 'Optional front-label text:', input.captureContext.labelText.trim())
  }

  lines.push(
    '',
    'Search the web and identify the exact commercial fertilizer variant.',
    'Prefer official manufacturer websites or official manufacturer documents.',
    'Explicitly distinguish similarly named variants and do not mix their nutrient declarations.',
    'If the captured identity is already specific enough, do not ask unnecessary questions.',
    'If multiple variants remain genuinely plausible, return status "ambiguous".',
    'Return the complete manufacturer-declared nutrient composition for the resolved product.',
    'Use one primary declaration source whenever possible.',
    'Do not invent undeclared nutrients.',
  )

  return lines.join('\n')
}

export function parseManufacturerResearchV2Result(
  record: Record<string, unknown>,
): ManufacturerResearchV2Result | null {
  if (
    record.status !== 'resolved' &&
    record.status !== 'ambiguous' &&
    record.status !== 'not_found'
  ) {
    return null
  }

  const productRecord = record.product
  if (!productRecord || typeof productRecord !== 'object') {
    return null
  }

  const productObj = productRecord as Record<string, unknown>
  if (typeof productObj.manufacturer !== 'string' || typeof productObj.productName !== 'string') {
    return null
  }

  const npkRecord = productObj.npk
  if (!npkRecord || typeof npkRecord !== 'object') {
    return null
  }

  const npkObj = npkRecord as Record<string, unknown>
  const declarationRecord = record.declaration
  if (!declarationRecord || typeof declarationRecord !== 'object') {
    return null
  }

  const nutrientsRaw = (declarationRecord as Record<string, unknown>).nutrients
  if (!Array.isArray(nutrientsRaw)) {
    return null
  }

  const nutrients = nutrientsRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const nutrient = entry as Record<string, unknown>
      if (typeof nutrient.nutrientKey !== 'string' || typeof nutrient.value !== 'number') {
        return null
      }

      return {
        nutrientKey: nutrient.nutrientKey,
        value: nutrient.value,
        unit: typeof nutrient.unit === 'string' ? nutrient.unit : '%',
        declarationBasis: typeof nutrient.declarationBasis === 'string' ? nutrient.declarationBasis : null,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)

  const ambiguityRecord = record.ambiguity
  if (!ambiguityRecord || typeof ambiguityRecord !== 'object') {
    return null
  }

  const ambiguityObj = ambiguityRecord as Record<string, unknown>
  if (typeof ambiguityObj.unresolved !== 'boolean') {
    return null
  }

  if (
    record.confidence !== 'high' &&
    record.confidence !== 'medium' &&
    record.confidence !== 'low'
  ) {
    return null
  }

  const form =
    productObj.form === 'granular' || productObj.form === 'liquid' || productObj.form === 'unknown'
      ? productObj.form
      : 'unknown'

  let declarationSource: ManufacturerResearchV2Result['declarationSource'] = null
  if (record.declarationSource && typeof record.declarationSource === 'object') {
    const source = record.declarationSource as Record<string, unknown>
    if (typeof source.url === 'string') {
      declarationSource = {
        url: source.url,
        title: typeof source.title === 'string' ? source.title : null,
        sourceType:
          source.sourceType === 'manufacturer_web_page' ||
          source.sourceType === 'manufacturer_pdf' ||
          source.sourceType === 'manufacturer_document' ||
          source.sourceType === 'other'
            ? source.sourceType
            : 'other',
      }
    }
  }

  const supportingSources = Array.isArray(record.supportingSources)
    ? record.supportingSources
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null
          }

          const source = entry as Record<string, unknown>
          if (typeof source.url !== 'string') {
            return null
          }

          return {
            url: source.url,
            title: typeof source.title === 'string' ? source.title : null,
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    : []

  const alternatives = Array.isArray(record.alternatives)
    ? record.alternatives
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null
          }

          const alt = entry as Record<string, unknown>
          return {
            manufacturer: typeof alt.manufacturer === 'string' ? alt.manufacturer : null,
            productLine: typeof alt.productLine === 'string' ? alt.productLine : null,
            productName: typeof alt.productName === 'string' ? alt.productName : null,
            variant: typeof alt.variant === 'string' ? alt.variant : null,
            npkLabel: typeof alt.npkLabel === 'string' ? alt.npkLabel : null,
            reasonDifferent: typeof alt.reasonDifferent === 'string' ? alt.reasonDifferent : null,
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    : []

  return {
    status: record.status,
    product: {
      manufacturer: productObj.manufacturer,
      productLine: typeof productObj.productLine === 'string' ? productObj.productLine : null,
      productName: productObj.productName,
      variant: typeof productObj.variant === 'string' ? productObj.variant : null,
      form,
      npk: {
        n: typeof npkObj.n === 'number' ? npkObj.n : null,
        p2o5: typeof npkObj.p2o5 === 'number' ? npkObj.p2o5 : null,
        k2o: typeof npkObj.k2o === 'number' ? npkObj.k2o : null,
        rawLabel: typeof npkObj.rawLabel === 'string' ? npkObj.rawLabel : null,
      },
    },
    declaration: { nutrients },
    declarationSource,
    supportingSources,
    alternatives,
    ambiguity: {
      unresolved: ambiguityObj.unresolved,
      reason: typeof ambiguityObj.reason === 'string' ? ambiguityObj.reason : null,
      questionForUser:
        typeof ambiguityObj.questionForUser === 'string' ? ambiguityObj.questionForUser : null,
    },
    confidence: record.confidence,
    shortReasoningSummary:
      typeof record.shortReasoningSummary === 'string' ? record.shortReasoningSummary : null,
  }
}

export function validateManufacturerResearchV2NumericSanity(
  result: ManufacturerResearchV2Result,
): boolean {
  for (const nutrient of result.declaration.nutrients) {
    if (!Number.isFinite(nutrient.value) || nutrient.value < 0 || nutrient.value > 100) {
      return false
    }

    if (!KNOWN_NUTRIENT_KEYS.has(nutrient.nutrientKey)) {
      return false
    }
  }

  return true
}

export function detectHardIdentityContradiction(input: {
  captureIdentity: FertilizerEnrichmentIdentity
  captureNpkLabel?: string | null
  result: ManufacturerResearchV2Result
}): boolean {
  const expectedNpk = input.captureNpkLabel ?? null
  const resultNpk = npkLabelFromTriplet(input.result.product.npk)

  if (expectedNpk && resultNpk && !npkLabelsCompatible(expectedNpk, resultNpk)) {
    return true
  }

  return productLinesContradict(input.captureIdentity.productLine, input.result.product.productLine)
}

export async function validateManufacturerResearchV2Source(input: {
  result: ManufacturerResearchV2Result
  fetchProvider: FertilizerManufacturerResearchFetchProvider
  timeoutMs?: number
}): Promise<{ sourceValid: boolean; sourceText: string | null; sourceFetchFailed: boolean }> {
  const url = input.result.declarationSource?.url
  if (!url?.trim()) {
    return { sourceValid: false, sourceText: null, sourceFetchFailed: false }
  }

  const validated = validateFertilizerManufacturerDocumentSource(url)
  if (validated.status !== 'valid') {
    return { sourceValid: false, sourceText: null, sourceFetchFailed: false }
  }

  const fetchResult = await input.fetchProvider.fetchSource(validated.normalizedUrl, {
    timeoutMs: input.timeoutMs,
  })

  if (!fetchResult.ok || !fetchResult.text?.trim()) {
    return { sourceValid: false, sourceText: null, sourceFetchFailed: true }
  }

  return { sourceValid: true, sourceText: fetchResult.text, sourceFetchFailed: false }
}

export function validateManufacturerResearchV2Evidence(input: {
  result: ManufacturerResearchV2Result
  sourceText: string | null
  sourceFetchFailed: boolean
}): boolean {
  if (input.sourceFetchFailed) {
    return false
  }

  if (!input.sourceText?.trim()) {
    return input.result.declaration.nutrients.filter((nutrient) => nutrient.value > 0).length === 0
  }

  const positiveNutrients = input.result.declaration.nutrients.filter((nutrient) => nutrient.value > 0)
  if (positiveNutrients.length === 0) {
    return true
  }

  return positiveNutrients.every((nutrient) =>
    isNutrientValuePresentInSourceText(input.sourceText as string, nutrient.value),
  )
}

export function evaluateManufacturerResearchV2Shadow(input: {
  captureIdentity: FertilizerEnrichmentIdentity
  captureNpkLabel?: string | null
  result: ManufacturerResearchV2Result | null
  schemaValid: boolean
  sourceValid: boolean
  sourceFetchFailed: boolean
  evidenceCheckPassed: boolean
}): {
  gates: ManufacturerResearchV2GateDiagnostics
  finalShadowDecision: ManufacturerResearchV2ShadowFinalDecision
} {
  const numericSanityPassed = input.result ? validateManufacturerResearchV2NumericSanity(input.result) : false
  const identityContradiction =
    input.result != null &&
    detectHardIdentityContradiction({
      captureIdentity: input.captureIdentity,
      captureNpkLabel: input.captureNpkLabel,
      result: input.result,
    })

  const gates: ManufacturerResearchV2GateDiagnostics = {
    schemaValid: input.schemaValid,
    sourceValid: input.sourceValid,
    identityContradiction,
    evidenceCheckPassed: input.evidenceCheckPassed,
    numericSanityPassed,
  }

  if (!input.schemaValid || !input.result) {
    return { gates, finalShadowDecision: 'not_found' }
  }

  if (
    input.result.status === 'ambiguous' ||
    input.result.ambiguity.unresolved
  ) {
    return { gates, finalShadowDecision: 'ambiguous' }
  }

  if (input.result.status === 'not_found') {
    return { gates, finalShadowDecision: 'not_found' }
  }

  if (!input.sourceValid || identityContradiction || !numericSanityPassed || !input.evidenceCheckPassed) {
    return { gates, finalShadowDecision: 'rejected' }
  }

  return { gates, finalShadowDecision: 'resolved_valid' }
}

function readV1NutrientMap(
  adapterResult: FertilizerSourceAdapterResult | null | undefined,
): Partial<Record<FertilizerNutrientMatrixKey, number>> {
  if (!adapterResult || (adapterResult.status !== 'success' && adapterResult.status !== 'partial')) {
    return {}
  }

  const map: Partial<Record<FertilizerNutrientMatrixKey, number>> = {}
  for (const nutrient of adapterResult.extraction.extractedNutrients ?? []) {
    if (typeof nutrient.value === 'number') {
      map[nutrient.key] = nutrient.value
    }
  }

  return map
}

function normalizedDeclarationSourceUrl(url: string): string | null {
  const validated = validateFertilizerManufacturerDocumentSource(url)
  return validated.status === 'valid' ? validated.normalizedUrl : null
}

export function compareManufacturerResearchV2WithV1(input: {
  captureIdentity: FertilizerEnrichmentIdentity
  v2Result: ManufacturerResearchV2Result
  v1AdapterResult: FertilizerSourceAdapterResult | null | undefined
}): ManufacturerResearchV2ShadowComparison | null {
  const v1Npk =
    input.v1AdapterResult?.status === 'success' || input.v1AdapterResult?.status === 'partial'
      ? input.v1AdapterResult.extraction.extractedNpk
      : null
  const v2NpkLabel = npkLabelFromTriplet(input.v2Result.product.npk)

  const v1Map = readV1NutrientMap(input.v1AdapterResult)
  const v2Positive = input.v2Result.declaration.nutrients.filter((nutrient) => nutrient.value > 0)
  const nutrientMatrixMatch =
    v2Positive.length === 0
      ? Object.keys(v1Map).length === 0
      : v2Positive.every((nutrient) => {
          if (!KNOWN_NUTRIENT_KEYS.has(nutrient.nutrientKey)) {
            return false
          }

          const key = nutrient.nutrientKey as FertilizerNutrientMatrixKey
          return v1Map[key] === nutrient.value
        })

  const v1Url =
    input.v1AdapterResult && input.v1AdapterResult.status !== 'no_match'
      ? input.v1AdapterResult.sourceUrl
      : null

  const captureManufacturer = normalizeToken(input.captureIdentity.manufacturer)
  const resultManufacturer = normalizeToken(input.v2Result.product.manufacturer)
  const manufacturerMatch =
    captureManufacturer.length === 0 ||
    resultManufacturer.includes(captureManufacturer) ||
    captureManufacturer.includes(resultManufacturer)

  const captureName = normalizeToken(input.captureIdentity.officialName)
  const resultName = normalizeToken(input.v2Result.product.productName)
  const nameMatch =
    captureName.length === 0 ||
    resultName.includes(captureName) ||
    captureName.includes(resultName)

  const v1NormalizedUrl = v1Url ? normalizedDeclarationSourceUrl(v1Url) : null
  const v2NormalizedUrl = input.v2Result.declarationSource?.url
    ? normalizedDeclarationSourceUrl(input.v2Result.declarationSource.url)
    : null

  return {
    productIdentityMatch: manufacturerMatch && nameMatch,
    npkMatch: npkLabelsCompatible(
      v1Npk ? `${v1Npk.nitrogen}-${v1Npk.phosphate}-${v1Npk.potash}` : null,
      v2NpkLabel,
    ),
    nutrientMatrixMatch,
    declarationSourceMatch:
      !v1NormalizedUrl || !v2NormalizedUrl ? null : v1NormalizedUrl === v2NormalizedUrl,
  }
}

export type ManufacturerResearchV2Call = (input: {
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  captureContext?: ManufacturerResearchV2CaptureContext | null
  timeoutMs?: number
}) => Promise<ManufacturerResearchV2Result | null>

export function createOpenAiManufacturerResearchV2Call(
  openai: OpenAI,
  options: { model?: string } = {},
): ManufacturerResearchV2Call {
  const model = options.model ?? PRODUCT_RECOGNIZE_IMAGE_MODEL

  return async (input) => {
    const response = await openai.responses.create({
      model,
      tools: [{ type: 'web_search' }],
      include: ['web_search_call.action.sources'],
      input: [
        {
          role: 'system',
          content:
            'You are researching a commercial fertilizer product. Identify the exact product variant and return the manufacturer-declared nutrient composition. Use web search. Prefer official manufacturer sources. Do not mix nutrient values from different variants. Return structured data only.',
        },
        {
          role: 'user',
          content: buildManufacturerResearchV2Prompt(input),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'manufacturer_research_v2',
          strict: true,
          schema: manufacturerResearchV2JsonSchema,
        },
      },
    })

    const outputText = response.output_text
    if (!outputText?.trim()) {
      return null
    }

    return parseManufacturerResearchV2Result(JSON.parse(outputText) as Record<string, unknown>)
  }
}

export async function runManufacturerResearchV2Shadow(input: {
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  captureContext?: ManufacturerResearchV2CaptureContext | null
  fetchProvider: FertilizerManufacturerResearchFetchProvider
  callResearch: ManufacturerResearchV2Call
  v1AdapterResult?: FertilizerSourceAdapterResult | null
  v1Diagnostics: FertilizerManufacturerResearchDiagnostics
  timeoutMs?: number
  now?: () => number
}): Promise<ManufacturerResearchV2ShadowDiagnostics> {
  const now = input.now ?? Date.now
  const startedAt = now()

  try {
    const rawResult = await input.callResearch({
      identity: input.identity,
      npkLabel: input.npkLabel,
      captureContext: input.captureContext,
      timeoutMs: input.timeoutMs,
    })

    const schemaValid = rawResult != null
    const sourceValidation =
      rawResult != null
        ? await validateManufacturerResearchV2Source({
            result: rawResult,
            fetchProvider: input.fetchProvider,
            timeoutMs: input.timeoutMs,
          })
        : { sourceValid: false, sourceText: null, sourceFetchFailed: false }

    const evidenceCheckPassed =
      rawResult != null
        ? validateManufacturerResearchV2Evidence({
            result: rawResult,
            sourceText: sourceValidation.sourceText,
            sourceFetchFailed: sourceValidation.sourceFetchFailed,
          })
        : false

    const evaluation = evaluateManufacturerResearchV2Shadow({
      captureIdentity: input.identity,
      captureNpkLabel: input.npkLabel,
      result: rawResult,
      schemaValid,
      sourceValid: sourceValidation.sourceValid,
      sourceFetchFailed: sourceValidation.sourceFetchFailed,
      evidenceCheckPassed,
    })

    const positiveNutrientCount =
      rawResult?.declaration.nutrients.filter((nutrient) => nutrient.value > 0).length ?? null

    return {
      executed: true,
      durationMs: now() - startedAt,
      status: rawResult?.status ?? 'error',
      identifiedProduct: rawResult
        ? {
            manufacturer: rawResult.product.manufacturer,
            productLine: rawResult.product.productLine,
            productName: rawResult.product.productName,
            variant: rawResult.product.variant,
            npkLabel: npkLabelFromTriplet(rawResult.product.npk),
          }
        : null,
      declarationSourceUrl: rawResult?.declarationSource?.url ?? null,
      supportingSourceCount: rawResult?.supportingSources.length ?? null,
      nutrientCount: rawResult?.declaration.nutrients.length ?? null,
      positiveNutrientCount,
      ambiguity: rawResult?.ambiguity ?? null,
      gates: evaluation.gates,
      finalShadowDecision: evaluation.finalShadowDecision,
      comparison:
        rawResult != null
          ? compareManufacturerResearchV2WithV1({
              captureIdentity: input.identity,
              v2Result: rawResult,
              v1AdapterResult: input.v1AdapterResult,
            })
          : null,
      errorMessage: null,
    }
  } catch (error) {
    return {
      executed: true,
      durationMs: now() - startedAt,
      status: 'error',
      identifiedProduct: null,
      declarationSourceUrl: null,
      supportingSourceCount: null,
      nutrientCount: null,
      positiveNutrientCount: null,
      ambiguity: null,
      gates: null,
      finalShadowDecision: 'error',
      comparison: null,
      errorMessage: error instanceof Error ? error.message : 'manufacturer_research_v2_shadow_error',
    }
  }
}

export async function maybeAttachManufacturerResearchV2Shadow(input: {
  enabled?: boolean
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  captureContext?: ManufacturerResearchV2CaptureContext | null
  fetchProvider: FertilizerManufacturerResearchFetchProvider
  v1AdapterResult: FertilizerSourceAdapterResult | null
  v1Diagnostics: FertilizerManufacturerResearchDiagnostics
  openAiApiKey?: string | null
  callResearch?: ManufacturerResearchV2Call
  timeoutMs?: number
}): Promise<ManufacturerResearchV2ShadowDiagnostics | null> {
  if (!isManufacturerResearchV2ShadowEnabled(process.env, input.enabled)) {
    return null
  }

  const apiKey = input.openAiApiKey?.trim()
  const callResearch =
    input.callResearch ??
    (apiKey ? createOpenAiManufacturerResearchV2Call(new OpenAI({ apiKey })) : null)

  if (!callResearch) {
    return {
      executed: false,
      durationMs: null,
      status: null,
      identifiedProduct: null,
      declarationSourceUrl: null,
      supportingSourceCount: null,
      nutrientCount: null,
      positiveNutrientCount: null,
      ambiguity: null,
      gates: null,
      finalShadowDecision: 'not_executed',
      comparison: null,
      errorMessage: 'openai_not_configured',
    }
  }

  return runManufacturerResearchV2Shadow({
    identity: input.identity,
    npkLabel: input.npkLabel,
    captureContext: input.captureContext,
    fetchProvider: input.fetchProvider,
    callResearch,
    v1AdapterResult: input.v1AdapterResult,
    v1Diagnostics: input.v1Diagnostics,
    timeoutMs: input.timeoutMs,
  })
}
