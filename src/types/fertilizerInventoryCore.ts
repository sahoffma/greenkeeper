import type { FertilizerEnrichmentAccessContextKind } from './fertilizerEnrichmentOrchestration'
import type { ProductProfileForm } from './productProfile'

// ---------------------------------------------------------------------------
// Specification
// ---------------------------------------------------------------------------

export const FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION = 'fertilizer-inventory-core-v1' as const

export type FertilizerInventoryRecordSchemaVersion =
  typeof FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION

// ---------------------------------------------------------------------------
// Access scope (Phase 5 parity — no separate inventory access model)
// ---------------------------------------------------------------------------

export type FertilizerInventoryAccessKind = FertilizerEnrichmentAccessContextKind

// ---------------------------------------------------------------------------
// Units (DL-021 — internal base units only; no automatic conversion)
// ---------------------------------------------------------------------------

export const FERTILIZER_INVENTORY_BASE_UNITS = ['kg', 'ml'] as const

export type FertilizerInventoryBaseUnit = (typeof FERTILIZER_INVENTORY_BASE_UNITS)[number]

// ---------------------------------------------------------------------------
// Movement vocabulary (aligned with legacy fertilizer_inventory migration)
// ---------------------------------------------------------------------------

export const FERTILIZER_INVENTORY_MOVEMENT_TYPES = [
  'purchase',
  'initial_stock',
  'gift_received',
  'sale',
  'gifted_away',
  'disposal',
  'fertilization',
  'inventory_correction',
] as const

export type FertilizerInventoryMovementType =
  (typeof FERTILIZER_INVENTORY_MOVEMENT_TYPES)[number]

export const FERTILIZER_INVENTORY_MOVEMENT_ORIGINS = [
  'manual',
  'journal',
  'system',
  'migration',
] as const

export type FertilizerInventoryMovementOrigin =
  (typeof FERTILIZER_INVENTORY_MOVEMENT_ORIGINS)[number]

// ---------------------------------------------------------------------------
// Item status (conceptual — not a quantity substitute)
// ---------------------------------------------------------------------------

export const FERTILIZER_INVENTORY_ITEM_STATUSES = ['active', 'depleted'] as const

export type FertilizerInventoryItemStatus =
  (typeof FERTILIZER_INVENTORY_ITEM_STATUSES)[number]

// ---------------------------------------------------------------------------
// Forbidden persisted fields (DL-019, DL-025 — no derived quantity on item)
// ---------------------------------------------------------------------------

export const FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS = [
  'currentQuantity',
  'currentBalance',
  'balance',
  'remainingAmount',
  'remainingQuantity',
  'stockQuantity',
  'availableQuantity',
  'quantity',
  'manufacturer',
  'productLine',
  'officialName',
  'variant',
  'npkDeclaration',
  'nitrogen',
  'phosphate',
  'potash',
  'nutrientMatrix',
  'compositionFingerprint',
  'compositionFingerprintVersion',
  'productFamilyKey',
  'identityFingerprint',
  'productForm',
  'catalogProductId',
  'recognitionCandidateId',
  'productId',
] as const

export type FertilizerInventoryForbiddenItemField =
  (typeof FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS)[number]

// ---------------------------------------------------------------------------
// Domain records
// ---------------------------------------------------------------------------

/** Physical package (Gebinde) bound to one saved product version — DL-024. */
export interface FertilizerInventoryItem {
  id: string
  accessKind: FertilizerInventoryAccessKind
  userId: string | null
  sessionAccessHash: string | null
  /** Immutable saved product version reference — sole product binding (DL-018, DL-020). */
  savedProductProfileId: string
  /** Internal base unit derived from product form — not client-trusted at persistence time. */
  baseUnit: FertilizerInventoryBaseUnit
  /** Nominal physical package size (e.g. 25 kg sack) — not current content (AD-7A-02). */
  packageSizeValue: number | null
  packageSizeUnit: FertilizerInventoryBaseUnit | null
  label: string | null
  status: FertilizerInventoryItemStatus
  createdAt: string
  archivedAt: string | null
  recordSchemaVersion: FertilizerInventoryRecordSchemaVersion
}

/** Immutable quantity change for one inventory item — sole mutation path (DL-019). */
export interface FertilizerInventoryMovement {
  id: string
  inventoryItemId: string
  accessKind: FertilizerInventoryAccessKind
  userId: string | null
  sessionAccessHash: string | null
  quantityDelta: number
  unit: FertilizerInventoryBaseUnit
  movementType: FertilizerInventoryMovementType
  movementOrigin: FertilizerInventoryMovementOrigin
  movementAt: string
  sourceEventRef: string | null
  idempotencyKey: string | null
  note: string | null
  createdAt: string
  recordSchemaVersion: FertilizerInventoryRecordSchemaVersion
}

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

export const FERTILIZER_INVENTORY_ERROR_CODES = [
  'invalid_inventory_record',
  'access_scope_mismatch',
  'unit_mismatch',
  'invalid_quantity',
  'forbidden_inventory_field',
  'unsupported_base_unit',
  'package_size_unit_mismatch',
  'product_form_mismatch',
  'immutable_movement_violation',
  'product_version_not_found',
  'unsupported_product_version_status',
] as const

export type FertilizerInventoryErrorCode = (typeof FERTILIZER_INVENTORY_ERROR_CODES)[number]

export class FertilizerInventoryError extends Error {
  readonly code: FertilizerInventoryErrorCode

  constructor(code: FertilizerInventoryErrorCode, message: string) {
    super(message)
    this.name = 'FertilizerInventoryError'
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Product form → base unit (DL-021 — no kg/l or kg/ml conversion)
// ---------------------------------------------------------------------------

export function resolveInventoryBaseUnitFromProductForm(
  productForm: ProductProfileForm,
): FertilizerInventoryBaseUnit {
  return productForm === 'liquid' ? 'ml' : 'kg'
}

export function isFertilizerInventoryBaseUnit(
  value: string,
): value is FertilizerInventoryBaseUnit {
  return (FERTILIZER_INVENTORY_BASE_UNITS as readonly string[]).includes(value)
}
