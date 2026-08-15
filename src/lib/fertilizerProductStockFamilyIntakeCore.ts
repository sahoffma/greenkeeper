import type { ActiveProductStockReadRow } from './fertilizerProductStockReadCore'
import { buildFertilizerProductFamilyKey } from './fertilizerProductVersionProjectionCore'

export interface ResolveSavedProductProfileIdForFamilyStockIntakeInput {
  productFamilyKey: string
  baseUnit: 'kg' | 'ml'
  newSavedProductProfileId: string
  activeStockRows: ActiveProductStockReadRow[]
}

export interface ResolveSavedProductProfileIdForFamilyStockIntakeResult {
  savedProductProfileId: string
  matchedExistingStock: boolean
  matchedInventoryItemId: string | null
}

export function buildProductFamilyKeyFromStockRow(
  row: Pick<
    ActiveProductStockReadRow,
    'manufacturer' | 'productLine' | 'officialName' | 'variant' | 'productFamilyKey'
  >,
): string | null {
  if (row.productFamilyKey?.trim()) {
    return row.productFamilyKey.trim()
  }

  return buildFertilizerProductFamilyKey({
    manufacturer: row.manufacturer ?? '',
    productLine: row.productLine ?? null,
    officialName: row.officialName ?? '',
    variant: row.variant ?? null,
  })
}

export function resolveSavedProductProfileIdForFamilyStockIntake(
  input: ResolveSavedProductProfileIdForFamilyStockIntakeInput,
): ResolveSavedProductProfileIdForFamilyStockIntakeResult {
  const matchingRows = input.activeStockRows.filter((row) => {
    if (row.baseUnit !== input.baseUnit) {
      return false
    }

    const rowFamilyKey = buildProductFamilyKeyFromStockRow(row)
    return rowFamilyKey === input.productFamilyKey
  })

  if (matchingRows.length === 0) {
    return {
      savedProductProfileId: input.newSavedProductProfileId,
      matchedExistingStock: false,
      matchedInventoryItemId: null,
    }
  }

  const preferred =
    matchingRows.find((row) => row.savedProductProfileId !== input.newSavedProductProfileId) ??
    matchingRows[0]!

  return {
    savedProductProfileId: preferred.savedProductProfileId,
    matchedExistingStock: true,
    matchedInventoryItemId: preferred.inventoryItemId,
  }
}
