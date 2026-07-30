import type {
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentSourceHint,
} from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerEnrichmentAdapterCompositionDependencies } from './fertilizerEnrichmentAdapterCompositionCore'
import type {
  FertilizerManufacturerDocumentFetchFailure,
  FertilizerManufacturerDocumentFetchResult,
} from './fertilizerManufacturerProductDocumentAdapterCore'
import {
  FertilizerEnrichmentSourceStorageError,
  type FertilizerEnrichmentSourceStorage,
} from './fertilizerEnrichmentSourceStorageCore'
import {
  getFertilizerEnrichmentSourceAccessScope,
  type FertilizerEnrichmentSourceAccessScope,
} from './fertilizerEnrichmentSourceAccessScopeCore'
import {
  assertManufacturerScopedStorageObjectPath,
  assertUserScopedStorageObjectPath,
  buildFertilizerEnrichmentManufacturerSourceObjectPath,
  buildFertilizerEnrichmentUserSourceObjectPath,
  isExternalSourceReference,
  isFertilizerEnrichmentStorageLocator,
  parseFertilizerEnrichmentStorageLocator,
} from './fertilizerEnrichmentStorageLocatorCore'
import type {
  FertilizerUserProvidedSourceResolveFailure,
  FertilizerUserProvidedSourceResolveResult,
} from './fertilizerUserProvidedSourceAdapterCore'

function defaultRetrievedAt(): string {
  return new Date().toISOString()
}

function mapStorageErrorToManufacturerFailure(
  error: unknown,
): FertilizerManufacturerDocumentFetchFailure {
  if (error instanceof FertilizerEnrichmentSourceStorageError) {
    const errorCode =
      error.code === 'timeout'
        ? 'timeout'
        : error.code === 'source_not_found'
          ? 'source_not_found'
          : error.code === 'unsupported_source'
            ? 'unsupported_source'
            : error.code === 'invalid_document'
              ? 'invalid_document'
              : 'unknown_adapter_error'

    return {
      ok: false,
      errorCode,
      retryable: error.retryable,
    }
  }

  return {
    ok: false,
    errorCode: 'unknown_adapter_error',
    retryable: false,
  }
}

function mapStorageErrorToUserProvidedFailure(
  error: unknown,
): FertilizerUserProvidedSourceResolveFailure {
  if (error instanceof FertilizerEnrichmentSourceStorageError) {
    return {
      ok: false,
      errorCode: error.code,
      retryable: error.retryable,
    }
  }

  return {
    ok: false,
    errorCode: 'unknown_adapter_error',
    retryable: false,
  }
}

function resolveManufacturerSourceObjectPath(reference: string): string | null {
  const trimmed = reference.trim()
  if (!trimmed || isExternalSourceReference(trimmed)) {
    return null
  }

  const parsed = parseFertilizerEnrichmentStorageLocator(trimmed)
  if (parsed.status === 'invalid') {
    return null
  }

  if (isFertilizerEnrichmentStorageLocator(trimmed)) {
    return assertManufacturerScopedStorageObjectPath(parsed.objectPath) ? parsed.objectPath : null
  }

  try {
    return buildFertilizerEnrichmentManufacturerSourceObjectPath(trimmed)
  } catch {
    return null
  }
}

function resolveScopedUserSourceObjectPath(
  referenceId: string,
  scope: FertilizerEnrichmentSourceAccessScope,
): string | null {
  const trimmed = referenceId.trim()
  if (!trimmed || isExternalSourceReference(trimmed)) {
    return null
  }

  const parsed = parseFertilizerEnrichmentStorageLocator(trimmed)
  if (parsed.status === 'invalid') {
    return null
  }

  if (isFertilizerEnrichmentStorageLocator(trimmed)) {
    if (scope.kind === 'authenticated_user') {
      return assertUserScopedStorageObjectPath(parsed.objectPath, 'users', scope.userId)
        ? parsed.objectPath
        : null
    }

    return assertUserScopedStorageObjectPath(parsed.objectPath, 'sessions', scope.sessionAccessHash)
      ? parsed.objectPath
      : null
  }

  try {
    if (scope.kind === 'authenticated_user') {
      return buildFertilizerEnrichmentUserSourceObjectPath('users', scope.userId, trimmed)
    }

    return buildFertilizerEnrichmentUserSourceObjectPath(
      'sessions',
      scope.sessionAccessHash,
      trimmed,
    )
  } catch {
    return null
  }
}

function readScopedReferenceId(hint: FertilizerEnrichmentSourceHint): string | null {
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

export function createFertilizerEnrichmentStoredSourceAdapterDependencies(
  storage: FertilizerEnrichmentSourceStorage,
  options: { now?: () => string } = {},
): FertilizerEnrichmentAdapterCompositionDependencies {
  const now = options.now ?? defaultRetrievedAt

  async function fetchManufacturerDocument(
    sourceRef: string,
    _context: {
      input: FertilizerEnrichmentOrchestrationInput
      orchestrationRunId: string
      attempt: number
    },
  ): Promise<FertilizerManufacturerDocumentFetchResult> {
    if (isExternalSourceReference(sourceRef.trim())) {
      return {
        ok: false,
        errorCode: 'unsupported_source',
        retryable: false,
      }
    }

    const objectPath = resolveManufacturerSourceObjectPath(sourceRef)
    if (!objectPath) {
      return {
        ok: false,
        errorCode: 'unsupported_source',
        retryable: false,
      }
    }

    try {
      const loaded = await storage.loadTextObject(objectPath)
      const retrievedAt = now()

      if (!loaded.text?.trim()) {
        return {
          ok: false,
          errorCode: 'invalid_document',
          retryable: false,
        }
      }

      return {
        ok: true,
        finalUrl: sourceRef.trim(),
        contentType: loaded.contentType,
        text: loaded.text,
        retrievedAt,
        etag: loaded.etag ?? null,
        lastModified: null,
        statusCode: 200,
      }
    } catch (error) {
      return mapStorageErrorToManufacturerFailure(error)
    }
  }

  async function resolveUserScopedTextSource(
    hint: FertilizerEnrichmentSourceHint,
    _context: {
      input: FertilizerEnrichmentOrchestrationInput
      orchestrationRunId: string
      attempt: number
    },
  ): Promise<FertilizerUserProvidedSourceResolveResult> {
    const sourceUrl = hint.sourceUrl?.trim()
    if (sourceUrl && isExternalSourceReference(sourceUrl)) {
      return {
        ok: false,
        errorCode: 'unsupported_source',
        retryable: false,
      }
    }

    const referenceId = readScopedReferenceId(hint)
    if (!referenceId) {
      return {
        ok: false,
        errorCode: 'unsupported_source',
        retryable: false,
      }
    }

    const scope = getFertilizerEnrichmentSourceAccessScope()
    if (!scope) {
      return {
        ok: false,
        errorCode: 'unsupported_source',
        retryable: false,
      }
    }

    const objectPath = resolveScopedUserSourceObjectPath(referenceId, scope)
    if (!objectPath) {
      return {
        ok: false,
        errorCode: 'unsupported_source',
        retryable: false,
      }
    }

    try {
      const loaded = await storage.loadTextObject(objectPath)

      if (!loaded.text?.trim()) {
        return {
          ok: false,
          errorCode: 'invalid_document',
          retryable: false,
        }
      }

      return {
        ok: true,
        referenceId,
        contentType: loaded.contentType,
        text: loaded.text,
        providedAt: now(),
        mediaKind: 'text',
      }
    } catch (error) {
      return mapStorageErrorToUserProvidedFailure(error)
    }
  }

  async function resolveUserDocumentSource(
    hint: FertilizerEnrichmentSourceHint,
    context: {
      input: FertilizerEnrichmentOrchestrationInput
      orchestrationRunId: string
      attempt: number
    },
  ): Promise<FertilizerUserProvidedSourceResolveResult> {
    return resolveUserScopedTextSource(hint, context)
  }

  async function resolvePackagingSource(
    hint: FertilizerEnrichmentSourceHint,
    _context: {
      input: FertilizerEnrichmentOrchestrationInput
      orchestrationRunId: string
      attempt: number
    },
  ): Promise<FertilizerUserProvidedSourceResolveResult> {
    const sourceUrl = hint.sourceUrl?.trim()
    if (sourceUrl && isExternalSourceReference(sourceUrl)) {
      return {
        ok: false,
        errorCode: 'unsupported_source',
        retryable: false,
      }
    }

    const referenceId = readScopedReferenceId(hint)
    if (!referenceId) {
      return {
        ok: false,
        errorCode: 'unsupported_source',
        retryable: false,
      }
    }

    const scope = getFertilizerEnrichmentSourceAccessScope()
    if (!scope) {
      return {
        ok: false,
        errorCode: 'unsupported_source',
        retryable: false,
      }
    }

    const objectPath = resolveScopedUserSourceObjectPath(referenceId, scope)
    if (!objectPath) {
      return {
        ok: false,
        errorCode: 'unsupported_source',
        retryable: false,
      }
    }

    try {
      const loaded = await storage.loadTextObject(objectPath)

      if (!isAllowedPackagingLabelTextContentType(loaded.contentType)) {
        return {
          ok: false,
          errorCode: 'unsupported_source',
          retryable: false,
        }
      }

      if (!loaded.text?.trim()) {
        return {
          ok: false,
          errorCode: 'invalid_document',
          retryable: false,
        }
      }

      return {
        ok: true,
        referenceId,
        contentType: loaded.contentType,
        text: loaded.text,
        providedAt: now(),
        mediaKind: 'text',
      }
    } catch (error) {
      return mapStorageErrorToUserProvidedFailure(error)
    }
  }

  return {
    fetchManufacturerDocument,
    resolveUserDocumentSource,
    resolvePackagingSource,
  }
}

function isAllowedPackagingLabelTextContentType(contentType: string): boolean {
  return contentType.trim().toLowerCase().split(';')[0]?.trim() === 'text/plain'
}
