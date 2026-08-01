import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerInventoryMovement } from '../types/fertilizerInventoryCore'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import {
  FertilizerInventoryRepositoryError,
  type AppendFertilizerInventoryMovementInput,
  type FertilizerInventoryRepositoryErrorCode,
} from './fertilizerInventoryRepositoryCore'
import {
  mapMovementRowToInventoryMovement,
  validateStoredInventoryMovementRecord,
  type FertilizerInventoryMovementRow,
} from './fertilizerInventoryRepositoryMappingCore'
import { assertInventoryQuantityPrecision } from './fertilizerInventoryQuantityCore'

export const APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC =
  'append_fertilizer_inventory_core_movement' as const

export const FERTILIZER_INVENTORY_APPEND_MOVEMENT_RPC_ERROR_CODES = [
  'INVENTORY_ITEM_NOT_FOUND',
  'INVENTORY_ACCESS_DENIED',
  'INVENTORY_UNIT_MISMATCH',
  'INVENTORY_QUANTITY_INVALID',
  'INVENTORY_NEGATIVE_BALANCE',
  'INVENTORY_IDEMPOTENCY_CONFLICT',
] as const

export type FertilizerInventoryAppendMovementRpcErrorCode =
  (typeof FERTILIZER_INVENTORY_APPEND_MOVEMENT_RPC_ERROR_CODES)[number]

const RPC_ERROR_TO_REPOSITORY_CODE: Record<
  FertilizerInventoryAppendMovementRpcErrorCode,
  FertilizerInventoryRepositoryErrorCode
> = {
  INVENTORY_ITEM_NOT_FOUND: 'not_found',
  INVENTORY_ACCESS_DENIED: 'access_denied',
  INVENTORY_UNIT_MISMATCH: 'unit_mismatch',
  INVENTORY_QUANTITY_INVALID: 'quantity_invalid',
  INVENTORY_NEGATIVE_BALANCE: 'negative_balance',
  INVENTORY_IDEMPOTENCY_CONFLICT: 'idempotency_conflict',
}

export interface AppendFertilizerInventoryCoreMovementRpcParams {
  p_inventory_item_id: string
  p_access_kind: 'authenticated_user' | 'session'
  p_user_id: string | null
  p_session_access_hash: string | null
  p_quantity_delta: number
  p_unit: AppendFertilizerInventoryMovementInput['unit']
  p_movement_type: AppendFertilizerInventoryMovementInput['movementType']
  p_movement_origin: AppendFertilizerInventoryMovementInput['movementOrigin']
  p_movement_at: string | null
  p_inventory_idempotency_key: string | null
  p_source_event_ref: string | null
  p_note: string | null
  p_movement_id: string | null
  p_created_at: string | null
}

function resolveSessionAccessHash(
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): string {
  if (accessContext.kind !== 'session') {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Session access hash derivation is required for session-scoped inventory access.',
    )
  }

  return deriveSessionAccessHash(accessContext.sessionId)
}

export function buildAppendFertilizerInventoryCoreMovementRpcParams(
  input: AppendFertilizerInventoryMovementInput,
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
  options: {
    movementId?: string
    createdAt?: string
    movementAt?: string
    movementOrigin?: AppendFertilizerInventoryMovementInput['movementOrigin']
  } = {},
): AppendFertilizerInventoryCoreMovementRpcParams {
  assertInventoryQuantityPrecision(input.quantityDelta, 'quantityDelta')

  if (accessContext.kind === 'authenticated_user') {
    return {
      p_inventory_item_id: input.inventoryItemId,
      p_access_kind: 'authenticated_user',
      p_user_id: accessContext.userId,
      p_session_access_hash: null,
      p_quantity_delta: input.quantityDelta,
      p_unit: input.unit,
      p_movement_type: input.movementType,
      p_movement_origin: options.movementOrigin ?? input.movementOrigin ?? 'manual',
      p_movement_at: options.movementAt ?? input.movementAt ?? null,
      p_inventory_idempotency_key: input.idempotencyKey ?? null,
      p_source_event_ref: input.sourceEventRef ?? null,
      p_note: input.note ?? null,
      p_movement_id: options.movementId ?? input.id ?? null,
      p_created_at: options.createdAt ?? input.createdAt ?? null,
    }
  }

  return {
    p_inventory_item_id: input.inventoryItemId,
    p_access_kind: 'session',
    p_user_id: null,
    p_session_access_hash: resolveSessionAccessHash(accessContext, deriveSessionAccessHash),
    p_quantity_delta: input.quantityDelta,
    p_unit: input.unit,
    p_movement_type: input.movementType,
    p_movement_origin: options.movementOrigin ?? input.movementOrigin ?? 'manual',
    p_movement_at: options.movementAt ?? input.movementAt ?? null,
    p_inventory_idempotency_key: input.idempotencyKey ?? null,
    p_source_event_ref: input.sourceEventRef ?? null,
    p_note: input.note ?? null,
    p_movement_id: options.movementId ?? input.id ?? null,
    p_created_at: options.createdAt ?? input.createdAt ?? null,
  }
}

function extractRpcErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((value) => typeof value === 'string')
      .map(String)

    return parts.join(' ')
  }

  return ''
}

export function mapAppendFertilizerInventoryCoreMovementRpcError(
  error: unknown,
): FertilizerInventoryRepositoryError {
  const message = extractRpcErrorMessage(error)

  for (const rpcCode of FERTILIZER_INVENTORY_APPEND_MOVEMENT_RPC_ERROR_CODES) {
    if (message.includes(rpcCode)) {
      return new FertilizerInventoryRepositoryError(
        RPC_ERROR_TO_REPOSITORY_CODE[rpcCode],
        `Inventory movement append failed (${rpcCode}).`,
      )
    }
  }

  return new FertilizerInventoryRepositoryError(
    'persistence_unavailable',
    'Inventory movement append failed.',
  )
}

export function mapAppendFertilizerInventoryCoreMovementRpcResult(
  payload: unknown,
): FertilizerInventoryMovement {
  if (!payload || typeof payload !== 'object') {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory movement RPC returned an empty payload.',
    )
  }

  const movement = mapMovementRowToInventoryMovement(payload as FertilizerInventoryMovementRow)
  validateStoredInventoryMovementRecord(movement)
  return movement
}
