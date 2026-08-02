import type { FertilizerProductStockIntakeReason } from './fertilizerProductStockCore'
import type { FertilizerProductStockOutboundReason } from './fertilizerProductStockOutboundCore'

export type FertilizerStockEventFlowKind = 'intake' | 'outbound'

export type FertilizerStockEventFlowPhase =
  | 'details'
  | 'confirm'
  | 'saving'
  | 'success'
  | 'error'

export interface FertilizerStockEventFlowDraft {
  kind: FertilizerStockEventFlowKind
  phase: FertilizerStockEventFlowPhase
  inventoryItemId: string | null
  intakeReason: FertilizerProductStockIntakeReason | null
  outboundReason: FertilizerProductStockOutboundReason | null
  quantityInput: string
  note: string
  idempotencyKey: string | null
  errorMessage: string | null
}

export function createInitialStockEventFlowDraft(
  kind: FertilizerStockEventFlowKind,
  inventoryItemId: string,
): FertilizerStockEventFlowDraft {
  return {
    kind,
    phase: 'details',
    inventoryItemId,
    intakeReason: kind === 'intake' ? 'purchase' : null,
    outboundReason: kind === 'outbound' ? 'gift_given' : null,
    quantityInput: '',
    note: '',
    idempotencyKey: null,
    errorMessage: null,
  }
}

export function resolveStockEventFlowPhase(
  draft: FertilizerStockEventFlowDraft,
): FertilizerStockEventFlowPhase {
  return draft.phase
}

export function advanceStockEventFlowToConfirm(
  draft: FertilizerStockEventFlowDraft,
): FertilizerStockEventFlowDraft {
  return {
    ...draft,
    phase: 'confirm',
    errorMessage: null,
  }
}

export function beginStockEventFlowSaving(
  draft: FertilizerStockEventFlowDraft,
  idempotencyKey: string,
): FertilizerStockEventFlowDraft {
  return {
    ...draft,
    phase: 'saving',
    idempotencyKey,
    errorMessage: null,
  }
}

export function completeStockEventFlowSuccess(
  draft: FertilizerStockEventFlowDraft,
): FertilizerStockEventFlowDraft {
  return {
    ...draft,
    phase: 'success',
    errorMessage: null,
  }
}

export function failStockEventFlow(
  draft: FertilizerStockEventFlowDraft,
  errorMessage: string,
): FertilizerStockEventFlowDraft {
  return {
    ...draft,
    phase: 'error',
    errorMessage,
  }
}

export function retryStockEventFlowWithSameKey(
  draft: FertilizerStockEventFlowDraft,
): FertilizerStockEventFlowDraft {
  return {
    ...draft,
    phase: 'saving',
    errorMessage: null,
  }
}

export function resetStockEventFlowInputWithNewKey(
  draft: FertilizerStockEventFlowDraft,
  newIdempotencyKey: string,
): FertilizerStockEventFlowDraft {
  return {
    ...draft,
    phase: 'details',
    idempotencyKey: newIdempotencyKey,
    errorMessage: null,
  }
}

export function setStockEventIntakeReason(
  draft: FertilizerStockEventFlowDraft,
  reason: FertilizerProductStockIntakeReason,
): FertilizerStockEventFlowDraft {
  return {
    ...draft,
    intakeReason: reason,
    phase: 'details',
    errorMessage: null,
  }
}

export function setStockEventOutboundReason(
  draft: FertilizerStockEventFlowDraft,
  reason: FertilizerProductStockOutboundReason,
): FertilizerStockEventFlowDraft {
  return {
    ...draft,
    outboundReason: reason,
    phase: 'details',
    errorMessage: null,
  }
}

export function parseStockEventQuantityInput(
  input: string,
  options: { allowSigned: boolean },
): number | null {
  const trimmed = input.trim().replace(',', '.')
  if (!trimmed) {
    return null
  }

  const value = Number(trimmed)
  if (!Number.isFinite(value) || value === 0) {
    return null
  }

  if (!options.allowSigned && value <= 0) {
    return null
  }

  return value
}

export function shouldStockEventFlowAllowSignedQuantity(
  draft: FertilizerStockEventFlowDraft,
): boolean {
  return draft.kind === 'outbound' && draft.outboundReason === 'inventory_correction'
}

export function canConfirmStockEventFlow(draft: FertilizerStockEventFlowDraft): boolean {
  const quantity = parseStockEventQuantityInput(draft.quantityInput, {
    allowSigned: shouldStockEventFlowAllowSignedQuantity(draft),
  })

  if (quantity == null) {
    return false
  }

  if (draft.kind === 'intake') {
    return draft.intakeReason != null
  }

  return draft.outboundReason != null
}

export function buildStockEventFlowIdempotencyKey(
  prefix: 'product-stock-intake' | 'product-stock-outbound',
  token: string,
): string {
  return `${prefix}:${token}`
}

export const FERTILIZER_STOCK_EVENT_INTAKE_REASON_OPTIONS = [
  { value: 'purchase' as const, label: 'Gekauft' },
  { value: 'gift_received' as const, label: 'Geschenkt erhalten' },
] as const

export const FERTILIZER_STOCK_EVENT_OUTBOUND_REASON_OPTIONS = [
  { value: 'gift_given' as const, label: 'Verschenkt' },
  { value: 'disposed' as const, label: 'Entsorgt' },
  { value: 'inventory_correction' as const, label: 'Bestandskorrektur' },
] as const
