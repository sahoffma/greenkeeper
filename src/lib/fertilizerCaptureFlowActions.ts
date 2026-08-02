import { applyStockRemainderAnswer, type FertilizerCaptureDraft } from './fertilizerCaptureCore'
import {
  createCaptureNavigationSnapshot,
  type CaptureNavigationSnapshot,
} from './fertilizerCaptureNavigationCore'
import type {
  FertilizerCaptureInventorySaveResult,
  FertilizerCaptureSaveResult,
} from '../types/fertilizerInventory'
import {
  buildFertilizerCaptureSavedReceipt,
  createCaptureDraftFromSavedReceipt,
  resolvePersistedCaptureBootstrap,
  type FertilizerCaptureSavedReceipt,
  type FertilizerCaptureSessionDraft,
  type FertilizerCaptureUiState,
} from './fertilizerCaptureSessionCore'
import {
  clearFertilizerCaptureSession,
  loadFertilizerCaptureSavedReceipt,
  loadFertilizerCaptureSession,
  persistFertilizerCaptureSavedReceipt,
} from './fertilizerCaptureSession'

export interface CaptureRemainderNavigationInput {
  draft: FertilizerCaptureDraft
  navigationStack: CaptureNavigationSnapshot[]
  snapshot: CaptureNavigationSnapshot
}

export function advanceCaptureAfterRemainderNo(
  input: CaptureRemainderNavigationInput,
): {
  draft: FertilizerCaptureDraft
  navigationStack: CaptureNavigationSnapshot[]
} {
  return {
    navigationStack: [...input.navigationStack, input.snapshot],
    draft: applyStockRemainderAnswer(input.draft, false),
  }
}

export function buildCaptureRemainderNavigationSnapshot(input: {
  draft: FertilizerCaptureDraft
  photoRecognitionOpen: boolean
  photoRecognition: CaptureNavigationSnapshot['photoRecognition']
  query: string
  quantityInput: string
  unit: CaptureNavigationSnapshot['unit']
  clarifyAnswer: string
  remainderAmountInput: string
  packageCountInput: string
  optionalOpen: boolean
  notice: string | null
}): CaptureNavigationSnapshot {
  const { draft, ...fields } = input

  return createCaptureNavigationSnapshot({
    ...fields,
    captureDraft: draft,
  })
}

export function completeCaptureAfterSave(input: {
  userId: string | null
  idempotencyKey: string
  saveResult: FertilizerCaptureSaveResult | FertilizerCaptureInventorySaveResult
}): FertilizerCaptureDraft {
  const receipt = buildFertilizerCaptureSavedReceipt({
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    saveResult: input.saveResult,
  })

  persistFertilizerCaptureSavedReceipt({
    userId: input.userId,
    receipt,
  })
  clearFertilizerCaptureSession(input.userId)

  return createCaptureDraftFromSavedReceipt(receipt)
}

export function resolveCaptureFlowBootstrap(input: {
  userId: string | null
  storedSession?: FertilizerCaptureSessionDraft | null
  storedReceipt?: FertilizerCaptureSavedReceipt | null
}): {
  captureDraft: FertilizerCaptureDraft
  ui: FertilizerCaptureUiState
} | null {
  const storedReceipt = input.storedReceipt ?? loadFertilizerCaptureSavedReceipt(input.userId)
  const storedSession = input.storedSession ?? loadFertilizerCaptureSession(input.userId)

  return resolvePersistedCaptureBootstrap({
    storedReceipt,
    storedSession,
  })
}

export function remountCaptureFlowAfterSave(input: {
  userId: string | null
}): FertilizerCaptureDraft | null {
  const bootstrap = resolveCaptureFlowBootstrap(input)

  if (bootstrap?.captureDraft.step !== 'saved') {
    return null
  }

  return bootstrap.captureDraft
}
