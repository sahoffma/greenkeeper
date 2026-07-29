import {
  buildFertilizerCaptureSessionDraft,
  FERTILIZER_CAPTURE_SAVED_RECEIPT_STORAGE_KEY,
  FERTILIZER_CAPTURE_SESSION_STORAGE_KEY,
  normalizeRestoredCaptureUi,
  parseFertilizerCaptureSavedReceipt,
  parseFertilizerCaptureSession,
  serializeFertilizerCaptureSavedReceipt,
  serializeFertilizerCaptureSession,
  shouldRestoreFertilizerCaptureSavedReceipt,
  shouldRestoreFertilizerCaptureSession,
  type FertilizerCaptureSavedReceipt,
  type FertilizerCaptureSessionDraft,
} from './fertilizerCaptureSessionCore'

function sessionStorageKey(userId: string | null): string {
  return userId
    ? `${FERTILIZER_CAPTURE_SESSION_STORAGE_KEY}:${userId}`
    : FERTILIZER_CAPTURE_SESSION_STORAGE_KEY
}

function savedReceiptStorageKey(userId: string | null): string {
  return userId
    ? `${FERTILIZER_CAPTURE_SAVED_RECEIPT_STORAGE_KEY}:${userId}`
    : FERTILIZER_CAPTURE_SAVED_RECEIPT_STORAGE_KEY
}

export function loadFertilizerCaptureSession(
  userId: string | null,
): FertilizerCaptureSessionDraft | null {
  if (typeof sessionStorage === 'undefined') {
    return null
  }

  const raw = sessionStorage.getItem(sessionStorageKey(userId))

  if (!raw) {
    return null
  }

  const parsed = parseFertilizerCaptureSession(raw)

  if (!parsed || !shouldRestoreFertilizerCaptureSession({ draft: parsed, userId })) {
    sessionStorage.removeItem(sessionStorageKey(userId))
    return null
  }

  return {
    ...parsed,
    ui: normalizeRestoredCaptureUi(parsed.ui),
  }
}

export function saveFertilizerCaptureSession(input: {
  userId: string | null
  draft: FertilizerCaptureSessionDraft
}): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  sessionStorage.setItem(sessionStorageKey(input.userId), serializeFertilizerCaptureSession(input.draft))
}

export function persistFertilizerCaptureSession(input: {
  userId: string | null
  captureDraft: FertilizerCaptureSessionDraft['captureDraft']
  ui: FertilizerCaptureSessionDraft['ui']
}): void {
  saveFertilizerCaptureSession({
    userId: input.userId,
    draft: buildFertilizerCaptureSessionDraft({
      userId: input.userId,
      captureDraft: input.captureDraft,
      ui: input.ui,
    }),
  })
}

export function clearFertilizerCaptureSession(userId: string | null): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  sessionStorage.removeItem(sessionStorageKey(userId))
}

export function loadFertilizerCaptureSavedReceipt(
  userId: string | null,
): FertilizerCaptureSavedReceipt | null {
  if (typeof sessionStorage === 'undefined') {
    return null
  }

  const raw = sessionStorage.getItem(savedReceiptStorageKey(userId))

  if (!raw) {
    return null
  }

  const parsed = parseFertilizerCaptureSavedReceipt(raw)

  if (!parsed || !shouldRestoreFertilizerCaptureSavedReceipt({ receipt: parsed, userId })) {
    sessionStorage.removeItem(savedReceiptStorageKey(userId))
    return null
  }

  return parsed
}

export function persistFertilizerCaptureSavedReceipt(input: {
  userId: string | null
  receipt: FertilizerCaptureSavedReceipt
}): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  sessionStorage.setItem(
    savedReceiptStorageKey(input.userId),
    serializeFertilizerCaptureSavedReceipt(input.receipt),
  )
}

export function clearFertilizerCaptureSavedReceipt(userId: string | null): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }

  sessionStorage.removeItem(savedReceiptStorageKey(userId))
}
