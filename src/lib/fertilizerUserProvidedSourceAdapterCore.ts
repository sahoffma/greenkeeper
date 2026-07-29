import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type {
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentSourceHint,
  FertilizerSourceAdapterResult,
  FertilizerSourceAdapterSourceType,
  FertilizerSourceAdapterTechnicalError,
  FertilizerSourceAdapterType,
} from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerEnrichmentSourceCategory } from '../types/fertilizerEnrichment'
import {
  classifyDeclarationAgainstIdentity,
  evaluateDeclarationVariantMatch,
  extractDeclarationDocumentIdentity,
  parseFertilizerDeclarationText,
  type FertilizerDeclarationTextClassification,
  type FertilizerDeclarationTextParseResult,
} from './fertilizerDeclarationTextParserCore'

export const FERTILIZER_USER_PROVIDED_SOURCE_UNEXPECTED_FAILURE_MESSAGE =
  'Injected fertilizer user-provided source adapter dependency failed unexpectedly.'

export type FertilizerUserProvidedSourceMediaKind = 'text' | 'pdf' | 'image' | 'unsupported'

export interface FertilizerUserProvidedSourceResolveSuccess {
  ok: true
  referenceId: string
  contentType: string
  text?: string | null
  title?: string | null
  providedAt: string
  contentHash?: string | null
  productVariantReference?: string | null
  mediaKind: FertilizerUserProvidedSourceMediaKind
}

export type FertilizerUserProvidedSourceResolveErrorCode =
  | 'source_not_found'
  | 'unsupported_source'
  | 'invalid_document'
  | 'timeout'
  | 'unknown_adapter_error'

export interface FertilizerUserProvidedSourceResolveFailure {
  ok: false
  errorCode: FertilizerUserProvidedSourceResolveErrorCode
  retryable: boolean
}

export type FertilizerUserProvidedSourceResolveResult =
  | FertilizerUserProvidedSourceResolveSuccess
  | FertilizerUserProvidedSourceResolveFailure

export interface FertilizerUserProvidedDocumentTextExtractionInput {
  contentType: string
  text?: string | null
  bytes?: Uint8Array | null
  title?: string | null
}

export interface ParsedUserProvidedDeclaration {
  classification: FertilizerDeclarationTextClassification
  parsed: FertilizerDeclarationTextParseResult
  variantMatched: boolean
  productScopeConfirmed: boolean
}

export function selectAdapterSourceHint(
  input: FertilizerEnrichmentOrchestrationInput,
  adapterType: FertilizerSourceAdapterType,
): FertilizerEnrichmentSourceHint | null {
  for (const hint of input.sourceHints ?? []) {
    if (hint.adapterType !== adapterType) {
      continue
    }

    const referenceId = hint.referenceId?.trim()
    const sourceUrl = hint.sourceUrl?.trim()
    if (referenceId || sourceUrl) {
      return hint
    }
  }

  return null
}

export function resolveAdapterSourceReference(
  hint: FertilizerEnrichmentSourceHint,
): string | null {
  return hint.referenceId?.trim() ?? hint.sourceUrl?.trim() ?? null
}

export function mapUserProvidedContentTypeToSourceType(
  contentType: string,
  adapterType: 'user_document' | 'packaging',
): FertilizerSourceAdapterSourceType | null {
  const normalized = contentType.trim().toLowerCase().split(';')[0]?.trim() ?? ''

  if (adapterType === 'packaging') {
    if (normalized === 'text/plain') {
      return 'packaging_label_text'
    }
    if (normalized.startsWith('image/')) {
      return 'packaging_image'
    }
    return null
  }

  if (normalized === 'application/pdf') {
    return 'pdf_document'
  }

  if (normalized === 'text/plain') {
    return 'text_document'
  }

  return null
}

export function buildEvidenceId(sourceId: string, fieldPath: string): string {
  return `${sourceId}:${fieldPath}`
}

export function createUserProvidedTechnicalError(
  adapterType: FertilizerSourceAdapterType,
  code: FertilizerSourceAdapterTechnicalError['code'],
  retryable: boolean,
  sourceId?: string | null,
  messageOverride?: string,
): FertilizerSourceAdapterTechnicalError {
  const messages: Record<FertilizerSourceAdapterTechnicalError['code'], string> = {
    network_error: 'User-provided source could not be retrieved due to a network error.',
    rate_limited: 'User-provided source rate limited the request.',
    access_denied: 'Access to the user-provided source was denied.',
    source_not_found: 'User-provided source was not found.',
    invalid_document: 'User-provided source content was invalid or unsupported.',
    parser_error: 'User-provided source could not be parsed.',
    unsupported_source: 'User-provided source type is unsupported.',
    timeout: 'User-provided source retrieval timed out.',
    unknown_adapter_error: FERTILIZER_USER_PROVIDED_SOURCE_UNEXPECTED_FAILURE_MESSAGE,
  }

  return {
    code,
    message: messageOverride ?? messages[code],
    retryable,
    adapterType,
    sourceId: sourceId ?? null,
  }
}

export function buildUserProvidedNoMatchResult(
  adapterType: FertilizerSourceAdapterType,
  sourceId: string,
  sourceRef: string | null,
  retrievedAt: string,
  sourceCategory: FertilizerEnrichmentSourceCategory,
  sourceType: FertilizerSourceAdapterSourceType,
  reasonCode: 'no_match' | 'not_applicable' = 'no_match',
): Extract<FertilizerSourceAdapterResult, { status: 'no_match' }> {
  return {
    adapterType,
    status: 'no_match',
    sourceId,
    sourceType,
    sourceCategory,
    sourceRef,
    retrievedAt,
    reasonCode,
  }
}

export function buildUserProvidedInvalidSourceResult(
  adapterType: FertilizerSourceAdapterType,
  sourceId: string,
  sourceRef: string | null,
  retrievedAt: string,
  sourceCategory: FertilizerEnrichmentSourceCategory,
  sourceType: FertilizerSourceAdapterSourceType,
): Extract<FertilizerSourceAdapterResult, { status: 'invalid_source' }> {
  return {
    adapterType,
    status: 'invalid_source',
    sourceId,
    sourceType,
    sourceCategory,
    sourceRef,
    retrievedAt,
    reasonCode: 'invalid_source',
    retryable: false,
  }
}

export function buildUserProvidedUnavailableResult(
  adapterType: FertilizerSourceAdapterType,
  sourceId: string,
  sourceRef: string,
  retrievedAt: string,
  sourceCategory: FertilizerEnrichmentSourceCategory,
  sourceType: FertilizerSourceAdapterSourceType,
  technicalError: FertilizerSourceAdapterTechnicalError,
  retryable: boolean,
): Extract<FertilizerSourceAdapterResult, { status: 'unavailable' }> {
  return {
    adapterType,
    status: 'unavailable',
    sourceId,
    sourceType,
    sourceCategory,
    sourceRef,
    retrievedAt,
    technicalError,
    retryable,
  }
}

export function buildUserProvidedFailedResult(
  adapterType: FertilizerSourceAdapterType,
  sourceId: string,
  sourceRef: string | null,
  retrievedAt: string,
  sourceCategory: FertilizerEnrichmentSourceCategory,
  sourceType: FertilizerSourceAdapterSourceType,
  technicalError: FertilizerSourceAdapterTechnicalError,
  retryable: boolean,
): Extract<FertilizerSourceAdapterResult, { status: 'failed' }> {
  return {
    adapterType,
    status: 'failed',
    sourceId,
    sourceType,
    sourceCategory,
    sourceRef,
    retrievedAt,
    technicalError,
    retryable,
  }
}

export function mapResolveFailureToAdapterResult(
  adapterType: FertilizerSourceAdapterType,
  sourceId: string,
  sourceRef: string,
  retrievedAt: string,
  sourceCategory: FertilizerEnrichmentSourceCategory,
  sourceType: FertilizerSourceAdapterSourceType,
  failure: FertilizerUserProvidedSourceResolveFailure,
): FertilizerSourceAdapterResult {
  if (failure.errorCode === 'unsupported_source') {
    return buildUserProvidedInvalidSourceResult(
      adapterType,
      sourceId,
      sourceRef,
      retrievedAt,
      sourceCategory,
      sourceType,
    )
  }

  if (failure.errorCode === 'invalid_document') {
    return buildUserProvidedFailedResult(
      adapterType,
      sourceId,
      sourceRef,
      retrievedAt,
      sourceCategory,
      sourceType,
      createUserProvidedTechnicalError(
        adapterType,
        'invalid_document',
        failure.retryable,
        sourceId,
      ),
      failure.retryable,
    )
  }

  const code =
    failure.errorCode === 'unknown_adapter_error' ? 'unknown_adapter_error' : failure.errorCode

  return buildUserProvidedUnavailableResult(
    adapterType,
    sourceId,
    sourceRef,
    retrievedAt,
    sourceCategory,
    sourceType,
    createUserProvidedTechnicalError(adapterType, code, failure.retryable, sourceId),
    failure.retryable,
  )
}

export function parseUserProvidedDeclarationText(
  text: string,
  expectedIdentity: FertilizerEnrichmentIdentity,
  options: { requireManufacturer: boolean },
): ParsedUserProvidedDeclaration {
  const parsed = parseFertilizerDeclarationText(text)
  const extractedIdentity = extractDeclarationDocumentIdentity(text)
  const classification = classifyDeclarationAgainstIdentity(
    text,
    expectedIdentity,
    extractedIdentity,
    options,
  )

  return {
    classification,
    parsed,
    variantMatched: evaluateDeclarationVariantMatch(
      text,
      expectedIdentity,
      parsed.extractedVariant,
      classification,
    ),
    productScopeConfirmed: classification !== 'no_match',
  }
}

export function mapDeclarationParseToAdapterResult(
  adapterType: FertilizerSourceAdapterType,
  sourceCategory: FertilizerEnrichmentSourceCategory,
  sourceId: string,
  sourceRef: string,
  retrievedAt: string,
  title: string | null | undefined,
  sourceVersion: string | null,
  sourceType: FertilizerSourceAdapterSourceType,
  declaration: ParsedUserProvidedDeclaration,
): FertilizerSourceAdapterResult {
  const { classification, parsed, variantMatched, productScopeConfirmed } = declaration

  if (classification === 'no_match') {
    return buildUserProvidedNoMatchResult(
      adapterType,
      sourceId,
      sourceRef,
      retrievedAt,
      sourceCategory,
      sourceType,
    )
  }

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
    classification === 'exact_match' &&
    parsed.declarationSectionFullyCaptured &&
    parsed.documentFullyProcessed &&
    parsed.npk?.declarationBasisKnown
      ? 'success'
      : 'partial'

  return {
    adapterType,
    status,
    sourceId,
    sourceType,
    sourceCategory,
    sourceRef,
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
        variantMatched,
        productScopeConfirmed,
        coverageNotes: parsed.documentFullyProcessed ? null : 'source_incomplete',
      },
      evidence,
    },
  }
}

export function isImageOnlyWithoutText(payload: FertilizerUserProvidedSourceResolveSuccess): boolean {
  return payload.mediaKind === 'image' && !(payload.text?.trim())
}

export function isUnsupportedUserDocumentMedia(
  payload: FertilizerUserProvidedSourceResolveSuccess,
): boolean {
  return payload.mediaKind === 'image' || payload.mediaKind === 'unsupported'
}

export function defaultUserProvidedSourceId(adapterType: FertilizerSourceAdapterType, reference: string): string {
  return `${adapterType}:${reference}`
}
