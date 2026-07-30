import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type {
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentSourceHint,
  FertilizerSourceAdapterResult,
  FertilizerSourceAdapterSourceType,
  FertilizerSourceAdapterTechnicalError,
} from '../types/fertilizerEnrichmentOrchestration'
import {
  FertilizerManufacturerDocumentParserError,
  parseFertilizerManufacturerDocumentText,
  type FertilizerManufacturerDocumentParseResult,
} from './fertilizerManufacturerDocumentParserCore'
import { validateFertilizerManufacturerDocumentSource } from './fertilizerManufacturerDocumentSourceValidatorCore'
import { parseFertilizerEnrichmentStorageLocator } from './fertilizerEnrichmentStorageLocatorCore'
import type { FertilizerSourceAdapter, FertilizerSourceAdapterContext } from './fertilizerEnrichmentOrchestrationCore'
import { rethrowIfContractError } from './fertilizerEnrichmentOrchestrationCore'

export const FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE =
  'manufacturer_product_document' as const

export const FERTILIZER_MANUFACTURER_DOCUMENT_UNEXPECTED_FAILURE_MESSAGE =
  'Injected fertilizer manufacturer document adapter dependency failed unexpectedly.'

export type FertilizerManufacturerDocumentFetchErrorCode =
  | 'network_error'
  | 'rate_limited'
  | 'access_denied'
  | 'source_not_found'
  | 'invalid_document'
  | 'timeout'
  | 'unsupported_source'
  | 'unknown_adapter_error'

export interface FertilizerManufacturerDocumentFetchSuccess {
  ok: true
  finalUrl: string
  contentType: string
  text?: string | null
  title?: string | null
  retrievedAt: string
  etag?: string | null
  lastModified?: string | null
  statusCode: number
}

export interface FertilizerManufacturerDocumentFetchFailure {
  ok: false
  errorCode: FertilizerManufacturerDocumentFetchErrorCode
  retryable: boolean
}

export type FertilizerManufacturerDocumentFetchResult =
  | FertilizerManufacturerDocumentFetchSuccess
  | FertilizerManufacturerDocumentFetchFailure

export interface FertilizerManufacturerDocumentTextExtractionInput {
  contentType: string
  text?: string | null
  bytes?: Uint8Array | null
  title?: string | null
}

export interface FertilizerManufacturerProductDocumentAdapterDependencies {
  fetchDocument: (
    sourceUrl: string,
    context: {
      input: FertilizerEnrichmentOrchestrationInput
      orchestrationRunId: string
      attempt: number
    },
  ) => Promise<FertilizerManufacturerDocumentFetchResult>
  extractDocumentText?: (
    input: FertilizerManufacturerDocumentTextExtractionInput,
  ) => Promise<string>
  now?: () => string
  createSourceId?: (normalizedUrl: string) => string
}

const ADAPTER_UNSPECIFIED_SOURCE_TYPE: FertilizerSourceAdapterSourceType = 'pdf_document'

function defaultNow(): string {
  return new Date().toISOString()
}

function createSourceIdFromUrl(normalizedUrl: string): string {
  return `manufacturer-doc:${normalizedUrl}`
}

export function selectManufacturerProductDocumentSourceHint(
  input: FertilizerEnrichmentOrchestrationInput,
): FertilizerEnrichmentSourceHint | null {
  for (const hint of input.sourceHints ?? []) {
    if (hint.adapterType !== FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE) {
      continue
    }

    const sourceUrl = hint.sourceUrl?.trim()
    const referenceId = hint.referenceId?.trim()
    if (sourceUrl || referenceId) {
      return hint
    }
  }

  return null
}

export function resolveManufacturerProductDocumentReference(
  input: FertilizerEnrichmentOrchestrationInput,
): { kind: 'url'; value: string } | { kind: 'reference'; value: string } | null {
  const hint = selectManufacturerProductDocumentSourceHint(input)
  if (!hint) {
    return null
  }

  const referenceId = hint.referenceId?.trim()
  if (referenceId) {
    return { kind: 'reference', value: referenceId }
  }

  const sourceUrl = hint.sourceUrl?.trim()
  if (sourceUrl) {
    return { kind: 'url', value: sourceUrl }
  }

  return null
}

export function resolveManufacturerProductDocumentUrl(
  input: FertilizerEnrichmentOrchestrationInput,
): string | null {
  const reference = resolveManufacturerProductDocumentReference(input)
  if (!reference || reference.kind !== 'url') {
    return null
  }

  return reference.value
}

export function mapValidatedContentTypeToAdapterSourceType(
  contentType: string,
): FertilizerSourceAdapterSourceType | null {
  const normalized = contentType.trim().toLowerCase().split(';')[0]?.trim() ?? ''

  if (normalized === 'application/pdf') {
    return 'pdf_document'
  }

  if (normalized === 'text/plain') {
    return 'text_document'
  }

  return null
}

function buildNoMatchResult(
  sourceId: string,
  sourceUrl: string | null,
  retrievedAt: string,
  sourceType: FertilizerSourceAdapterSourceType = ADAPTER_UNSPECIFIED_SOURCE_TYPE,
  reasonCode: 'no_match' | 'not_applicable' = 'no_match',
): Extract<FertilizerSourceAdapterResult, { status: 'no_match' }> {
  return {
    adapterType: FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE,
    status: 'no_match',
    sourceId,
    sourceType,
    sourceCategory: 'official_document',
    sourceUrl,
    retrievedAt,
    reasonCode,
  }
}

function buildInvalidSourceResult(
  sourceId: string,
  sourceUrl: string | null,
  retrievedAt: string,
  sourceType: FertilizerSourceAdapterSourceType = ADAPTER_UNSPECIFIED_SOURCE_TYPE,
): Extract<FertilizerSourceAdapterResult, { status: 'invalid_source' }> {
  return {
    adapterType: FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE,
    status: 'invalid_source',
    sourceId,
    sourceType,
    sourceCategory: 'official_document',
    sourceUrl,
    retrievedAt,
    reasonCode: 'invalid_source',
    retryable: false,
  }
}

function buildUnavailableResult(
  sourceId: string,
  sourceUrl: string,
  retrievedAt: string,
  technicalError: FertilizerSourceAdapterTechnicalError,
  retryable: boolean,
  sourceType: FertilizerSourceAdapterSourceType = ADAPTER_UNSPECIFIED_SOURCE_TYPE,
): Extract<FertilizerSourceAdapterResult, { status: 'unavailable' }> {
  return {
    adapterType: FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE,
    status: 'unavailable',
    sourceId,
    sourceType,
    sourceCategory: 'official_document',
    sourceUrl,
    retrievedAt,
    technicalError,
    retryable,
  }
}

function buildFailedResult(
  sourceId: string,
  sourceUrl: string | null,
  retrievedAt: string,
  technicalError: FertilizerSourceAdapterTechnicalError,
  retryable: boolean,
  sourceType: FertilizerSourceAdapterSourceType = ADAPTER_UNSPECIFIED_SOURCE_TYPE,
): Extract<FertilizerSourceAdapterResult, { status: 'failed' }> {
  return {
    adapterType: FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE,
    status: 'failed',
    sourceId,
    sourceType,
    sourceCategory: 'official_document',
    sourceUrl,
    retrievedAt,
    technicalError,
    retryable,
  }
}

function createTechnicalError(
  code: FertilizerSourceAdapterTechnicalError['code'],
  retryable: boolean,
  sourceId?: string | null,
): FertilizerSourceAdapterTechnicalError {
  const messages: Record<FertilizerSourceAdapterTechnicalError['code'], string> = {
    network_error: 'Manufacturer document could not be retrieved due to a network error.',
    rate_limited: 'Manufacturer document source rate limited the request.',
    access_denied: 'Access to the manufacturer document was denied.',
    source_not_found: 'Manufacturer document source was not found.',
    invalid_document: 'Manufacturer document content was invalid or unsupported.',
    parser_error: 'Manufacturer document could not be parsed.',
    unsupported_source: 'Manufacturer document source type is unsupported.',
    timeout: 'Manufacturer document retrieval timed out.',
    unknown_adapter_error: FERTILIZER_MANUFACTURER_DOCUMENT_UNEXPECTED_FAILURE_MESSAGE,
  }

  return {
    code,
    message: messages[code],
    retryable,
    adapterType: FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE,
    sourceId: sourceId ?? null,
  }
}

function mapFetchFailure(
  sourceId: string,
  sourceUrl: string,
  retrievedAt: string,
  failure: FertilizerManufacturerDocumentFetchFailure,
  sourceType: FertilizerSourceAdapterSourceType = ADAPTER_UNSPECIFIED_SOURCE_TYPE,
): FertilizerSourceAdapterResult {
  if (failure.errorCode === 'unsupported_source') {
    return buildInvalidSourceResult(sourceId, sourceUrl, retrievedAt, sourceType)
  }

  if (failure.errorCode === 'invalid_document') {
    return buildFailedResult(
      sourceId,
      sourceUrl,
      retrievedAt,
      createTechnicalError('invalid_document', failure.retryable, sourceId),
      failure.retryable,
      sourceType,
    )
  }

  const code =
    failure.errorCode === 'unknown_adapter_error' ? 'unknown_adapter_error' : failure.errorCode

  return buildUnavailableResult(
    sourceId,
    sourceUrl,
    retrievedAt,
    createTechnicalError(code, failure.retryable, sourceId),
    failure.retryable,
    sourceType,
  )
}

function buildEvidenceId(sourceId: string, fieldPath: string): string {
  return `${sourceId}:${fieldPath}`
}

function mapParseResultToAdapterSuccess(
  sourceId: string,
  sourceUrl: string,
  retrievedAt: string,
  title: string | null | undefined,
  sourceVersion: string | null,
  parsed: FertilizerManufacturerDocumentParseResult,
  sourceType: FertilizerSourceAdapterSourceType,
): Extract<FertilizerSourceAdapterResult, { status: 'success' | 'partial' }> {
  const evidence = [
    ...(parsed.npk?.evidenceExcerpt
      ? [
          {
            evidenceId: buildEvidenceId(sourceId, 'npk'),
            excerpt: parsed.npk.evidenceExcerpt,
            fieldPath: 'npk',
          },
        ]
      : []),
    ...parsed.nutrients.map((nutrient) => ({
      evidenceId: buildEvidenceId(sourceId, nutrient.fieldPath),
      excerpt: nutrient.evidenceExcerpt,
      fieldPath: nutrient.fieldPath,
    })),
  ]

  const status =
    parsed.classification === 'exact_match' &&
    parsed.declarationSectionFullyCaptured &&
    parsed.documentFullyProcessed &&
    parsed.npk?.declarationBasisKnown
      ? 'success'
      : 'partial'

  return {
    adapterType: FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE,
    status,
    sourceId,
    sourceType,
    sourceCategory: 'official_document',
    sourceUrl,
    sourceTitle: title ?? null,
    retrievedAt,
    sourceVersion,
    productVariantReference: parsed.extractedVariant,
    extraction: {
      extractedIdentity: {
        manufacturer: parsed.extractedManufacturer,
        officialName: parsed.extractedProductName,
        variant: parsed.extractedVariant,
      },
      extractedProductForm: parsed.productForm,
      extractedNpk: parsed.npk
        ? {
            nitrogen: parsed.npk.nitrogen,
            phosphate: parsed.npk.phosphate,
            potash: parsed.npk.potash,
            declarationBasis: parsed.npk.declarationBasisKnown
              ? { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' }
              : null,
            rawLabel: parsed.npk.evidenceExcerpt,
          }
        : undefined,
      extractedNutrients: parsed.nutrients.map((nutrient) => ({
        key: nutrient.key,
        value: nutrient.value,
        declarationBasis: nutrient.declarationBasis,
        unit: '%' as const,
      })),
      coverageMetadata: {
        fieldsCovered: [
          ...(parsed.npk ? ['npk'] : []),
          ...parsed.nutrients.map((nutrient) => nutrient.fieldPath),
        ],
        nutrientSectionLocated: parsed.declarationSectionLocated,
        nutrientSectionFullyCaptured: parsed.declarationSectionFullyCaptured,
        variantMatched: parsed.variantMatched,
        productScopeConfirmed: parsed.productScopeConfirmed,
        coverageNotes: parsed.documentFullyProcessed ? null : 'document_incomplete',
      },
      evidence,
    },
  }
}

export function mapFertilizerManufacturerDocumentToAdapterResult(
  sourceId: string,
  sourceUrl: string,
  retrievedAt: string,
  fetchResult: FertilizerManufacturerDocumentFetchSuccess,
  parsed: FertilizerManufacturerDocumentParseResult,
  sourceType: FertilizerSourceAdapterSourceType,
): FertilizerSourceAdapterResult {
  if (parsed.classification === 'no_match') {
    return buildNoMatchResult(sourceId, sourceUrl, retrievedAt, sourceType)
  }

  const sourceVersion = fetchResult.etag ?? fetchResult.lastModified ?? null
  return mapParseResultToAdapterSuccess(
    sourceId,
    sourceUrl,
    retrievedAt,
    fetchResult.title,
    sourceVersion,
    parsed,
    sourceType,
  )
}

export function classifyFertilizerManufacturerDocument(
  text: string,
  expectedIdentity: FertilizerEnrichmentIdentity,
): FertilizerManufacturerDocumentParseResult['classification'] {
  return parseFertilizerManufacturerDocumentText(text, expectedIdentity).classification
}

export async function runFertilizerManufacturerProductDocumentAdapter(
  context: FertilizerSourceAdapterContext,
  dependencies: FertilizerManufacturerProductDocumentAdapterDependencies,
): Promise<FertilizerSourceAdapterResult> {
  const now = dependencies.now ?? defaultNow
  const retrievedAt = now()
  const reference = resolveManufacturerProductDocumentReference(context.input)

  if (!reference) {
    return buildNoMatchResult('manufacturer-doc:no-reference', null, retrievedAt)
  }

  let sourceUrl: string
  let sourceRefForFetch: string

  if (reference.kind === 'reference') {
    const parsedReference = parseFertilizerEnrichmentStorageLocator(reference.value)
    if (parsedReference.status === 'invalid') {
      return buildInvalidSourceResult(
        dependencies.createSourceId?.(reference.value) ?? createSourceIdFromUrl(reference.value),
        reference.value,
        retrievedAt,
      )
    }

    sourceUrl = reference.value
    sourceRefForFetch = reference.value
  } else {
    const validation = validateFertilizerManufacturerDocumentSource(reference.value)
    if (validation.status === 'invalid') {
      const sourceId =
        dependencies.createSourceId?.(reference.value) ?? createSourceIdFromUrl(reference.value)
      return buildInvalidSourceResult(sourceId, reference.value, retrievedAt)
    }

    sourceUrl = validation.normalizedUrl
    sourceRefForFetch = validation.normalizedUrl
  }

  const sourceId =
    dependencies.createSourceId?.(sourceRefForFetch) ?? createSourceIdFromUrl(sourceRefForFetch)

  try {
    const fetchResult = await dependencies.fetchDocument(sourceRefForFetch, {
      input: context.input,
      orchestrationRunId: context.orchestrationRunId,
      attempt: context.attempt,
    })

    if (!fetchResult.ok) {
      return mapFetchFailure(sourceId, sourceUrl, retrievedAt, fetchResult)
    }

    const validatedSourceType = mapValidatedContentTypeToAdapterSourceType(fetchResult.contentType)
    if (!validatedSourceType) {
      return buildInvalidSourceResult(sourceId, sourceUrl, retrievedAt)
    }

    let documentText: string
    try {
      if (fetchResult.text != null) {
        documentText = fetchResult.text
      } else if (!dependencies.extractDocumentText) {
        return buildFailedResult(
          sourceId,
          sourceUrl,
          retrievedAt,
          createTechnicalError('invalid_document', false, sourceId),
          false,
          validatedSourceType,
        )
      } else {
        documentText = await dependencies.extractDocumentText({
          contentType: fetchResult.contentType,
          text: fetchResult.text,
          bytes: null,
          title: fetchResult.title,
        })
      }

      if (!documentText.trim()) {
        throw new FertilizerManufacturerDocumentParserError()
      }
    } catch (error) {
      rethrowIfContractError(error)
      if (error instanceof FertilizerManufacturerDocumentParserError) {
        return buildFailedResult(
          sourceId,
          sourceUrl,
          retrievedAt,
          createTechnicalError('parser_error', false, sourceId),
          false,
          validatedSourceType,
        )
      }

      return buildFailedResult(
        sourceId,
        sourceUrl,
        retrievedAt,
        createTechnicalError('invalid_document', false, sourceId),
        false,
        validatedSourceType,
      )
    }

    let parsed: FertilizerManufacturerDocumentParseResult
    try {
      parsed = parseFertilizerManufacturerDocumentText(documentText, context.input.identity)
    } catch (error) {
      rethrowIfContractError(error)
      return buildFailedResult(
        sourceId,
        sourceUrl,
        retrievedAt,
        createTechnicalError('parser_error', false, sourceId),
        false,
        validatedSourceType,
      )
    }

    return mapFertilizerManufacturerDocumentToAdapterResult(
      sourceId,
      sourceUrl,
      fetchResult.retrievedAt,
      fetchResult,
      parsed,
      validatedSourceType,
    )
  } catch (error) {
    rethrowIfContractError(error)
    return buildFailedResult(
      sourceId,
      sourceUrl,
      retrievedAt,
      createTechnicalError('unknown_adapter_error', false, sourceId),
      false,
    )
  }
}

export function createFertilizerManufacturerProductDocumentAdapter(
  dependencies: FertilizerManufacturerProductDocumentAdapterDependencies,
): FertilizerSourceAdapter {
  return {
    adapterType: FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE,
    run: (context) => runFertilizerManufacturerProductDocumentAdapter(context, dependencies),
  }
}

export {
  validateFertilizerManufacturerDocumentSource,
} from './fertilizerManufacturerDocumentSourceValidatorCore'

export {
  parseFertilizerManufacturerDocumentText,
  FertilizerManufacturerDocumentParserError,
} from './fertilizerManufacturerDocumentParserCore'
