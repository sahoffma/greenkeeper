import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerEnrichmentSourceHint } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerManufacturerDocumentFetchResult } from './fertilizerManufacturerProductDocumentAdapterCore'
import { createFertilizerManufacturerProductDocumentAdapter } from './fertilizerManufacturerProductDocumentAdapterCore'
import { createFertilizerManufacturerProductPageAdapter } from './fertilizerManufacturerProductPageAdapterCore'
import type { FertilizerManufacturerResearchSearchProvider } from './fertilizerManufacturerResearchCore'
import { createFertilizerPackagingSourceAdapter } from './fertilizerPackagingSourceAdapterCore'
import { createFertilizerUserDocumentAdapter } from './fertilizerUserDocumentAdapterCore'
import type { OrchestrateFertilizerEnrichmentDependencies } from './fertilizerEnrichmentOrchestrationCore'
import type { FertilizerUserProvidedSourceResolveResult } from './fertilizerUserProvidedSourceAdapterCore'

export interface FertilizerEnrichmentAdapterCompositionDependencies {
  fetchManufacturerDocument?: (
    sourceUrl: string,
    context: {
      input: FertilizerEnrichmentOrchestrationInput
      orchestrationRunId: string
      attempt: number
    },
  ) => Promise<FertilizerManufacturerDocumentFetchResult>
  manufacturerResearchSearchProvider?: FertilizerManufacturerResearchSearchProvider | null
  resolveUserDocumentSource?: (
    hint: FertilizerEnrichmentSourceHint,
    context: {
      input: FertilizerEnrichmentOrchestrationInput
      orchestrationRunId: string
      attempt: number
    },
  ) => Promise<FertilizerUserProvidedSourceResolveResult>
  resolvePackagingSource?: (
    hint: FertilizerEnrichmentSourceHint,
    context: {
      input: FertilizerEnrichmentOrchestrationInput
      orchestrationRunId: string
      attempt: number
    },
  ) => Promise<FertilizerUserProvidedSourceResolveResult>
}

function createProductionFastPathAssessment(): OrchestrateFertilizerEnrichmentDependencies['assessFastPath'] {
  return () => ({
    decision: 'ineligible',
    profilePresent: false,
    identityMatch: false,
    variantMatch: false,
    enrichmentVersionCompatible: false,
    normalizationVersionCompatible: false,
    readinessVersionCompatible: false,
    matrixComplete: false,
    provenanceComplete: false,
    hasBlockingConflicts: false,
    staleness: 'unknown',
  })
}

export function createFertilizerEnrichmentOrchestrationDependencies(
  dependencies: FertilizerEnrichmentAdapterCompositionDependencies = {},
): OrchestrateFertilizerEnrichmentDependencies {
  const adapters: OrchestrateFertilizerEnrichmentDependencies['adapters'] = []

  if (dependencies.fetchManufacturerDocument) {
    adapters.push(
      createFertilizerManufacturerProductDocumentAdapter({
        fetchDocument: (sourceUrl, context) =>
          dependencies.fetchManufacturerDocument!(sourceUrl, context),
      }),
    )

    adapters.push(
      createFertilizerManufacturerProductPageAdapter({
        fetchDocument: (sourceUrl, context) =>
          dependencies.fetchManufacturerDocument!(sourceUrl, context),
        searchProvider: dependencies.manufacturerResearchSearchProvider ?? null,
      }),
    )
  }

  if (dependencies.resolveUserDocumentSource) {
    adapters.push(
      createFertilizerUserDocumentAdapter({
        resolveUserDocumentSource: (hint, context) =>
          dependencies.resolveUserDocumentSource!(hint, context),
      }),
    )
  }

  if (dependencies.resolvePackagingSource) {
    adapters.push(
      createFertilizerPackagingSourceAdapter({
        resolvePackagingSource: (hint, context) =>
          dependencies.resolvePackagingSource!(hint, context),
      }),
    )
  }

  return {
    adapters,
    assessFastPath: createProductionFastPathAssessment(),
  }
}
