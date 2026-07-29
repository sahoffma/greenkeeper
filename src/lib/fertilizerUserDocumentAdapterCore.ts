import type {
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentSourceHint,
  FertilizerSourceAdapterResult,
  FertilizerSourceAdapterSourceType,
} from '../types/fertilizerEnrichmentOrchestration'
import { FertilizerDeclarationTextParserError } from './fertilizerDeclarationTextParserCore'
import type { FertilizerSourceAdapter, FertilizerSourceAdapterContext } from './fertilizerEnrichmentOrchestrationCore'
import { rethrowIfContractError } from './fertilizerEnrichmentOrchestrationCore'
import { mapValidatedContentTypeToAdapterSourceType } from './fertilizerManufacturerProductDocumentAdapterCore'
import {
  buildUserProvidedFailedResult,
  buildUserProvidedInvalidSourceResult,
  buildUserProvidedNoMatchResult,
  createUserProvidedTechnicalError,
  defaultUserProvidedSourceId,
  FERTILIZER_USER_PROVIDED_SOURCE_UNEXPECTED_FAILURE_MESSAGE,
  isUnsupportedUserDocumentMedia,
  mapDeclarationParseToAdapterResult,
  mapResolveFailureToAdapterResult,
  mapUserProvidedContentTypeToSourceType,
  parseUserProvidedDeclarationText,
  resolveAdapterSourceReference,
  selectAdapterSourceHint,
  type FertilizerUserProvidedDocumentTextExtractionInput,
  type FertilizerUserProvidedSourceResolveResult,
} from './fertilizerUserProvidedSourceAdapterCore'

export const FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE = 'user_document' as const

const USER_DOCUMENT_SOURCE_CATEGORY = 'user_provided' as const
const DEFAULT_SOURCE_TYPE: FertilizerSourceAdapterSourceType = 'user_upload'

export interface FertilizerUserDocumentAdapterDependencies {
  resolveUserDocumentSource: (
    hint: FertilizerEnrichmentSourceHint,
    context: {
      input: FertilizerEnrichmentOrchestrationInput
      orchestrationRunId: string
      attempt: number
    },
  ) => Promise<FertilizerUserProvidedSourceResolveResult>
  extractDocumentText?: (
    input: FertilizerUserProvidedDocumentTextExtractionInput,
  ) => Promise<string>
  now?: () => string
  createSourceId?: (reference: string) => string
}

function defaultNow(): string {
  return new Date().toISOString()
}

export function selectUserDocumentSourceHint(
  input: FertilizerEnrichmentOrchestrationInput,
): FertilizerEnrichmentSourceHint | null {
  return selectAdapterSourceHint(input, FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE)
}

function resolveSourceType(contentType: string): FertilizerSourceAdapterSourceType | null {
  return (
    mapUserProvidedContentTypeToSourceType(contentType, 'user_document') ??
    mapValidatedContentTypeToAdapterSourceType(contentType)
  )
}

export async function runFertilizerUserDocumentAdapter(
  context: FertilizerSourceAdapterContext,
  dependencies: FertilizerUserDocumentAdapterDependencies,
): Promise<FertilizerSourceAdapterResult> {
  const now = dependencies.now ?? defaultNow
  const retrievedAt = now()
  const hint = selectUserDocumentSourceHint(context.input)

  if (!hint) {
    return buildUserProvidedNoMatchResult(
      FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
      'user-document:no-reference',
      null,
      retrievedAt,
      USER_DOCUMENT_SOURCE_CATEGORY,
      DEFAULT_SOURCE_TYPE,
    )
  }

  const sourceRef = resolveAdapterSourceReference(hint)
  if (!sourceRef) {
    return buildUserProvidedNoMatchResult(
      FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
      'user-document:no-reference',
      null,
      retrievedAt,
      USER_DOCUMENT_SOURCE_CATEGORY,
      DEFAULT_SOURCE_TYPE,
    )
  }

  const sourceId =
    dependencies.createSourceId?.(sourceRef) ??
    defaultUserProvidedSourceId(FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE, sourceRef)

  try {
    const resolved = await dependencies.resolveUserDocumentSource(hint, {
      input: context.input,
      orchestrationRunId: context.orchestrationRunId,
      attempt: context.attempt,
    })

    if (!resolved.ok) {
      return mapResolveFailureToAdapterResult(
        FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
        sourceId,
        sourceRef,
        retrievedAt,
        USER_DOCUMENT_SOURCE_CATEGORY,
        DEFAULT_SOURCE_TYPE,
        resolved,
      )
    }

    const sourceType = resolveSourceType(resolved.contentType)
    if (!sourceType || isUnsupportedUserDocumentMedia(resolved)) {
      return buildUserProvidedInvalidSourceResult(
        FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
        sourceId,
        sourceRef,
        retrievedAt,
        USER_DOCUMENT_SOURCE_CATEGORY,
        sourceType ?? DEFAULT_SOURCE_TYPE,
      )
    }

    let documentText = resolved.text ?? ''
    if (!documentText.trim() && sourceType === 'pdf_document' && dependencies.extractDocumentText) {
      documentText = await dependencies.extractDocumentText({
        contentType: resolved.contentType,
        text: resolved.text,
        title: resolved.title,
      })
    }

    const hasParseablePayload = documentText.length > 0
    if (!hasParseablePayload && (isUnsupportedUserDocumentMedia(resolved) || !sourceType)) {
      return buildUserProvidedInvalidSourceResult(
        FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
        sourceId,
        sourceRef,
        retrievedAt,
        USER_DOCUMENT_SOURCE_CATEGORY,
        sourceType ?? DEFAULT_SOURCE_TYPE,
      )
    }

    if (!hasParseablePayload) {
      return buildUserProvidedInvalidSourceResult(
        FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
        sourceId,
        sourceRef,
        retrievedAt,
        USER_DOCUMENT_SOURCE_CATEGORY,
        sourceType,
      )
    }

    const declaration = parseUserProvidedDeclarationText(documentText, context.input.identity, {
      requireManufacturer: true,
    })

    return mapDeclarationParseToAdapterResult(
      FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
      USER_DOCUMENT_SOURCE_CATEGORY,
      sourceId,
      sourceRef,
      resolved.providedAt || retrievedAt,
      resolved.title,
      resolved.contentHash ?? null,
      sourceType,
      declaration,
    )
  } catch (error) {
    rethrowIfContractError(error)

    if (error instanceof FertilizerDeclarationTextParserError) {
      return buildUserProvidedFailedResult(
        FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
        sourceId,
        sourceRef,
        retrievedAt,
        USER_DOCUMENT_SOURCE_CATEGORY,
        DEFAULT_SOURCE_TYPE,
        createUserProvidedTechnicalError(
          FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
          'parser_error',
          false,
          sourceId,
        ),
        false,
      )
    }

    return buildUserProvidedFailedResult(
      FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
      sourceId,
      sourceRef,
      retrievedAt,
      USER_DOCUMENT_SOURCE_CATEGORY,
      DEFAULT_SOURCE_TYPE,
      createUserProvidedTechnicalError(
        FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
        'unknown_adapter_error',
        false,
        sourceId,
        FERTILIZER_USER_PROVIDED_SOURCE_UNEXPECTED_FAILURE_MESSAGE,
      ),
      false,
    )
  }
}

export function createFertilizerUserDocumentAdapter(
  dependencies: FertilizerUserDocumentAdapterDependencies,
): FertilizerSourceAdapter {
  return {
    adapterType: FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
    run: (context) => runFertilizerUserDocumentAdapter(context, dependencies),
  }
}
