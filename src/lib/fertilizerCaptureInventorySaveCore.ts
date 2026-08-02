import type { FertilizerInventoryCreationReason } from './fertilizerInventoryCreationCore'
import type { FertilizerCaptureDraft } from './fertilizerCaptureCore'
import { proceedToConfirm } from './fertilizerCaptureCore'
import {
  buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft,
  FertilizerCaptureEnrichmentInputError,
} from './fertilizerCaptureEnrichmentInputCore'
import {
  buildConfirmedPackageGroupsFromCaptureDraft,
  FertilizerCaptureInventoryPackagesError,
} from './fertilizerCaptureInventoryPackagesCore'
import { startFertilizerEnrichmentFromCapture, FertilizerEnrichmentClientError } from './fertilizerEnrichmentClient'
import {
  saveFertilizerProductProfileFromCapture,
  FertilizerProductProfileSaveClientError,
} from './fertilizerProductProfileSaveClient'
import {
  createFertilizerInventoryFromCapture,
  FertilizerInventoryCreationRuntimeError,
} from './fertilizerInventoryCreation'
import { buildRecognitionProductLabel } from './fertilizerRecognitionCore'
import type { FertilizerCaptureInventorySaveResult } from '../types/fertilizerInventory'

export class FertilizerCaptureInventorySaveError extends Error {
  readonly code: string

  constructor(message: string, code = 'capture_inventory_save_failed') {
    super(message)
    this.name = 'FertilizerCaptureInventorySaveError'
    this.code = code
  }
}

export const FERTILIZER_CAPTURE_CREATION_REASON_OPTIONS = [
  { value: 'initial_stock' as const, label: 'Bereits vorhanden' },
  { value: 'purchase' as const, label: 'Gekauft' },
  { value: 'gift_received' as const, label: 'Geschenkt erhalten' },
] satisfies ReadonlyArray<{ value: FertilizerInventoryCreationReason; label: string }>

export function isFertilizerInventoryCreationReason(
  value: string | null | undefined,
): value is FertilizerInventoryCreationReason {
  return value === 'initial_stock' || value === 'purchase' || value === 'gift_received'
}

function resolveCaptureProductLabel(draft: FertilizerCaptureDraft): string {
  return (
    draft.customProductLabel ??
    (draft.recognitionResult ? buildRecognitionProductLabel(draft.recognitionResult) : null) ??
    (draft.selectedProduct ? `${draft.selectedProduct.manufacturer} ${draft.selectedProduct.name}` : null) ??
    'Dünger'
  )
}

function enrichmentIdempotencyKey(baseKey: string): string {
  return `${baseKey}:enrichment`
}

function profileSaveIdempotencyKey(baseKey: string): string {
  return `${baseKey}:profile`
}

function inventoryCreationIdempotencyKey(baseKey: string): string {
  return `${baseKey}:inventory`
}

function mapCaptureInventorySaveError(error: unknown): FertilizerCaptureInventorySaveError {
  if (error instanceof FertilizerCaptureInventorySaveError) {
    return error
  }

  if (error instanceof FertilizerCaptureEnrichmentInputError) {
    return new FertilizerCaptureInventorySaveError(error.message, 'enrichment_input_invalid')
  }

  if (error instanceof FertilizerCaptureInventoryPackagesError) {
    return new FertilizerCaptureInventorySaveError(error.message, 'package_input_invalid')
  }

  if (error instanceof FertilizerEnrichmentClientError) {
    return new FertilizerCaptureInventorySaveError(error.message, error.code)
  }

  if (error instanceof FertilizerProductProfileSaveClientError) {
    return new FertilizerCaptureInventorySaveError(error.message, error.code)
  }

  if (error instanceof FertilizerInventoryCreationRuntimeError) {
    return new FertilizerCaptureInventorySaveError(error.message, error.code)
  }

  if (error instanceof Error) {
    return new FertilizerCaptureInventorySaveError(error.message)
  }

  return new FertilizerCaptureInventorySaveError('Der Dünger konnte nicht gespeichert werden.')
}

function assertIntakeReadyReadiness(jobResult: { status: string; pipelineResult?: { readinessResult?: { status: string } } | null }) {
  if (jobResult.status !== 'intake_ready') {
    throw new FertilizerCaptureInventorySaveError(
      'Das Produkt ist noch nicht bereit für die Bestandsaufnahme.',
      'not_save_ready',
    )
  }

  const readinessStatus = jobResult.pipelineResult?.readinessResult?.status
  if (readinessStatus !== 'ready') {
    throw new FertilizerCaptureInventorySaveError(
      'Für die Bestandsaufnahme fehlen noch verbindliche Produktdaten.',
      'not_save_ready',
    )
  }
}

export interface SaveFertilizerCaptureToInventoryCoreInput {
  draft: FertilizerCaptureDraft
  userId: string
  creationReason: FertilizerInventoryCreationReason
}

export async function saveFertilizerCaptureToInventoryCore(
  input: SaveFertilizerCaptureToInventoryCoreInput,
): Promise<FertilizerCaptureInventorySaveResult> {
  try {
    const confirmedDraft = proceedToConfirm(input.draft)

    if (!confirmedDraft.idempotencyKey) {
      throw new FertilizerCaptureInventorySaveError(
        'Der Speichervorgang konnte nicht gestartet werden.',
        'creation_idempotency_invalid',
      )
    }

    if (!isFertilizerInventoryCreationReason(input.creationReason)) {
      throw new FertilizerCaptureInventorySaveError(
        'Bitte wähle einen Bestandsgrund aus.',
        'creation_reason_invalid',
      )
    }

    const baseKey = confirmedDraft.idempotencyKey
    const enrichmentInput = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(confirmedDraft, {
      enrichmentIdempotencyKey: enrichmentIdempotencyKey(baseKey),
    })

    const enrichmentJob = await startFertilizerEnrichmentFromCapture({
      input: enrichmentInput,
      idempotencyKey: enrichmentIdempotencyKey(baseKey),
    })

    assertIntakeReadyReadiness(enrichmentJob.result)

    const profileSave = await saveFertilizerProductProfileFromCapture({
      enrichmentJobId: enrichmentJob.jobId,
      userConfirmed: true,
      idempotencyKey: profileSaveIdempotencyKey(baseKey),
    })

    const confirmedPackageGroups = buildConfirmedPackageGroupsFromCaptureDraft(confirmedDraft)
    const inventoryResult = await createFertilizerInventoryFromCapture({
      savedProductProfileId: profileSave.profile.id,
      userId: input.userId,
      creationReason: input.creationReason,
      idempotencyKey: inventoryCreationIdempotencyKey(baseKey),
      sourceEventRef: `capture:${baseKey}`,
      confirmedPackageGroups,
    })

    const productLabel = resolveCaptureProductLabel(confirmedDraft)

    return {
      operationId: inventoryResult.operationId,
      idempotencyKey: inventoryResult.idempotencyKey,
      savedProductProfileId: profileSave.profile.id,
      productLabel,
      creationReason: input.creationReason,
      packageCount: inventoryResult.packageCount,
      totalInitialQuantity: inventoryResult.totalInitialQuantity,
      baseUnit: inventoryResult.baseUnit,
      inventoryItemIds: inventoryResult.packages.map((entry) => entry.item.id),
      idempotentReplay: false,
    }
  } catch (error) {
    throw mapCaptureInventorySaveError(error)
  }
}
