import { FERTILIZER_CAPTURE_FIXTURE_PRODUCTS } from '../data/fertilizerCaptureFixtures'
import type {
  FertilizerCaptureInventorySaveResult,
  FertilizerCaptureSaveResult,
} from '../types/fertilizerInventory'
import type { ProductRecognizeResult } from '../types/productRecognize'
import {
  createInitialCaptureDraft,
  type FertilizerCaptureDraft,
  type FertilizerQuantityUnit,
} from './fertilizerCaptureCore'
import { canProceedToConfirm, proceedToConfirm } from './fertilizerCaptureCore'
import type { CaptureNavigationSnapshot } from './fertilizerCaptureNavigationCore'

export const FERTILIZER_CAPTURE_SESSION_VERSION = 1
export const FERTILIZER_CAPTURE_SESSION_STORAGE_KEY = 'gk:fertilizer-capture-session'
export const FERTILIZER_CAPTURE_SAVED_RECEIPT_STORAGE_KEY = 'gk:fertilizer-capture-saved-receipt'
/** Temporärer Erfassungs-Draft — nach Tabwechsel/Remount wiederherstellbar. */
export const FERTILIZER_CAPTURE_DRAFT_MAX_AGE_MS = 4 * 60 * 60 * 1000

export type PhotoRecognitionPhase = 'select' | 'analyzing' | 'result' | 'unclear' | 'error'

export interface PhotoRecognitionImageMeta {
  fileName: string
  mimeType: string
  lastModified: number
}

export interface PhotoRecognitionSessionState {
  phase: PhotoRecognitionPhase
  result: ProductRecognizeResult | null
  errorMessage: string | null
  progressIndex: number
  slowHint: boolean
  inFlightRequestId: string | null
  imageMeta: PhotoRecognitionImageMeta | null
}

export interface FertilizerCaptureUiState {
  photoRecognitionOpen: boolean
  photoRecognition: PhotoRecognitionSessionState | null
  query: string
  quantityInput: string
  unit: FertilizerQuantityUnit
  clarifyAnswer: string
  remainderAmountInput: string
  packageCountInput: string
  optionalOpen: boolean
  notice: string | null
  navigationStack: CaptureNavigationSnapshot[]
}

export interface FertilizerCaptureSessionDraft {
  version: typeof FERTILIZER_CAPTURE_SESSION_VERSION
  updatedAt: number
  userId: string | null
  captureDraft: FertilizerCaptureDraft
  ui: FertilizerCaptureUiState
}

/** Nicht editierbarer Abschlusszustand nach erfolgreichem Speichern. */
export interface FertilizerCaptureSavedReceipt {
  version: typeof FERTILIZER_CAPTURE_SESSION_VERSION
  updatedAt: number
  savedAt: number
  userId: string | null
  idempotencyKey: string
  saveResult: FertilizerCaptureSaveResult | FertilizerCaptureInventorySaveResult
}

type SerializableCaptureDraft = Omit<FertilizerCaptureDraft, 'selectedProduct'> & {
  selectedProductId: string | null
}

type SerializableCaptureNavigationSnapshot = Omit<CaptureNavigationSnapshot, 'captureDraft'> & {
  captureDraft: SerializableCaptureDraft
}

type SerializableUiState = Omit<FertilizerCaptureUiState, 'navigationStack'> & {
  navigationStack: SerializableCaptureNavigationSnapshot[]
}

type SerializableSessionDraft = Omit<FertilizerCaptureSessionDraft, 'captureDraft' | 'ui'> & {
  captureDraft: SerializableCaptureDraft
  ui: SerializableUiState
}

export function createInitialPhotoRecognitionSession(): PhotoRecognitionSessionState {
  return {
    phase: 'select',
    result: null,
    errorMessage: null,
    progressIndex: 0,
    slowHint: false,
    inFlightRequestId: null,
    imageMeta: null,
  }
}

export function createInitialCaptureUiState(
  draft: FertilizerCaptureDraft,
): FertilizerCaptureUiState {
  return {
    photoRecognitionOpen: false,
    photoRecognition: null,
    query: '',
    quantityInput:
      draft.quantity != null ? String(draft.quantity).replace('.', ',') : '',
    unit: draft.unit,
    clarifyAnswer: '',
    remainderAmountInput: '',
    packageCountInput: '1',
    optionalOpen: false,
    notice: null,
    navigationStack: [],
  }
}

export function buildFertilizerCaptureSessionDraft(input: {
  userId: string | null
  captureDraft: FertilizerCaptureDraft
  ui: FertilizerCaptureUiState
  updatedAt?: number
}): FertilizerCaptureSessionDraft {
  return {
    version: FERTILIZER_CAPTURE_SESSION_VERSION,
    updatedAt: input.updatedAt ?? Date.now(),
    userId: input.userId,
    captureDraft: input.captureDraft,
    ui: input.ui,
  }
}

export function isEditableCaptureDraft(draft: FertilizerCaptureDraft): boolean {
  return draft.step !== 'saved'
}

export function buildFertilizerCaptureSavedReceipt(input: {
  userId: string | null
  idempotencyKey: string
  saveResult: FertilizerCaptureSaveResult | FertilizerCaptureInventorySaveResult
  savedAt?: number
  updatedAt?: number
}): FertilizerCaptureSavedReceipt {
  const savedAt = input.savedAt ?? Date.now()

  return {
    version: FERTILIZER_CAPTURE_SESSION_VERSION,
    updatedAt: input.updatedAt ?? savedAt,
    savedAt,
    userId: input.userId,
    idempotencyKey: input.idempotencyKey,
    saveResult: input.saveResult,
  }
}

export function createCaptureDraftFromSavedReceipt(
  receipt: FertilizerCaptureSavedReceipt,
): FertilizerCaptureDraft {
  return {
    ...createInitialCaptureDraft(),
    step: 'saved',
    saveResult: receipt.saveResult,
    idempotencyKey: receipt.idempotencyKey,
  }
}

export function isFertilizerCaptureSavedReceiptStale(
  receipt: FertilizerCaptureSavedReceipt,
  now = Date.now(),
): boolean {
  return now - receipt.updatedAt > FERTILIZER_CAPTURE_DRAFT_MAX_AGE_MS
}

export function shouldRestoreFertilizerCaptureSavedReceipt(input: {
  receipt: FertilizerCaptureSavedReceipt
  userId: string | null
  now?: number
}): boolean {
  if (input.receipt.version !== FERTILIZER_CAPTURE_SESSION_VERSION) {
    return false
  }

  if (isFertilizerCaptureSavedReceiptStale(input.receipt, input.now)) {
    return false
  }

  return input.receipt.userId === input.userId
}

export function resolvePersistedCaptureBootstrap(input: {
  storedSession: FertilizerCaptureSessionDraft | null
  storedReceipt: FertilizerCaptureSavedReceipt | null
}): {
  captureDraft: FertilizerCaptureDraft
  ui: FertilizerCaptureUiState
} | null {
  if (input.storedReceipt) {
    const captureDraft = createCaptureDraftFromSavedReceipt(input.storedReceipt)

    return {
      captureDraft,
      ui: createInitialCaptureUiState(captureDraft),
    }
  }

  if (input.storedSession) {
    return {
      captureDraft: migrateLegacyCaptureDraftStep(input.storedSession.captureDraft),
      ui: normalizeRestoredCaptureUi(input.storedSession.ui),
    }
  }

  return null
}

export function isFertilizerCaptureSessionDraftStale(
  draft: FertilizerCaptureSessionDraft,
  now = Date.now(),
): boolean {
  return now - draft.updatedAt > FERTILIZER_CAPTURE_DRAFT_MAX_AGE_MS
}

export function shouldRestoreFertilizerCaptureSession(input: {
  draft: FertilizerCaptureSessionDraft
  userId: string | null
  now?: number
}): boolean {
  if (input.draft.version !== FERTILIZER_CAPTURE_SESSION_VERSION) {
    return false
  }

  if (isFertilizerCaptureSessionDraftStale(input.draft, input.now)) {
    return false
  }

  if (input.draft.userId !== input.userId) {
    return false
  }

  if (!isEditableCaptureDraft(input.draft.captureDraft)) {
    return false
  }

  return true
}

function serializeCaptureDraft(draft: FertilizerCaptureDraft): SerializableCaptureDraft {
  const { selectedProduct, ...rest } = draft

  return {
    ...rest,
    selectedProductId: selectedProduct?.id ?? null,
  }
}

function deserializeCaptureDraft(serialized: SerializableCaptureDraft): FertilizerCaptureDraft {
  const { selectedProductId, ...rest } = serialized
  const selectedProduct =
    selectedProductId != null
      ? FERTILIZER_CAPTURE_FIXTURE_PRODUCTS.find((product) => product.id === selectedProductId) ??
        null
      : null

  return {
    ...rest,
    selectedProduct,
  }
}

function serializeNavigationSnapshot(
  snapshot: CaptureNavigationSnapshot,
): SerializableCaptureNavigationSnapshot {
  const { captureDraft, ...rest } = snapshot

  return {
    ...rest,
    captureDraft: serializeCaptureDraft(captureDraft),
  }
}

function deserializeNavigationSnapshot(
  snapshot: SerializableCaptureNavigationSnapshot,
): CaptureNavigationSnapshot {
  const { captureDraft, ...rest } = snapshot

  return {
    ...rest,
    captureDraft: deserializeCaptureDraft(captureDraft),
  }
}

function serializeUiState(ui: FertilizerCaptureUiState): SerializableUiState {
  const { navigationStack, ...rest } = ui

  return {
    ...rest,
    navigationStack: navigationStack.map(serializeNavigationSnapshot),
  }
}

function deserializeUiState(ui: SerializableUiState): FertilizerCaptureUiState {
  const { navigationStack, ...rest } = ui

  return {
    ...rest,
    navigationStack: (navigationStack ?? []).map(deserializeNavigationSnapshot),
  }
}

export function serializeFertilizerCaptureSession(
  draft: FertilizerCaptureSessionDraft,
): string {
  const payload: SerializableSessionDraft = {
    ...draft,
    captureDraft: serializeCaptureDraft(draft.captureDraft),
    ui: serializeUiState(draft.ui),
  }

  return JSON.stringify(payload)
}

export function parseFertilizerCaptureSavedReceipt(raw: string): FertilizerCaptureSavedReceipt | null {
  try {
    const parsed = JSON.parse(raw) as FertilizerCaptureSavedReceipt

    if (parsed.version !== FERTILIZER_CAPTURE_SESSION_VERSION) {
      return null
    }

    if (
      typeof parsed.updatedAt !== 'number' ||
      typeof parsed.savedAt !== 'number' ||
      typeof parsed.idempotencyKey !== 'string' ||
      !parsed.saveResult
    ) {
      return null
    }

    return {
      version: FERTILIZER_CAPTURE_SESSION_VERSION,
      updatedAt: parsed.updatedAt,
      savedAt: parsed.savedAt,
      userId: parsed.userId ?? null,
      idempotencyKey: parsed.idempotencyKey,
      saveResult: parsed.saveResult,
    }
  } catch {
    return null
  }
}

export function serializeFertilizerCaptureSavedReceipt(
  receipt: FertilizerCaptureSavedReceipt,
): string {
  return JSON.stringify(receipt)
}

export function parseFertilizerCaptureSession(
  raw: string,
): FertilizerCaptureSessionDraft | null {
  try {
    const parsed = JSON.parse(raw) as SerializableSessionDraft

    if (parsed.version !== FERTILIZER_CAPTURE_SESSION_VERSION) {
      return null
    }

    if (typeof parsed.updatedAt !== 'number' || !parsed.ui || !parsed.captureDraft) {
      return null
    }

    return {
      version: FERTILIZER_CAPTURE_SESSION_VERSION,
      updatedAt: parsed.updatedAt,
      userId: parsed.userId ?? null,
      captureDraft: deserializeCaptureDraft(parsed.captureDraft),
      ui: deserializeUiState({
        ...parsed.ui,
        navigationStack: parsed.ui.navigationStack ?? [],
      }),
    }
  } catch {
    return null
  }
}

export function resolveInterruptedPhotoRecognition(
  session: PhotoRecognitionSessionState,
): PhotoRecognitionSessionState {
  if (session.phase !== 'analyzing') {
    return session
  }

  if (session.result != null) {
    return {
      ...session,
      phase: 'result',
      inFlightRequestId: null,
    }
  }

  return {
    ...session,
    phase: 'select',
    inFlightRequestId: null,
    errorMessage: null,
    progressIndex: 0,
    slowHint: false,
  }
}

export function migrateLegacyCaptureDraftStep(
  draft: FertilizerCaptureDraft,
): FertilizerCaptureDraft {
  if ((draft.step as string) !== 'stock') {
    return draft
  }

  if (canProceedToConfirm({ ...draft, step: 'confirm' })) {
    return proceedToConfirm({ ...draft, step: 'confirm' })
  }

  return {
    ...draft,
    step: 'enter-quantity',
  }
}

export function normalizeRestoredCaptureUi(
  ui: FertilizerCaptureUiState,
): FertilizerCaptureUiState {
  const normalized: FertilizerCaptureUiState = {
    ...ui,
    navigationStack: ui.navigationStack ?? [],
  }

  if (!normalized.photoRecognitionOpen || !normalized.photoRecognition) {
    return normalized
  }

  return {
    ...normalized,
    photoRecognition: resolveInterruptedPhotoRecognition(normalized.photoRecognition),
  }
}

export function createFreshCaptureSessionState(): {
  captureDraft: FertilizerCaptureDraft
  ui: FertilizerCaptureUiState
} {
  const captureDraft = createInitialCaptureDraft()

  return {
    captureDraft,
    ui: createInitialCaptureUiState(captureDraft),
  }
}
