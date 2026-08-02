import type { FertilizerInventoryBaseUnit } from '../types/fertilizerInventoryCore'
import { assertInventoryQuantityPrecision } from './fertilizerInventoryQuantityCore'
import {
  isActiveCanonicalProductStockCandidate,
  type ActiveCanonicalProductStockCandidate,
} from './fertilizerProductStockReadCore'

export const FERTILIZER_PRODUCT_STOCK_OUTBOUND_REASONS = [
  'gift_given',
  'disposed',
  'inventory_correction',
] as const

export type FertilizerProductStockOutboundReason =
  (typeof FERTILIZER_PRODUCT_STOCK_OUTBOUND_REASONS)[number]

export type PersistedFertilizerProductStockOutboundMovementType =
  | 'gifted_away'
  | 'disposal'
  | 'inventory_correction'

export interface FertilizerProductStockOutboundInput {
  inventoryItemId: string
  reason: FertilizerProductStockOutboundReason
  /** Positive user amount for real outflows; signed delta for inventory_correction. */
  quantity: number
  note?: string | null
}

export interface ValidatedFertilizerProductStockOutbound {
  inventoryItemId: string
  reason: FertilizerProductStockOutboundReason
  movementType: PersistedFertilizerProductStockOutboundMovementType
  userQuantity: number
  quantityDelta: number
  note: string | null
}

export const FERTILIZER_PRODUCT_STOCK_OUTBOUND_ERROR_CODES = [
  'product_stock_outbound_item_id_invalid',
  'product_stock_outbound_reason_invalid',
  'product_stock_outbound_quantity_invalid',
  'product_stock_outbound_sign_invalid',
  'product_stock_outbound_item_not_eligible',
] as const

export type FertilizerProductStockOutboundErrorCode =
  (typeof FERTILIZER_PRODUCT_STOCK_OUTBOUND_ERROR_CODES)[number]

export class FertilizerProductStockOutboundError extends Error {
  readonly code: FertilizerProductStockOutboundErrorCode
  readonly field?: string

  constructor(
    code: FertilizerProductStockOutboundErrorCode,
    message: string,
    options: { field?: string } = {},
  ) {
    super(message)
    this.name = 'FertilizerProductStockOutboundError'
    this.code = code
    this.field = options.field
  }
}

const INVENTORY_ITEM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const REJECTED_OUTBOUND_REASONS = [
  'initial_stock',
  'purchase',
  'gift_received',
  'application',
  'legacy_balance_migration',
] as const

function throwOutboundError(
  code: FertilizerProductStockOutboundErrorCode,
  message: string,
  options: { field?: string } = {},
): never {
  throw new FertilizerProductStockOutboundError(code, message, options)
}

export function isFertilizerProductStockOutboundReason(
  value: unknown,
): value is FertilizerProductStockOutboundReason {
  return (
    typeof value === 'string'
    && (FERTILIZER_PRODUCT_STOCK_OUTBOUND_REASONS as readonly string[]).includes(value)
  )
}

export function isRejectedProductStockOutboundReason(value: unknown): boolean {
  return (
    typeof value === 'string'
    && (REJECTED_OUTBOUND_REASONS as readonly string[]).includes(
      value as (typeof REJECTED_OUTBOUND_REASONS)[number],
    )
  )
}

export function validateFertilizerProductStockOutboundInventoryItemId(
  inventoryItemId: string,
): string {
  const trimmed = inventoryItemId.trim()

  if (!trimmed || !INVENTORY_ITEM_ID_PATTERN.test(trimmed)) {
    throwOutboundError(
      'product_stock_outbound_item_id_invalid',
      'inventoryItemId must be a valid UUID.',
      { field: 'inventoryItemId' },
    )
  }

  return trimmed.toLowerCase()
}

export function validateFertilizerProductStockOutboundReason(
  reason: unknown,
): FertilizerProductStockOutboundReason {
  if (isRejectedProductStockOutboundReason(reason)) {
    throwOutboundError(
      'product_stock_outbound_reason_invalid',
      'reason is not allowed for outbound stock events.',
      { field: 'reason' },
    )
  }

  if (!isFertilizerProductStockOutboundReason(reason)) {
    throwOutboundError(
      'product_stock_outbound_reason_invalid',
      'reason must be gift_given, disposed, or inventory_correction.',
      { field: 'reason' },
    )
  }

  return reason
}

export function mapOutboundReasonToMovementType(
  reason: FertilizerProductStockOutboundReason,
): PersistedFertilizerProductStockOutboundMovementType {
  switch (reason) {
    case 'gift_given':
      return 'gifted_away'
    case 'disposed':
      return 'disposal'
    case 'inventory_correction':
      return 'inventory_correction'
    default:
      throwOutboundError(
        'product_stock_outbound_reason_invalid',
        'reason must be gift_given, disposed, or inventory_correction.',
        { field: 'reason' },
      )
  }
}

function validateSignedQuantity(quantity: number): number {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity === 0) {
    throwOutboundError(
      'product_stock_outbound_quantity_invalid',
      'quantity must be a non-zero finite number.',
      { field: 'quantity' },
    )
  }

  try {
    assertInventoryQuantityPrecision(Math.abs(quantity), 'quantity')
  } catch {
    throwOutboundError(
      'product_stock_outbound_quantity_invalid',
      'quantity supports at most four decimal places.',
      { field: 'quantity' },
    )
  }

  return quantity
}

function validatePositiveUserQuantity(quantity: number): number {
  const validated = validateSignedQuantity(quantity)

  if (validated <= 0) {
    throwOutboundError(
      'product_stock_outbound_sign_invalid',
      'quantity must be greater than zero for this reason.',
      { field: 'quantity' },
    )
  }

  return validated
}

export function normalizeOutboundStoredDelta(input: {
  reason: FertilizerProductStockOutboundReason
  quantity: number
}): { userQuantity: number; quantityDelta: number } {
  const reason = validateFertilizerProductStockOutboundReason(input.reason)

  if (reason === 'inventory_correction') {
    const signedDelta = validateSignedQuantity(input.quantity)
    return {
      userQuantity: signedDelta,
      quantityDelta: signedDelta,
    }
  }

  const userQuantity = validatePositiveUserQuantity(input.quantity)

  return {
    userQuantity,
    quantityDelta: -userQuantity,
  }
}

export function validateFertilizerProductStockOutbound(
  input: FertilizerProductStockOutboundInput,
): ValidatedFertilizerProductStockOutbound {
  const inventoryItemId = validateFertilizerProductStockOutboundInventoryItemId(
    input.inventoryItemId,
  )
  const reason = validateFertilizerProductStockOutboundReason(input.reason)
  const movementType = mapOutboundReasonToMovementType(reason)
  const { userQuantity, quantityDelta } = normalizeOutboundStoredDelta({
    reason,
    quantity: input.quantity,
  })
  const note = input.note?.trim() ? input.note.trim() : null

  return {
    inventoryItemId,
    reason,
    movementType,
    userQuantity,
    quantityDelta,
    note,
  }
}

export function isEligibleProductStockOutboundItem(
  candidate: ActiveCanonicalProductStockCandidate,
  currentUserId?: string | null,
): boolean {
  return isActiveCanonicalProductStockCandidate(candidate, currentUserId)
}

export function buildProductStockOutboundPayloadFingerprintInput(input: {
  inventoryItemId: string
  reason: FertilizerProductStockOutboundReason
  quantity: number
  note?: string | null
  movementAt?: string | null
}): Record<string, unknown> {
  const validated = validateFertilizerProductStockOutbound({
    inventoryItemId: input.inventoryItemId,
    reason: input.reason,
    quantity: input.quantity,
    note: input.note,
  })

  const payload: Record<string, unknown> = {
    inventoryItemId: validated.inventoryItemId,
    reason: validated.reason,
    quantity: validated.userQuantity,
    note: validated.note,
  }

  if (input.movementAt) {
    payload.movementAt = input.movementAt
  }

  return payload
}

export function formatOutboundReasonLabel(reason: FertilizerProductStockOutboundReason): string {
  switch (reason) {
    case 'gift_given':
      return 'Verschenkt'
    case 'disposed':
      return 'Entsorgt'
    case 'inventory_correction':
      return 'Bestandskorrektur'
    default:
      return reason
  }
}

export function formatOutboundBaseUnitLabel(baseUnit: FertilizerInventoryBaseUnit): string {
  return baseUnit
}
