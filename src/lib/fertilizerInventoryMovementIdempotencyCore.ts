import type { AppendFertilizerInventoryMovementInput } from './fertilizerInventoryRepositoryCore'
import type { FertilizerInventoryMovement } from '../types/fertilizerInventoryCore'

export function inventoryMovementIdempotencyPayloadMatches(
  existing: FertilizerInventoryMovement,
  input: AppendFertilizerInventoryMovementInput,
  inventoryItemId: string,
): boolean {
  return (
    existing.inventoryItemId === inventoryItemId &&
    existing.quantityDelta === input.quantityDelta &&
    existing.unit === input.unit &&
    existing.movementType === input.movementType
  )
}
