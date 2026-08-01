import {
  FertilizerInventoryError,
  type FertilizerInventoryMovement,
} from '../types/fertilizerInventoryCore'
import {
  assertInventoryQuantityPrecision,
  normalizeInventoryQuantity,
  scaleInventoryQuantity,
  unscaleInventoryQuantity,
} from './fertilizerInventoryQuantityCore'

export function computeInventoryItemBalance(movements: readonly FertilizerInventoryMovement[]): number {
  let scaledBalance = 0

  for (const movement of movements) {
    assertInventoryQuantityPrecision(movement.quantityDelta, 'quantityDelta')
    scaledBalance += scaleInventoryQuantity(movement.quantityDelta, 'quantityDelta')
  }

  return normalizeInventoryQuantity(unscaleInventoryQuantity(scaledBalance), 'balance')
}

export function isZeroInventoryBalance(balance: number): boolean {
  return normalizeInventoryQuantity(balance, 'balance') === 0
}

export function assertNonNegativeInventoryBalance(balance: number): void {
  const normalizedBalance = normalizeInventoryQuantity(balance, 'balance')

  if (normalizedBalance < 0) {
    throw new FertilizerInventoryError(
      'invalid_quantity',
      'Inventory balance must not be negative.',
    )
  }
}

export function projectInventoryItemBalanceAfterMovement(
  existingMovements: readonly FertilizerInventoryMovement[],
  movement: FertilizerInventoryMovement,
): number {
  return computeInventoryItemBalance([...existingMovements, movement])
}

export function validateInventoryItemBalanceFromMovements(
  movements: readonly FertilizerInventoryMovement[],
): number {
  const balance = computeInventoryItemBalance(movements)
  assertNonNegativeInventoryBalance(balance)
  return balance
}
