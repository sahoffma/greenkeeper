import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import {
  FERTILIZER_INVENTORY_BASE_UNITS,
  FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS,
  FERTILIZER_INVENTORY_ITEM_STATUSES,
  FERTILIZER_INVENTORY_MOVEMENT_ORIGINS,
  FERTILIZER_INVENTORY_MOVEMENT_TYPES,
  FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  FertilizerInventoryError,
  isFertilizerInventoryBaseUnit,
  type FertilizerInventoryItem,
  type FertilizerInventoryMovement,
} from '../types/fertilizerInventoryCore'
import { isValidSessionAccessHash } from './fertilizerSessionAccessHashValidationCore'

const MAX_INVENTORY_QUANTITY = 100_000
const MAX_INVENTORY_DECIMAL_PLACES = 4

function assertNonEmptyString(
  value: string | null | undefined,
  fieldName: string,
): asserts value is string {
  if (!value || !value.trim()) {
    throw new FertilizerInventoryError(
      'invalid_inventory_record',
      `${fieldName} must be a non-empty string.`,
    )
  }
}

function assertAccessScopeFields(
  accessKind: FertilizerInventoryItem['accessKind'],
  userId: string | null,
  sessionAccessHash: string | null,
): void {
  if (accessKind === 'authenticated_user') {
    assertNonEmptyString(userId, 'userId')
    if (sessionAccessHash != null) {
      throw new FertilizerInventoryError(
        'access_scope_mismatch',
        'Authenticated inventory records must not store sessionAccessHash.',
      )
    }
    return
  }

  if (accessKind === 'session') {
    if (userId != null) {
      throw new FertilizerInventoryError(
        'access_scope_mismatch',
        'Session-scoped inventory records must not store userId.',
      )
    }
    assertNonEmptyString(sessionAccessHash, 'sessionAccessHash')
    if (!isValidSessionAccessHash(sessionAccessHash)) {
      throw new FertilizerInventoryError(
        'invalid_inventory_record',
        'sessionAccessHash must be a 64-character lowercase hex digest.',
      )
    }
    return
  }

  throw new FertilizerInventoryError(
    'invalid_inventory_record',
    `Unsupported inventory access kind: ${String(accessKind)}`,
  )
}

function assertQuantityMagnitude(value: number, fieldName: string): void {
  if (!Number.isFinite(value)) {
    throw new FertilizerInventoryError(
      'invalid_quantity',
      `${fieldName} must be a finite number.`,
    )
  }

  if (Math.abs(value) > MAX_INVENTORY_QUANTITY) {
    throw new FertilizerInventoryError(
      'invalid_quantity',
      `${fieldName} exceeds the supported inventory magnitude.`,
    )
  }

  const decimalPart = String(value).split('.')[1]
  if (decimalPart && decimalPart.length > MAX_INVENTORY_DECIMAL_PLACES) {
    throw new FertilizerInventoryError(
      'invalid_quantity',
      `${fieldName} supports at most ${MAX_INVENTORY_DECIMAL_PLACES} decimal places.`,
    )
  }
}

function assertPackageSize(
  packageSizeValue: number | null,
  packageSizeUnit: FertilizerInventoryItem['packageSizeUnit'],
  baseUnit: FertilizerInventoryItem['baseUnit'],
): void {
  if (packageSizeValue == null && packageSizeUnit == null) {
    return
  }

  if (packageSizeValue == null || packageSizeUnit == null) {
    throw new FertilizerInventoryError(
      'invalid_inventory_record',
      'packageSizeValue and packageSizeUnit must both be set or both be null.',
    )
  }

  if (packageSizeValue <= 0) {
    throw new FertilizerInventoryError(
      'invalid_inventory_record',
      'packageSizeValue must be greater than zero when set.',
    )
  }

  assertQuantityMagnitude(packageSizeValue, 'packageSizeValue')

  if (packageSizeUnit !== baseUnit) {
    throw new FertilizerInventoryError(
      'package_size_unit_mismatch',
      'packageSizeUnit must match the item baseUnit.',
    )
  }
}

export function assertNoForbiddenInventoryItemFields(record: Record<string, unknown>): void {
  for (const field of FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      throw new FertilizerInventoryError(
        'forbidden_inventory_field',
        `Inventory items must not persist forbidden field "${field}".`,
      )
    }
  }
}

export function validateInventoryItemRecord(item: FertilizerInventoryItem): void {
  assertNoForbiddenInventoryItemFields(item as unknown as Record<string, unknown>)

  assertNonEmptyString(item.id, 'id')
  assertNonEmptyString(item.savedProductProfileId, 'savedProductProfileId')
  assertNonEmptyString(item.createdAt, 'createdAt')

  if (item.recordSchemaVersion !== FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION) {
    throw new FertilizerInventoryError(
      'invalid_inventory_record',
      `Unsupported inventory record schema version: ${item.recordSchemaVersion}`,
    )
  }

  if (!isFertilizerInventoryBaseUnit(item.baseUnit)) {
    throw new FertilizerInventoryError(
      'unsupported_base_unit',
      `Unsupported inventory base unit: ${item.baseUnit}`,
    )
  }

  if (!(FERTILIZER_INVENTORY_ITEM_STATUSES as readonly string[]).includes(item.status)) {
    throw new FertilizerInventoryError(
      'invalid_inventory_record',
      `Unsupported inventory item status: ${item.status}`,
    )
  }

  assertAccessScopeFields(item.accessKind, item.userId, item.sessionAccessHash)
  assertPackageSize(item.packageSizeValue, item.packageSizeUnit, item.baseUnit)
}

export function validateInventoryMovementRecord(movement: FertilizerInventoryMovement): void {
  assertNonEmptyString(movement.id, 'id')
  assertNonEmptyString(movement.inventoryItemId, 'inventoryItemId')
  assertNonEmptyString(movement.movementAt, 'movementAt')
  assertNonEmptyString(movement.createdAt, 'createdAt')

  if (movement.recordSchemaVersion !== FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION) {
    throw new FertilizerInventoryError(
      'invalid_inventory_record',
      `Unsupported inventory record schema version: ${movement.recordSchemaVersion}`,
    )
  }

  if (movement.quantityDelta === 0) {
    throw new FertilizerInventoryError(
      'invalid_quantity',
      'quantityDelta must not be zero.',
    )
  }

  assertQuantityMagnitude(movement.quantityDelta, 'quantityDelta')

  if (!isFertilizerInventoryBaseUnit(movement.unit)) {
    throw new FertilizerInventoryError(
      'unsupported_base_unit',
      `Unsupported movement unit: ${movement.unit}`,
    )
  }

  if (!(FERTILIZER_INVENTORY_MOVEMENT_TYPES as readonly string[]).includes(movement.movementType)) {
    throw new FertilizerInventoryError(
      'invalid_inventory_record',
      `Unsupported movement type: ${movement.movementType}`,
    )
  }

  if (
    !(FERTILIZER_INVENTORY_MOVEMENT_ORIGINS as readonly string[]).includes(movement.movementOrigin)
  ) {
    throw new FertilizerInventoryError(
      'invalid_inventory_record',
      `Unsupported movement origin: ${movement.movementOrigin}`,
    )
  }

  assertAccessScopeFields(movement.accessKind, movement.userId, movement.sessionAccessHash)
}

export function validateMovementMatchesItem(
  movement: FertilizerInventoryMovement,
  item: FertilizerInventoryItem,
): void {
  if (movement.inventoryItemId !== item.id) {
    throw new FertilizerInventoryError(
      'invalid_inventory_record',
      'Movement inventoryItemId must match the target inventory item.',
    )
  }

  if (movement.unit !== item.baseUnit) {
    throw new FertilizerInventoryError(
      'unit_mismatch',
      'Movement unit must match the inventory item baseUnit.',
    )
  }

  if (movement.accessKind !== item.accessKind) {
    throw new FertilizerInventoryError(
      'access_scope_mismatch',
      'Movement access scope must match the inventory item access scope.',
    )
  }

  if (item.accessKind === 'authenticated_user') {
    if (movement.userId !== item.userId) {
      throw new FertilizerInventoryError(
        'access_scope_mismatch',
        'Movement userId must match the inventory item userId.',
      )
    }
    return
  }

  if (movement.sessionAccessHash !== item.sessionAccessHash) {
    throw new FertilizerInventoryError(
      'access_scope_mismatch',
      'Movement sessionAccessHash must match the inventory item sessionAccessHash.',
    )
  }
}

export function inventoryItemMatchesAccessContext(
  item: FertilizerInventoryItem,
  accessContext: FertilizerEnrichmentAccessContext,
  sessionAccessHash?: string | null,
): boolean {
  if (accessContext.kind === 'authenticated_user') {
    return item.accessKind === 'authenticated_user' && item.userId === accessContext.userId
  }

  if (item.accessKind !== 'session' || !item.sessionAccessHash) {
    return false
  }

  return sessionAccessHash != null && item.sessionAccessHash === sessionAccessHash
}

export function inventoryMovementMatchesAccessContext(
  movement: FertilizerInventoryMovement,
  accessContext: FertilizerEnrichmentAccessContext,
  sessionAccessHash?: string | null,
): boolean {
  if (accessContext.kind === 'authenticated_user') {
    return movement.accessKind === 'authenticated_user' && movement.userId === accessContext.userId
  }

  if (movement.accessKind !== 'session' || !movement.sessionAccessHash) {
    return false
  }

  return sessionAccessHash != null && movement.sessionAccessHash === sessionAccessHash
}

export function listSupportedInventoryBaseUnits(): readonly FertilizerInventoryItem['baseUnit'][] {
  return FERTILIZER_INVENTORY_BASE_UNITS
}
