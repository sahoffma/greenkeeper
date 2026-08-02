import type { ProductProfileForm } from '../types/productProfile'
import {
  isFertilizerInventoryBaseUnit,
  resolveInventoryBaseUnitFromProductForm,
  type FertilizerInventoryBaseUnit,
} from '../types/fertilizerInventoryCore'
import { assertInventoryQuantityPrecision } from './fertilizerInventoryQuantityCore'

// ---------------------------------------------------------------------------
// GA-015 Phase 1 — product-based stock identity and positive intake (DL-033)
// Domain-only: no persistence, no package/container identity, no currentQuantity.
// ---------------------------------------------------------------------------

export const FERTILIZER_PRODUCT_STOCK_INTAKE_REASONS = [
  'initial_stock',
  'purchase',
  'gift_received',
] as const

export type FertilizerProductStockIntakeReason =
  (typeof FERTILIZER_PRODUCT_STOCK_INTAKE_REASONS)[number]

/** Canonical product-stock identity — (userId, savedProductProfileId, baseUnit). */
export interface FertilizerProductStockIdentity {
  userId: string
  savedProductProfileId: string
  baseUnit: FertilizerInventoryBaseUnit
}

/** Immutable saved-profile snapshot for form ↔ base-unit compatibility (no lookup). */
export interface FertilizerProductStockProfileSnapshot {
  productForm: ProductProfileForm
}

export interface FertilizerProductStockIntakeInput {
  userId: string
  savedProductProfileId: string
  baseUnit: FertilizerInventoryBaseUnit
  quantity: number
  reason: FertilizerProductStockIntakeReason
}

export interface ValidateFertilizerProductStockIntakeOptions {
  profileSnapshot?: FertilizerProductStockProfileSnapshot
}

/** Validated positive intake — one movement on the canonical product stock. */
export interface ValidatedFertilizerProductStockIntake {
  stockIdentity: FertilizerProductStockIdentity
  quantity: number
  baseUnit: FertilizerInventoryBaseUnit
  reason: FertilizerProductStockIntakeReason
  /** Signed movement amount — always strictly positive for intake. */
  quantityDelta: number
}

export const FERTILIZER_PRODUCT_STOCK_ERROR_CODES = [
  'product_stock_user_id_invalid',
  'product_stock_saved_profile_id_invalid',
  'product_stock_base_unit_invalid',
  'product_stock_quantity_invalid',
  'product_stock_quantity_precision_invalid',
  'product_stock_intake_reason_invalid',
  'product_stock_form_unit_mismatch',
] as const

export type FertilizerProductStockErrorCode =
  (typeof FERTILIZER_PRODUCT_STOCK_ERROR_CODES)[number]

export class FertilizerProductStockError extends Error {
  readonly code: FertilizerProductStockErrorCode
  readonly field?: string

  constructor(
    code: FertilizerProductStockErrorCode,
    message: string,
    options: { field?: string } = {},
  ) {
    super(message)
    this.name = 'FertilizerProductStockError'
    this.code = code
    this.field = options.field
  }
}

const SAVED_PRODUCT_PROFILE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const PRODUCT_STOCK_IDENTITY_KEY_SEPARATOR = '\u001f'

function throwProductStockError(
  code: FertilizerProductStockErrorCode,
  message: string,
  options: { field?: string } = {},
): never {
  throw new FertilizerProductStockError(code, message, options)
}

export function validateFertilizerProductStockUserId(userId: string): string {
  const trimmed = userId.trim()

  if (!trimmed) {
    throwProductStockError(
      'product_stock_user_id_invalid',
      'userId must be a non-empty string.',
      { field: 'userId' },
    )
  }

  return trimmed
}

export function validateFertilizerProductStockSavedProfileId(
  savedProductProfileId: string,
): string {
  const trimmed = savedProductProfileId.trim()

  if (!trimmed) {
    throwProductStockError(
      'product_stock_saved_profile_id_invalid',
      'savedProductProfileId must be a non-empty UUID.',
      { field: 'savedProductProfileId' },
    )
  }

  if (!SAVED_PRODUCT_PROFILE_ID_PATTERN.test(trimmed)) {
    throwProductStockError(
      'product_stock_saved_profile_id_invalid',
      'savedProductProfileId must be a valid UUID.',
      { field: 'savedProductProfileId' },
    )
  }

  return trimmed.toLowerCase()
}

export function validateFertilizerProductStockBaseUnit(
  baseUnit: unknown,
): FertilizerInventoryBaseUnit {
  if (typeof baseUnit !== 'string' || !isFertilizerInventoryBaseUnit(baseUnit)) {
    throwProductStockError(
      'product_stock_base_unit_invalid',
      'baseUnit must be kg or ml.',
      { field: 'baseUnit' },
    )
  }

  return baseUnit
}

export function buildFertilizerProductStockIdentity(input: {
  userId: string
  savedProductProfileId: string
  baseUnit: FertilizerInventoryBaseUnit
}): FertilizerProductStockIdentity {
  return {
    userId: validateFertilizerProductStockUserId(input.userId),
    savedProductProfileId: validateFertilizerProductStockSavedProfileId(
      input.savedProductProfileId,
    ),
    baseUnit: validateFertilizerProductStockBaseUnit(input.baseUnit),
  }
}

/** Deterministic serialized key — not a database unique constraint substitute. */
export function serializeFertilizerProductStockIdentityKey(
  identity: FertilizerProductStockIdentity,
): string {
  return [
    identity.userId,
    identity.savedProductProfileId,
    identity.baseUnit,
  ].join(PRODUCT_STOCK_IDENTITY_KEY_SEPARATOR)
}

export function areFertilizerProductStockIdentitiesEqual(
  left: FertilizerProductStockIdentity,
  right: FertilizerProductStockIdentity,
): boolean {
  return (
    left.userId === right.userId
    && left.savedProductProfileId === right.savedProductProfileId
    && left.baseUnit === right.baseUnit
  )
}

export function validateFertilizerProductStockIntakeReason(
  reason: unknown,
): FertilizerProductStockIntakeReason {
  if (
    typeof reason !== 'string'
    || !(FERTILIZER_PRODUCT_STOCK_INTAKE_REASONS as readonly string[]).includes(reason)
  ) {
    throwProductStockError(
      'product_stock_intake_reason_invalid',
      'reason must be initial_stock, purchase, or gift_received.',
      { field: 'reason' },
    )
  }

  return reason as FertilizerProductStockIntakeReason
}

function validatePositiveIntakeQuantity(quantity: number): number {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity)) {
    throwProductStockError(
      'product_stock_quantity_invalid',
      'quantity must be a finite number greater than zero.',
      { field: 'quantity' },
    )
  }

  try {
    assertInventoryQuantityPrecision(quantity, 'quantity')
  } catch {
    throwProductStockError(
      'product_stock_quantity_precision_invalid',
      'quantity supports at most four decimal places and must be finite.',
      { field: 'quantity' },
    )
  }

  if (quantity <= 0) {
    throwProductStockError(
      'product_stock_quantity_invalid',
      'quantity must be greater than zero.',
      { field: 'quantity' },
    )
  }

  return quantity
}

export function assertProductFormMatchesBaseUnit(
  productForm: ProductProfileForm,
  baseUnit: FertilizerInventoryBaseUnit,
): void {
  const expectedUnit = resolveInventoryBaseUnitFromProductForm(productForm)

  if (baseUnit !== expectedUnit) {
    throwProductStockError(
      'product_stock_form_unit_mismatch',
      `baseUnit ${baseUnit} is incompatible with product form ${productForm}.`,
      { field: 'baseUnit' },
    )
  }
}

/**
 * Positive product-stock intake — canonical identity + movement delta.
 * Does not model packages, containers, FIFO, or persisted currentQuantity.
 */
export function validateFertilizerProductStockIntake(
  input: FertilizerProductStockIntakeInput,
  options: ValidateFertilizerProductStockIntakeOptions = {},
): ValidatedFertilizerProductStockIntake {
  const stockIdentity = buildFertilizerProductStockIdentity({
    userId: input.userId,
    savedProductProfileId: input.savedProductProfileId,
    baseUnit: input.baseUnit,
  })

  if (options.profileSnapshot) {
    assertProductFormMatchesBaseUnit(
      options.profileSnapshot.productForm,
      stockIdentity.baseUnit,
    )
  }

  const quantity = validatePositiveIntakeQuantity(input.quantity)
  const reason = validateFertilizerProductStockIntakeReason(input.reason)

  return {
    stockIdentity,
    quantity,
    baseUnit: stockIdentity.baseUnit,
    reason,
    quantityDelta: quantity,
  }
}

/** Persisted enum names for positive intake — unchanged in current schema. */
export type PersistedFertilizerProductStockIntakeMovementType =
  FertilizerProductStockIntakeReason

export function toPersistedProductStockIntakeMovementType(
  reason: FertilizerProductStockIntakeReason,
): PersistedFertilizerProductStockIntakeMovementType {
  return validateFertilizerProductStockIntakeReason(reason)
}
