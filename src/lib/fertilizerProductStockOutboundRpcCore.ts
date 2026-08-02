import type { ValidatedFertilizerProductStockOutbound } from './fertilizerProductStockOutboundCore'
import {
  buildProductStockOutboundPayloadFingerprintInput,
  type FertilizerProductStockOutboundReason,
} from './fertilizerProductStockOutboundCore'
import { FertilizerInventoryRepositoryError } from './fertilizerInventoryRepositoryCore'
import { FERTILIZER_INVENTORY_CREATION_MAX_IDEMPOTENCY_KEY_LENGTH } from './fertilizerInventoryCreationCore'

export const RECORD_FERTILIZER_PRODUCT_STOCK_OUTBOUND_RPC =
  'record_fertilizer_product_stock_outbound' as const

export const PRODUCT_STOCK_OUTBOUND_MOVEMENT_IDEMPOTENCY_KEY_PREFIX =
  'product-stock-outbound:' as const

export const FERTILIZER_PRODUCT_STOCK_OUTBOUND_RPC_ERROR_CODES = [
  'INVENTORY_OUTBOUND_ACCESS_DENIED',
  'INVENTORY_OUTBOUND_ITEM_NOT_FOUND',
  'INVENTORY_OUTBOUND_ITEM_INACTIVE',
  'INVENTORY_OUTBOUND_PROFILE_MISSING',
  'INVENTORY_OUTBOUND_PROFILE_INVALID',
  'INVENTORY_OUTBOUND_PROFILE_ACCESS_DENIED',
  'INVENTORY_OUTBOUND_QUANTITY_INVALID',
  'INVENTORY_OUTBOUND_REASON_INVALID',
  'INVENTORY_OUTBOUND_INSUFFICIENT_STOCK',
  'INVENTORY_OUTBOUND_IDEMPOTENCY_INVALID',
  'INVENTORY_OUTBOUND_IDEMPOTENCY_CONFLICT',
  'INVENTORY_OUTBOUND_FAILED',
] as const

export type FertilizerProductStockOutboundRpcErrorCode =
  (typeof FERTILIZER_PRODUCT_STOCK_OUTBOUND_RPC_ERROR_CODES)[number]

export interface RecordFertilizerProductStockOutboundRpcParams {
  p_inventory_item_id: string
  p_quantity: number
  p_reason: FertilizerProductStockOutboundReason
  p_idempotency_key: string
  p_movement_at?: string | null
  p_note?: string | null
}

export interface RecordFertilizerProductStockOutboundRpcResult {
  operation_id: string
  idempotency_key: string
  inventory_item_id: string
  movement_id: string
  quantity_delta: number
  reason: FertilizerProductStockOutboundReason
  movement_type: string
  movement_at: string
  idempotency_replay: boolean
}

export interface RecordFertilizerProductStockOutboundMappedResult {
  operationId: string
  idempotencyKey: string
  inventoryItemId: string
  movementId: string
  quantityDelta: number
  reason: FertilizerProductStockOutboundReason
  movementType: string
  movementAt: string
  idempotencyReplay: boolean
}

export interface BuildProductStockOutboundRpcParamsInput {
  validated: ValidatedFertilizerProductStockOutbound
  idempotencyKey: string
  movementAt?: string | null
}

export function buildProductStockOutboundMovementIdempotencyKey(receiptId: string): string {
  return `${PRODUCT_STOCK_OUTBOUND_MOVEMENT_IDEMPOTENCY_KEY_PREFIX}${receiptId}`
}

export function buildProductStockOutboundPayloadFingerprint(input: {
  inventoryItemId: string
  reason: FertilizerProductStockOutboundReason
  quantity: number
  note?: string | null
  movementAt?: string | null
}): string {
  const canonical = JSON.stringify(
    buildProductStockOutboundPayloadFingerprintInput(input),
  )
  let hash = 0

  for (let index = 0; index < canonical.length; index += 1) {
    hash = (hash << 5) - hash + canonical.charCodeAt(index)
    hash |= 0
  }

  return `fp-${Math.abs(hash).toString(16)}`
}

function assertIdempotencyKey(idempotencyKey: string): string {
  const trimmed = idempotencyKey.trim()

  if (!trimmed) {
    throw new FertilizerInventoryRepositoryError(
      'creation_idempotency_invalid',
      'idempotencyKey must be a non-empty string.',
    )
  }

  if (trimmed.length > FERTILIZER_INVENTORY_CREATION_MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new FertilizerInventoryRepositoryError(
      'creation_idempotency_invalid',
      `idempotencyKey must not exceed ${FERTILIZER_INVENTORY_CREATION_MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
    )
  }

  return trimmed
}

export function buildRecordFertilizerProductStockOutboundRpcParams(
  input: BuildProductStockOutboundRpcParamsInput,
): RecordFertilizerProductStockOutboundRpcParams {
  return {
    p_inventory_item_id: input.validated.inventoryItemId,
    p_quantity: input.validated.userQuantity,
    p_reason: input.validated.reason,
    p_idempotency_key: assertIdempotencyKey(input.idempotencyKey),
    p_movement_at: input.movementAt ?? null,
    p_note: input.validated.note,
  }
}

function extractRpcErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    return [record.message, record.details, record.hint, record.code]
      .filter((value) => typeof value === 'string')
      .map(String)
      .join(' ')
  }

  return ''
}

export function mapRecordFertilizerProductStockOutboundRpcError(
  error: unknown,
): FertilizerInventoryRepositoryError {
  const message = extractRpcErrorMessage(error)

  for (const rpcCode of FERTILIZER_PRODUCT_STOCK_OUTBOUND_RPC_ERROR_CODES) {
    if (message.includes(rpcCode)) {
      return new FertilizerInventoryRepositoryError('persistence_unavailable', message)
    }
  }

  if (message.includes('INVENTORY_NEGATIVE_BALANCE')) {
    return new FertilizerInventoryRepositoryError(
      'persistence_unavailable',
      'INVENTORY_OUTBOUND_INSUFFICIENT_STOCK',
    )
  }

  return new FertilizerInventoryRepositoryError(
    'persistence_unavailable',
    'Product stock outbound failed.',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      `Product stock outbound RPC returned invalid ${fieldName}.`,
    )
  }

  return value
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      `Product stock outbound RPC returned invalid ${fieldName}.`,
    )
  }

  return value
}

function readSignedQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Product stock outbound RPC returned invalid quantity_delta.',
    )
  }

  return value
}

function readReason(value: unknown): FertilizerProductStockOutboundReason {
  if (
    typeof value !== 'string'
    || !(['gift_given', 'disposed', 'inventory_correction'] as readonly string[]).includes(value)
  ) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Product stock outbound RPC returned invalid reason.',
    )
  }

  return value as FertilizerProductStockOutboundReason
}

export function mapRecordFertilizerProductStockOutboundRpcResult(
  payload: unknown,
): RecordFertilizerProductStockOutboundMappedResult {
  if (!isRecord(payload)) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Product stock outbound RPC returned an empty payload.',
    )
  }

  return {
    operationId: readString(payload.operation_id, 'operation_id'),
    idempotencyKey: readString(payload.idempotency_key, 'idempotency_key'),
    inventoryItemId: readString(payload.inventory_item_id, 'inventory_item_id'),
    movementId: readString(payload.movement_id, 'movement_id'),
    quantityDelta: readSignedQuantity(payload.quantity_delta),
    reason: readReason(payload.reason),
    movementType: readString(payload.movement_type, 'movement_type'),
    movementAt: readString(payload.movement_at, 'movement_at'),
    idempotencyReplay: readBoolean(payload.idempotency_replay, 'idempotency_replay'),
  }
}

export function areProductStockOutboundPayloadsEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function resolveProductStockOutboundIdempotencyReplay(input: {
  storedFingerprint: string
  nextFingerprint: string
  storedResult: RecordFertilizerProductStockOutboundMappedResult | null
}): 'replay' | 'conflict' | 'new' {
  if (input.storedFingerprint !== input.nextFingerprint) {
    return 'conflict'
  }

  if (input.storedResult) {
    return 'replay'
  }

  return 'new'
}
