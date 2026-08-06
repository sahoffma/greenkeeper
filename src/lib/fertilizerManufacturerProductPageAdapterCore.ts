import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerSourceAdapterResult } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerManufacturerDocumentFetchResult } from './fertilizerManufacturerProductDocumentAdapterCore'
import {
  FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE,
  resolveManufacturerProductDocumentUrl,
} from './fertilizerManufacturerProductDocumentAdapterCore'
import type { FertilizerSourceAdapter, FertilizerSourceAdapterContext } from './fertilizerEnrichmentOrchestrationCore'
import { rethrowIfContractError } from './fertilizerEnrichmentOrchestrationCore'
import {
  isProductIdentityCompleteForResearch,
  runAutomaticManufacturerResearch,
  type FertilizerManufacturerResearchSearchProvider,
} from './fertilizerManufacturerResearchCore'

export const FERTILIZER_MANUFACTURER_PRODUCT_PAGE_ADAPTER_TYPE =
  'manufacturer_product_page' as const

export interface FertilizerManufacturerProductPageAdapterDependencies {
  fetchDocument: (
    sourceUrl: string,
    context: {
      input: FertilizerEnrichmentOrchestrationInput
      orchestrationRunId: string
      attempt: number
    },
  ) => Promise<FertilizerManufacturerDocumentFetchResult>
  searchProvider?: FertilizerManufacturerResearchSearchProvider | null
  now?: () => string
}

function defaultNow(): string {
  return new Date().toISOString()
}

function buildNoMatchResult(retrievedAt: string): Extract<FertilizerSourceAdapterResult, { status: 'no_match' }> {
  return {
    adapterType: FERTILIZER_MANUFACTURER_PRODUCT_PAGE_ADAPTER_TYPE,
    status: 'no_match',
    sourceId: 'manufacturer-page:no-match',
    sourceType: 'web_page',
    sourceCategory: 'official_document',
    sourceUrl: null,
    retrievedAt,
    reasonCode: 'no_match',
  }
}

function collectHintedUrls(input: FertilizerEnrichmentOrchestrationInput): string[] {
  const urls = new Set<string>()

  for (const hint of input.sourceHints ?? []) {
    const sourceUrl = hint.sourceUrl?.trim()
    if (sourceUrl) {
      urls.add(sourceUrl)
    }
  }

  const documentUrl = resolveManufacturerProductDocumentUrl(input)
  if (documentUrl) {
    urls.add(documentUrl)
  }

  return [...urls]
}

function resolveNpkLabel(input: FertilizerEnrichmentOrchestrationInput): string | null {
  const basis = input.captureRecognitionPackagingBasis
  if (!basis?.npk) {
    return input.identity.variant?.trim() ?? null
  }

  return `${basis.npk.nitrogen}-${basis.npk.phosphate}-${basis.npk.potash}`
}

function resolvePackageSizeLabel(input: FertilizerEnrichmentOrchestrationInput): string | null {
  const basis = input.captureRecognitionPackagingBasis
  if (basis?.packageSizeValue == null) {
    return null
  }

  return `${basis.packageSizeValue} ${basis.packageSizeUnit ?? 'kg'}`.trim()
}

export async function runFertilizerManufacturerProductPageAdapter(
  context: FertilizerSourceAdapterContext,
  dependencies: FertilizerManufacturerProductPageAdapterDependencies,
): Promise<FertilizerSourceAdapterResult> {
  const now = dependencies.now ?? defaultNow
  const retrievedAt = now()

  if (!isProductIdentityCompleteForResearch(context.input.identity)) {
    return buildNoMatchResult(retrievedAt)
  }

  const priorManufacturerDocument = [...context.successfulResults, ...context.partialResults].find(
    (result) =>
      result.adapterType === FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE &&
      (result.status === 'success' || result.status === 'partial') &&
      result.extraction?.coverageMetadata?.nutrientSectionFullyCaptured,
  )

  if (priorManufacturerDocument) {
    return buildNoMatchResult(retrievedAt)
  }

  try {
    const research = await runAutomaticManufacturerResearch({
      identity: context.input.identity,
      hintedUrls: collectHintedUrls(context.input),
      npkLabel: resolveNpkLabel(context.input),
      packageSizeLabel: resolvePackageSizeLabel(context.input),
      searchProvider: dependencies.searchProvider ?? null,
      fetchProvider: {
        fetchSource: (url) =>
          dependencies.fetchDocument(url, {
            input: context.input,
            orchestrationRunId: context.orchestrationRunId,
            attempt: context.attempt,
          }),
      },
      now,
    })

    context.input.manufacturerResearchDiagnostics = research.diagnostics

    if (research.adapterResult) {
      return research.adapterResult
    }

    return buildNoMatchResult(retrievedAt)
  } catch (error) {
    rethrowIfContractError(error)
    return buildNoMatchResult(retrievedAt)
  }
}

export function createFertilizerManufacturerProductPageAdapter(
  dependencies: FertilizerManufacturerProductPageAdapterDependencies,
): FertilizerSourceAdapter {
  return {
    adapterType: FERTILIZER_MANUFACTURER_PRODUCT_PAGE_ADAPTER_TYPE,
    run: (context) => runFertilizerManufacturerProductPageAdapter(context, dependencies),
  }
}
