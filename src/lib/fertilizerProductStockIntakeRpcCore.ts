import type {
  FertilizerProductStockIntakeReason,
  ValidatedFertilizerProductStockIntake,
} from './fertilizerProductStockCore'
import {
  FERTILIZER_INVENTORY_CREATION_MAX_IDEMPOTENCY_KEY_LENGTH,
  FERTILIZER_INVENTORY_CREATION_MAX_SOURCE_EVENT_REF_LENGTH,
} from './fertilizerInventoryCreationCore'
import { FertilizerInventoryRepositoryError } from './fertilizerInventoryRepositoryCore'

export const RECORD_FERTILIZER_PRODUCT_STOCK_INTAKE_RPC =
  'record_fertilizer_product_stock_intake' as const

export const PRODUCT_STOCK_INTAKE_MOVEMENT_IDEMPOTENCY_KEY_PREFIX =
  'product-stock-intake:' as const

export const FERTILIZER_PRODUCT_STOCK_INTAKE_RPC_ERROR_CODES = [
  'INVENTORY_INTAKE_ACCESS_DENIED',
  'INVENTORY_INTAKE_PRODUCT_PROFILE_NOT_FOUND',
  'INVENTORY_INTAKE_PRODUCT_PROFILE_NOT_READY',
  'INVENTORY_INTAKE_UNIT_MISMATCH',
  'INVENTORY_INTAKE_QUANTITY_INVALID',
  'INVENTORY_INTAKE_REASON_INVALID',
  'INVENTORY_INTAKE_IDEMPOTENCY_INVALID',
  'INVENTORY_INTAKE_IDEMPOTENCY_CONFLICT',
  'INVENTORY_INTAKE_FAILED',
] as const

export type FertilizerProductStockIntakeRpcErrorCode =
  (typeof FERTILIZER_PRODUCT_STOCK_INTAKE_RPC_ERROR_CODES)[number]

export interface RecordFertilizerProductStockIntakeRpcParams {
  p_saved_product_profile_id: string
  p_base_unit: 'kg' | 'ml'
  p_quantity: number
  p_reason: FertilizerProductStockIntakeReason
  p_idempotency_key: string
  p_movement_at?: string | null
  p_source_event_ref?: string | null
  p_note?: string | null
}

export interface RecordFertilizerProductStockIntakeRpcResult {
  operation_id: string
  idempotency_key: string
  inventory_item_id: string
  movement_id: string
  saved_product_profile_id: string
  base_unit: 'kg' | 'ml'
  quantity_delta: number
  reason: FertilizerProductStockIntakeReason
  movement_at: string
  item_created: boolean
  idempotency_replay: boolean
}

export interface RecordFertilizerProductStockIntakeMappedResult {
  operationId: string
  idempotencyKey: string
  inventoryItemId: string
  movementId: string
  savedProductProfileId: string
  baseUnit: 'kg' | 'ml'
  quantityDelta: number
  reason: FertilizerProductStockIntakeReason
  movementAt: string
  itemCreated: boolean
  idempotencyReplay: boolean
}

export interface BuildProductStockIntakeRpcParamsInput {
  validated: ValidatedFertilizerProductStockIntake
  idempotencyKey: string
  movementAt?: string | null
  sourceEventRef?: string | null
  note?: string | null
}

export function buildProductStockIntakeMovementIdempotencyKey(receiptId: string): string {
  return `${PRODUCT_STOCK_INTAKE_MOVEMENT_IDEMPOTENCY_KEY_PREFIX}${receiptId}`
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

function normalizeOptionalSourceEventRef(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.length > FERTILIZER_INVENTORY_CREATION_MAX_SOURCE_EVENT_REF_LENGTH) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      `sourceEventRef must not exceed ${FERTILIZER_INVENTORY_CREATION_MAX_SOURCE_EVENT_REF_LENGTH} characters.`,
    )
  }

  return trimmed
}

export function buildRecordFertilizerProductStockIntakeRpcParams(
  input: BuildProductStockIntakeRpcParamsInput,
): RecordFertilizerProductStockIntakeRpcParams {
  return {
    p_saved_product_profile_id: input.validated.stockIdentity.savedProductProfileId,
    p_base_unit: input.validated.baseUnit,
    p_quantity: input.validated.quantity,
    p_reason: input.validated.reason,
    p_idempotency_key: assertIdempotencyKey(input.idempotencyKey),
    p_movement_at: input.movementAt ?? null,
    p_source_event_ref: normalizeOptionalSourceEventRef(input.sourceEventRef),
    p_note: input.note?.trim() ? input.note.trim() : null,
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

export function mapRecordFertilizerProductStockIntakeRpcError(
  error: unknown,
): FertilizerInventoryRepositoryError {
  const message = extractRpcErrorMessage(error)

  for (const rpcCode of FERTILIZER_PRODUCT_STOCK_INTAKE_RPC_ERROR_CODES) {
    if (message.includes(rpcCode)) {
      return new FertilizerInventoryRepositoryError('persistence_unavailable', message)
    }
  }

  return new FertilizerInventoryRepositoryError(
    'persistence_unavailable',
    'Product stock intake failed.',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      `Product stock intake RPC returned invalid ${fieldName}.`,
    )
  }

  return value
}

function readString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      `Product stock intake RPC returned invalid ${fieldName}.`,
    )
  }

  return value
}

function readQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Product stock intake RPC returned invalid quantity_delta.',
    )
  }

  return value
}

function readReason(value: unknown): FertilizerProductStockIntakeReason {
  if (
    typeof value !== 'string'
    || !(['initial_stock', 'purchase', 'gift_received'] as readonly string[]).includes(value)
  ) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Product stock intake RPC returned invalid reason.',
    )
  }

  return value as FertilizerProductStockIntakeReason
}

function readBaseUnit(value: unknown): 'kg' | 'ml' {
  if (value !== 'kg' && value !== 'ml') {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Product stock intake RPC returned invalid base_unit.',
    )
  }

  return value
}

export function mapRecordFertilizerProductStockIntakeRpcResult(
  payload: unknown,
): RecordFertilizerProductStockIntakeMappedResult {
  if (!isRecord(payload)) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Product stock intake RPC returned an empty payload.',
    )
  }

  return {
    operationId: readString(payload.operation_id, 'operation_id'),
    idempotencyKey: readString(payload.idempotency_key, 'idempotency_key'),
    inventoryItemId: readString(payload.inventory_item_id, 'inventory_item_id'),
    movementId: readString(payload.movement_id, 'movement_id'),
    savedProductProfileId: readString(
      payload.saved_product_profile_id,
      'saved_product_profile_id',
    ),
    baseUnit: readBaseUnit(payload.base_unit),
    quantityDelta: readQuantity(payload.quantity_delta),
    reason: readReason(payload.reason),
    movementAt: readString(payload.movement_at, 'movement_at'),
    itemCreated: readBoolean(payload.item_created, 'item_created'),
    idempotencyReplay: readBoolean(payload.idempotency_replay, 'idempotency_replay'),
  }
}
