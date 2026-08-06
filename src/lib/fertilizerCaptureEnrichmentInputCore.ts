import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type {
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentSourceHint,
} from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerCaptureDraft } from './fertilizerCaptureCore'
import { appendCaptureRecognitionPackagingToEnrichmentInput } from './fertilizerCaptureRecognitionPackagingCore'
import {
  buildRecognitionIdentityFingerprint,
  fingerprintFromCandidate,
  fingerprintFromRecognitionResult,
} from './fertilizerInventoryCore'
import {
  prepareCaptureDraftForEnrichment,
  resolveRecognitionManufacturer,
  buildCaptureDraftPackageDiagnostics,
} from './fertilizerRecognitionEnrichmentBasisCore'

export const FERTILIZER_CAPTURE_ENRICHMENT_INPUT_BUILDER_PATH = 'canonical_capture' as const
export type FertilizerCaptureEnrichmentInputBuilderPath =
  | typeof FERTILIZER_CAPTURE_ENRICHMENT_INPUT_BUILDER_PATH
  | 'legacy_capture'
  | 'unknown'

export class FertilizerCaptureEnrichmentInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FertilizerCaptureEnrichmentInputError'
  }
}

function requireIdentityFingerprint(fingerprint: string | null): string {
  if (!fingerprint?.trim()) {
    throw new FertilizerCaptureEnrichmentInputError(
      'Das Produkt konnte nicht eindeutig für die Anreicherung bestimmt werden.',
    )
  }

  return fingerprint.trim()
}

function identityFromRecognition(draft: FertilizerCaptureDraft): FertilizerEnrichmentIdentity {
  const result = draft.recognitionResult
  if (!result) {
    throw new FertilizerCaptureEnrichmentInputError('Erkennungsergebnis fehlt.')
  }

  const recognition = result.recognition

  const fingerprint = requireIdentityFingerprint(fingerprintFromRecognitionResult(result))

  return {
    manufacturer: resolveRecognitionManufacturer({
      manufacturer: recognition.manufacturer.normalizedValue,
      brand: recognition.brand.normalizedValue,
    }),
    officialName: recognition.productName.normalizedValue,
    productLine: recognition.productLine.normalizedValue,
    variant: recognition.variant.normalizedValue,
    identityFingerprint: fingerprint,
    identityConfidence: result.identityConfidence,
    hasIdentityAmbiguity: result.status !== 'identified',
  }
}

function identityFromCandidate(draft: FertilizerCaptureDraft): FertilizerEnrichmentIdentity {
  const candidate = draft.recognitionCandidate
  if (!candidate) {
    throw new FertilizerCaptureEnrichmentInputError('Erkennungskandidat fehlt.')
  }

  const fingerprint = requireIdentityFingerprint(fingerprintFromCandidate(candidate))

  return {
    manufacturer: resolveRecognitionManufacturer({
      manufacturer:
        candidate.manufacturer?.value != null ? String(candidate.manufacturer.value) : null,
      brand: candidate.brand?.value != null ? String(candidate.brand.value) : null,
    }),
    officialName: candidate.productName?.value != null ? String(candidate.productName.value) : null,
    productLine: candidate.productLine?.value != null ? String(candidate.productLine.value) : null,
    variant: candidate.variant?.value != null ? String(candidate.variant.value) : null,
    identityFingerprint: fingerprint,
    identityConfidence: candidate.identityConfidence ?? 0,
    hasIdentityAmbiguity: false,
  }
}

function identityFromCatalogProduct(draft: FertilizerCaptureDraft): FertilizerEnrichmentIdentity {
  const product = draft.selectedProduct
  if (!product) {
    throw new FertilizerCaptureEnrichmentInputError('Katalogprodukt fehlt.')
  }

  const fingerprint = requireIdentityFingerprint(
    buildRecognitionIdentityFingerprint({
      brand: product.manufacturer,
      productName: product.name,
    }),
  )

  return {
    manufacturer: product.manufacturer,
    officialName: product.name,
    productLine: null,
    variant: null,
    identityFingerprint: fingerprint,
    identityConfidence: 1,
    hasIdentityAmbiguity: false,
  }
}

function buildSourceHints(draft: FertilizerCaptureDraft): FertilizerEnrichmentSourceHint[] {
  const hints: FertilizerEnrichmentSourceHint[] = []

  if (draft.catalogProductId) {
    hints.push({
      catalogEntryId: draft.catalogProductId,
      hintType: 'catalog',
      adapterType: 'manufacturer_product_document',
    })
  }

  for (const source of draft.recognitionResult?.sources ?? []) {
    if (source.url?.trim()) {
      hints.push({
        sourceUrl: source.url,
        hintType: 'recognition',
        adapterType: 'manufacturer_product_document',
      })
    }
  }

  return hints
}

export function buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(
  draft: FertilizerCaptureDraft,
  options: { enrichmentIdempotencyKey: string },
): FertilizerEnrichmentOrchestrationInput {
  const preparedDraft = prepareCaptureDraftForEnrichment(draft)
  const identity = preparedDraft.recognitionResult
    ? identityFromRecognition(preparedDraft)
    : preparedDraft.recognitionCandidate
      ? identityFromCandidate(preparedDraft)
      : preparedDraft.catalogProductId && preparedDraft.selectedProduct
        ? identityFromCatalogProduct(preparedDraft)
        : null

  if (!identity) {
    throw new FertilizerCaptureEnrichmentInputError(
      'Für die Bestandsaufnahme fehlt eine eindeutige Produktidentität.',
    )
  }

  return appendCaptureRecognitionPackagingToEnrichmentInput(
    {
      objectCategory: 'fertilizer',
      identity,
      references: {
        catalogProfileHint: preparedDraft.catalogProductId,
        existingProductProfileId: preparedDraft.productProfileId,
      },
      allowedInputChannels: ['capture_flow'],
      sourceHints: buildSourceHints(preparedDraft),
      idempotencyKey: options.enrichmentIdempotencyKey,
      captureEnrichmentInputBuilderPath: FERTILIZER_CAPTURE_ENRICHMENT_INPUT_BUILDER_PATH,
      captureDraftPackageDiagnostics: buildCaptureDraftPackageDiagnostics(draft),
    },
    preparedDraft,
  )
}
