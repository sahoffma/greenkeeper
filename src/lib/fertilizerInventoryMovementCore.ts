import type { ProductProfileForm } from '../types/productProfile'
import {
  FertilizerInventoryError,
  resolveInventoryBaseUnitFromProductForm,
  type FertilizerInventoryBaseUnit,
  type FertilizerInventoryItem,
  type FertilizerInventoryMovement,
} from '../types/fertilizerInventoryCore'
import {
  assertNonNegativeInventoryBalance,
  computeInventoryItemBalance,
  projectInventoryItemBalanceAfterMovement,
} from './fertilizerInventoryBalanceCore'
import { assertInventoryQuantityPrecision } from './fertilizerInventoryQuantityCore'
import {
  validateInventoryMovementRecord,
  validateMovementMatchesItem,
} from './fertilizerInventoryRecordValidationCore'

export function validateInventoryItemBaseUnitForProductForm(
  baseUnit: FertilizerInventoryBaseUnit,
  productForm: ProductProfileForm,
): void {
  const expectedBaseUnit = resolveInventoryBaseUnitFromProductForm(productForm)

  if (baseUnit !== expectedBaseUnit) {
    throw new FertilizerInventoryError(
      'product_form_mismatch',
      `Inventory base unit "${baseUnit}" does not match product form "${productForm}".`,
    )
  }
}

export function validateInventoryMovementBusinessRules(
  movement: FertilizerInventoryMovement,
  item: FertilizerInventoryItem,
  options: {
    productForm?: ProductProfileForm
    existingMovements?: readonly FertilizerInventoryMovement[]
    requireNonNegativeBalance?: boolean
  } = {},
): void {
  validateInventoryMovementRecord(movement)
  validateMovementMatchesItem(movement, item)

  if (movement.quantityDelta === 0) {
    throw new FertilizerInventoryError('invalid_quantity', 'quantityDelta must not be zero.')
  }

  assertInventoryQuantityPrecision(movement.quantityDelta, 'quantityDelta')

  if (options.productForm) {
    validateInventoryItemBaseUnitForProductForm(item.baseUnit, options.productForm)
    validateInventoryItemBaseUnitForProductForm(movement.unit, options.productForm)
  }

  if (options.requireNonNegativeBalance ?? true) {
    const existingMovements = options.existingMovements ?? []
    const projectedBalance = projectInventoryItemBalanceAfterMovement(existingMovements, movement)
    assertNonNegativeInventoryBalance(projectedBalance)
  }
}

export function validateInventoryMovementsForItem(
  movements: readonly FertilizerInventoryMovement[],
  item: FertilizerInventoryItem,
  options: {
    productForm?: ProductProfileForm
    requireNonNegativeBalance?: boolean
  } = {},
): number {
  if (options.productForm) {
    validateInventoryItemBaseUnitForProductForm(item.baseUnit, options.productForm)
  }

  let index = 0
  for (const movement of movements) {
    validateInventoryMovementBusinessRules(movement, item, {
      productForm: options.productForm,
      existingMovements: movements.slice(0, index),
      requireNonNegativeBalance: options.requireNonNegativeBalance,
    })
    index += 1
  }

  const balance = computeInventoryItemBalance(movements)

  if (options.requireNonNegativeBalance ?? true) {
    assertNonNegativeInventoryBalance(balance)
  }

  return balance
}

export function validateAppendInventoryMovement(
  movement: FertilizerInventoryMovement,
  item: FertilizerInventoryItem,
  existingMovements: readonly FertilizerInventoryMovement[],
  options: {
    productForm?: ProductProfileForm
  } = {},
): number {
  validateInventoryMovementBusinessRules(movement, item, {
    productForm: options.productForm,
    existingMovements,
    requireNonNegativeBalance: true,
  })

  return projectInventoryItemBalanceAfterMovement(existingMovements, movement)
}

export function assertInventoryMovementsAreUnchanged(
  before: readonly FertilizerInventoryMovement[],
  after: readonly FertilizerInventoryMovement[],
): void {
  if (before.length !== after.length) {
    throw new FertilizerInventoryError(
      'immutable_movement_violation',
      'Inventory movements must not be added or removed during balance computation.',
    )
  }

  for (let index = 0; index < before.length; index += 1) {
    const original = before[index]
    const current = after[index]

    if (
      original.id !== current.id ||
      original.quantityDelta !== current.quantityDelta ||
      original.unit !== current.unit ||
      original.movementAt !== current.movementAt
    ) {
      throw new FertilizerInventoryError(
        'immutable_movement_violation',
        'Inventory movements are immutable and must not be mutated.',
      )
    }
  }
}
