import type { FertilizerEnrichmentSourceHint } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerEnrichmentAdapterCompositionDependencies } from './fertilizerEnrichmentAdapterCompositionCore'
import { fetchExternalManufacturerDocument } from './fertilizerEnrichmentHttpManufacturerFetchCore'
import type { FertilizerEnrichmentSourceStorage } from './fertilizerEnrichmentSourceStorageCore'
import { createFertilizerEnrichmentStoredSourceAdapterDependencies } from './fertilizerEnrichmentStoredSourceResolverCore'
import { isExternalSourceReference } from './fertilizerEnrichmentStorageLocatorCore'

function defaultNow(): string {
  return new Date().toISOString()
}

function readReferenceId(hint: FertilizerEnrichmentSourceHint): string | null {
  const referenceId = hint.referenceId?.trim()
  if (referenceId) {
    return referenceId
  }

  const sourceUrl = hint.sourceUrl?.trim()
  if (sourceUrl && !isExternalSourceReference(sourceUrl)) {
    return sourceUrl
  }

  return null
}

export function createFertilizerEnrichmentProductionAdapterDependencies(options: {
  storage?: FertilizerEnrichmentSourceStorage | null
  now?: () => string
} = {}): FertilizerEnrichmentAdapterCompositionDependencies {
  const now = options.now ?? defaultNow
  const stored = options.storage
    ? createFertilizerEnrichmentStoredSourceAdapterDependencies(options.storage, { now })
    : null

  return {
    fetchManufacturerDocument: async (sourceRef, context) => {
      if (stored?.fetchManufacturerDocument) {
        const storedResult = await stored.fetchManufacturerDocument(sourceRef, context)
        if (storedResult.ok || storedResult.errorCode !== 'unsupported_source') {
          return storedResult
        }
      }

      if (isExternalSourceReference(sourceRef.trim())) {
        return fetchExternalManufacturerDocument(sourceRef, { now })
      }

      return { ok: false, errorCode: 'unsupported_source', retryable: false }
    },
    resolvePackagingSource: async (hint, context) => {
      const referenceId = readReferenceId(hint)
      const inlineText = referenceId
        ? context.input.captureInlineSourceTexts?.[referenceId]?.trim()
        : null

      if (referenceId && inlineText) {
        return {
          ok: true,
          referenceId,
          contentType: 'text/plain',
          text: inlineText,
          providedAt: now(),
          mediaKind: 'text',
        }
      }

      if (stored?.resolvePackagingSource) {
        return stored.resolvePackagingSource(hint, context)
      }

      return { ok: false, errorCode: 'unsupported_source', retryable: false }
    },
    resolveUserDocumentSource: async (hint, context) => {
      const referenceId = readReferenceId(hint)
      const inlineText = referenceId
        ? context.input.captureInlineSourceTexts?.[referenceId]?.trim()
        : null

      if (referenceId && inlineText) {
        return {
          ok: true,
          referenceId,
          contentType: 'text/plain',
          text: inlineText,
          providedAt: now(),
          mediaKind: 'text',
        }
      }

      if (stored?.resolveUserDocumentSource) {
        return stored.resolveUserDocumentSource(hint, context)
      }

      return { ok: false, errorCode: 'unsupported_source', retryable: false }
    },
  }
}
