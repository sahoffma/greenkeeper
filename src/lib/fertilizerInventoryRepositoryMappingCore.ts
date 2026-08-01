import {
  FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  type FertilizerInventoryAccessKind,
  type FertilizerInventoryBaseUnit,
  type FertilizerInventoryItem,
  type FertilizerInventoryMovement,
  type FertilizerInventoryMovementOrigin,
  type FertilizerInventoryMovementType,
  FertilizerInventoryError,
} from '../types/fertilizerInventoryCore'
import { FertilizerInventoryRepositoryError } from './fertilizerInventoryRepositoryCore'
import { validateInventoryItemRecord, validateInventoryMovementRecord } from './fertilizerInventoryRecordValidationCore'

export const FERTILIZER_INVENTORY_CONTAINERS_TABLE = 'fertilizer_containers'
export const FERTILIZER_INVENTORY_MOVEMENTS_TABLE = 'fertilizer_stock_movements'

export const FERTILIZER_INVENTORY_CONTAINER_ROW_SELECT =
  'id, saved_product_profile_id, access_kind, user_id, session_access_hash, base_unit, package_size_value, package_size_unit, label, archived_at, created_at'

export const FERTILIZER_INVENTORY_MOVEMENT_ROW_SELECT =
  'id, container_id, access_kind, user_id, session_access_hash, quantity_delta, unit, movement_type, movement_origin, movement_at, inventory_idempotency_key, source_event_ref, note, created_at'

export const FERTILIZER_INVENTORY_LEGACY_CONTAINER_FIELDS = [
  'product_id',
  'recognition_candidate_id',
] as const

export const FERTILIZER_INVENTORY_LEGACY_MOVEMENT_FIELDS = ['capture_idempotency_key'] as const

export const FERTILIZER_INVENTORY_AUTH_MOVEMENT_IDEMPOTENCY_INDEX =
  'fertilizer_stock_movements_auth_inventory_idempotency_idx'

export const FERTILIZER_INVENTORY_SESSION_MOVEMENT_IDEMPOTENCY_INDEX =
  'fertilizer_stock_movements_session_inventory_idempotency_idx'

export interface FertilizerInventoryContainerRow {
  id: string
  saved_product_profile_id: string
  access_kind: FertilizerInventoryAccessKind
  user_id: string | null
  session_access_hash: string | null
  base_unit: FertilizerInventoryBaseUnit
  package_size_value: number | null
  package_size_unit: string | null
  label: string | null
  archived_at: string | null
  created_at: string
  product_id?: string | null
  recognition_candidate_id?: string | null
}

export interface FertilizerInventoryMovementRow {
  id: string
  container_id: string
  access_kind: FertilizerInventoryAccessKind
  user_id: string | null
  session_access_hash: string | null
  quantity_delta: number
  unit: FertilizerInventoryBaseUnit
  movement_type: FertilizerInventoryMovementType
  movement_origin: FertilizerInventoryMovementOrigin
  movement_at: string
  inventory_idempotency_key: string | null
  source_event_ref: string | null
  note: string | null
  created_at: string
  capture_idempotency_key?: string | null
  movement_date?: string | null
}

export type FertilizerInventoryContainerInsertRow = Omit<
  FertilizerInventoryContainerRow,
  'created_at'
> & {
  created_at?: string
  product_id: null
  recognition_candidate_id: null
}

export type FertilizerInventoryMovementInsertRow = Omit<
  FertilizerInventoryMovementRow,
  'created_at'
> & {
  created_at?: string
  capture_idempotency_key: null
  movement_date: string
}

function movementDateFromTimestamp(movementAt: string): string {
  return movementAt.slice(0, 10)
}

function inventoryStatusFromArchivedAt(archivedAt: string | null): FertilizerInventoryItem['status'] {
  return archivedAt ? 'depleted' : 'active'
}

export function mapInventoryItemToContainerRow(
  item: FertilizerInventoryItem,
): FertilizerInventoryContainerInsertRow {
  return {
    id: item.id,
    saved_product_profile_id: item.savedProductProfileId,
    access_kind: item.accessKind,
    user_id: item.userId,
    session_access_hash: item.sessionAccessHash,
    base_unit: item.baseUnit,
    package_size_value: item.packageSizeValue,
    package_size_unit: item.packageSizeUnit,
    label: item.label,
    archived_at: item.archivedAt,
    created_at: item.createdAt,
    product_id: null,
    recognition_candidate_id: null,
  }
}

export function mapContainerRowToInventoryItem(row: FertilizerInventoryContainerRow): FertilizerInventoryItem {
  assertInventoryCoreContainerRow(row)

  return {
    id: row.id,
    accessKind: row.access_kind,
    userId: row.user_id,
    sessionAccessHash: row.session_access_hash,
    savedProductProfileId: row.saved_product_profile_id,
    baseUnit: row.base_unit,
    packageSizeValue: row.package_size_value,
    packageSizeUnit:
      row.package_size_unit === 'kg' || row.package_size_unit === 'ml'
        ? row.package_size_unit
        : null,
    label: row.label,
    status: inventoryStatusFromArchivedAt(row.archived_at),
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    recordSchemaVersion: FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  }
}

export function mapInventoryMovementToRow(
  movement: FertilizerInventoryMovement,
): FertilizerInventoryMovementInsertRow {
  return {
    id: movement.id,
    container_id: movement.inventoryItemId,
    access_kind: movement.accessKind,
    user_id: movement.userId,
    session_access_hash: movement.sessionAccessHash,
    quantity_delta: movement.quantityDelta,
    unit: movement.unit,
    movement_type: movement.movementType,
    movement_origin: movement.movementOrigin,
    movement_at: movement.movementAt,
    inventory_idempotency_key: movement.idempotencyKey,
    source_event_ref: movement.sourceEventRef,
    note: movement.note,
    created_at: movement.createdAt,
    capture_idempotency_key: null,
    movement_date: movementDateFromTimestamp(movement.movementAt),
  }
}

export function mapMovementRowToInventoryMovement(
  row: FertilizerInventoryMovementRow,
): FertilizerInventoryMovement {
  assertInventoryCoreMovementRow(row)

  return {
    id: row.id,
    inventoryItemId: row.container_id,
    accessKind: row.access_kind,
    userId: row.user_id,
    sessionAccessHash: row.session_access_hash,
    quantityDelta: Number(row.quantity_delta),
    unit: row.unit,
    movementType: row.movement_type,
    movementOrigin: row.movement_origin,
    movementAt: row.movement_at,
    sourceEventRef: row.source_event_ref,
    idempotencyKey: row.inventory_idempotency_key,
    note: row.note,
    createdAt: row.created_at,
    recordSchemaVersion: FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  }
}

export function assertInventoryCoreContainerRow(row: FertilizerInventoryContainerRow): void {
  if (!row.saved_product_profile_id) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory container row is missing saved_product_profile_id.',
    )
  }

  if (!row.access_kind || !row.base_unit) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory container row is not a Phase 7a core record.',
    )
  }

  if (row.product_id != null || row.recognition_candidate_id != null) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Legacy inventory container bindings must not be mapped as core inventory items.',
    )
  }
}

export function assertInventoryCoreMovementRow(row: FertilizerInventoryMovementRow): void {
  if (!row.access_kind || !row.movement_at) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory movement row is not a Phase 7a core record.',
    )
  }

  if (row.capture_idempotency_key != null) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Legacy capture idempotency keys must not be mapped as core inventory movements.',
    )
  }
}

export function validateStoredInventoryItemRecord(item: FertilizerInventoryItem): void {
  try {
    validateInventoryItemRecord(item)
  } catch (error) {
    if (error instanceof FertilizerInventoryError) {
      throw new FertilizerInventoryRepositoryError('invalid_stored_record', error.message)
    }

    throw error
  }
}

export function validateStoredInventoryMovementRecord(movement: FertilizerInventoryMovement): void {
  try {
    validateInventoryMovementRecord(movement)
  } catch (error) {
    if (error instanceof FertilizerInventoryError) {
      throw new FertilizerInventoryRepositoryError('invalid_stored_record', error.message)
    }

    throw error
  }
}

export function mapInventoryInsertError(error: {
  code?: string | null
  message?: string | null
  details?: string | null
}): FertilizerInventoryRepositoryError {
  if (error.code === '23505') {
    const constraintHaystack = `${error.message ?? ''} ${error.details ?? ''}`
    const isInventoryIdempotencyConflict = [
      FERTILIZER_INVENTORY_AUTH_MOVEMENT_IDEMPOTENCY_INDEX,
      FERTILIZER_INVENTORY_SESSION_MOVEMENT_IDEMPOTENCY_INDEX,
    ].some((indexName) => constraintHaystack.includes(indexName))

    if (isInventoryIdempotencyConflict) {
      return new FertilizerInventoryRepositoryError(
        'idempotency_conflict',
        'Inventory movement idempotency conflict.',
      )
    }
  }

  return new FertilizerInventoryRepositoryError(
    'persistence_unavailable',
    'Inventory persistence write failed.',
  )
}