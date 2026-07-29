import type {
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentSourceHint,
  FertilizerSourceAdapterResult,
  FertilizerSourceAdapterSourceType,
} from '../types/fertilizerEnrichmentOrchestration'
import { FertilizerDeclarationTextParserError } from './fertilizerDeclarationTextParserCore'
import type { FertilizerSourceAdapter, FertilizerSourceAdapterContext } from './fertilizerEnrichmentOrchestrationCore'
import { rethrowIfContractError } from './fertilizerEnrichmentOrchestrationCore'
import {
  buildUserProvidedFailedResult,
  buildUserProvidedInvalidSourceResult,
  buildUserProvidedNoMatchResult,
  createUserProvidedTechnicalError,
  defaultUserProvidedSourceId,
  FERTILIZER_USER_PROVIDED_SOURCE_UNEXPECTED_FAILURE_MESSAGE,
  isImageOnlyWithoutText,
  mapDeclarationParseToAdapterResult,
  mapResolveFailureToAdapterResult,
  mapUserProvidedContentTypeToSourceType,
  parseUserProvidedDeclarationText,
  resolveAdapterSourceReference,
  selectAdapterSourceHint,
  type FertilizerUserProvidedSourceResolveResult,
} from './fertilizerUserProvidedSourceAdapterCore'

export const FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE = 'packaging' as const

const PACKAGING_SOURCE_CATEGORY = 'packaging_evidence' as const
const DEFAULT_SOURCE_TYPE: FertilizerSourceAdapterSourceType = 'packaging_image'

export interface FertilizerPackagingSourceAdapterDependencies {
  resolvePackagingSource: (
    hint: FertilizerEnrichmentSourceHint,
    context: {
      input: FertilizerEnrichmentOrchestrationInput
      orchestrationRunId: string
      attempt: number
    },
  ) => Promise<FertilizerUserProvidedSourceResolveResult>
  now?: () => string
  createSourceId?: (reference: string) => string
}

function defaultNow(): string {
  return new Date().toISOString()
}

export function selectPackagingSourceHint(
  input: FertilizerEnrichmentOrchestrationInput,
): FertilizerEnrichmentSourceHint | null {
  return selectAdapterSourceHint(input, FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE)
}

export async function runFertilizerPackagingSourceAdapter(
  context: FertilizerSourceAdapterContext,
  dependencies: FertilizerPackagingSourceAdapterDependencies,
): Promise<FertilizerSourceAdapterResult> {
  const now = dependencies.now ?? defaultNow
  const retrievedAt = now()
  const hint = selectPackagingSourceHint(context.input)

  if (!hint) {
    return buildUserProvidedNoMatchResult(
      FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
      'packaging:no-reference',
      null,
      retrievedAt,
      PACKAGING_SOURCE_CATEGORY,
      DEFAULT_SOURCE_TYPE,
    )
  }

  const sourceRef = resolveAdapterSourceReference(hint)
  if (!sourceRef) {
    return buildUserProvidedNoMatchResult(
      FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
      'packaging:no-reference',
      null,
      retrievedAt,
      PACKAGING_SOURCE_CATEGORY,
      DEFAULT_SOURCE_TYPE,
    )
  }

  const sourceId =
    dependencies.createSourceId?.(sourceRef) ??
    defaultUserProvidedSourceId(FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE, sourceRef)

  try {
    const resolved = await dependencies.resolvePackagingSource(hint, {
      input: context.input,
      orchestrationRunId: context.orchestrationRunId,
      attempt: context.attempt,
    })

    if (!resolved.ok) {
      return mapResolveFailureToAdapterResult(
        FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
        sourceId,
        sourceRef,
        retrievedAt,
        PACKAGING_SOURCE_CATEGORY,
        DEFAULT_SOURCE_TYPE,
        resolved,
      )
    }

    const sourceType =
      mapUserProvidedContentTypeToSourceType(resolved.contentType, 'packaging') ??
      (resolved.text?.trim() ? 'packaging_label_text' : null)

    if (!sourceType) {
      return buildUserProvidedInvalidSourceResult(
        FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
        sourceId,
        sourceRef,
        retrievedAt,
        PACKAGING_SOURCE_CATEGORY,
        DEFAULT_SOURCE_TYPE,
      )
    }

    const packagingText = resolved.text ?? ''
    const hasParseablePayload = packagingText.length > 0

    if (!hasParseablePayload && isImageOnlyWithoutText(resolved)) {
      return buildUserProvidedInvalidSourceResult(
        FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
        sourceId,
        sourceRef,
        retrievedAt,
        PACKAGING_SOURCE_CATEGORY,
        'packaging_image',
      )
    }

    if (!hasParseablePayload) {
      return buildUserProvidedInvalidSourceResult(
        FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
        sourceId,
        sourceRef,
        retrievedAt,
        PACKAGING_SOURCE_CATEGORY,
        sourceType,
      )
    }

    // Packaging labels may omit manufacturer name when the source reference is already product-scoped.
    const declaration = parseUserProvidedDeclarationText(packagingText, context.input.identity, {
      requireManufacturer: false,
    })

    return mapDeclarationParseToAdapterResult(
      FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
      PACKAGING_SOURCE_CATEGORY,
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
        FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
        sourceId,
        sourceRef,
        retrievedAt,
        PACKAGING_SOURCE_CATEGORY,
        DEFAULT_SOURCE_TYPE,
        createUserProvidedTechnicalError(
          FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
          'parser_error',
          false,
          sourceId,
        ),
        false,
      )
    }

    return buildUserProvidedFailedResult(
      FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
      sourceId,
      sourceRef,
      retrievedAt,
      PACKAGING_SOURCE_CATEGORY,
      DEFAULT_SOURCE_TYPE,
      createUserProvidedTechnicalError(
        FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
        'unknown_adapter_error',
        false,
        sourceId,
        FERTILIZER_USER_PROVIDED_SOURCE_UNEXPECTED_FAILURE_MESSAGE,
      ),
      false,
    )
  }
}

export function createFertilizerPackagingSourceAdapter(
  dependencies: FertilizerPackagingSourceAdapterDependencies,
): FertilizerSourceAdapter {
  return {
    adapterType: FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
    run: (context) => runFertilizerPackagingSourceAdapter(context, dependencies),
  }
}
