import type { ActiveProductStockReadRow } from './fertilizerProductStockReadCore'
import { buildFertilizerProductFamilyKey } from './fertilizerProductVersionProjectionCore'
import {
  normalizeProductFamilyKey,
  productFamilyKeysEquivalent,
} from './fertilizerProductFamilyKeyCore'

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
  previousSavedProductProfileId: string | null
  reusedContainer: boolean
}

export function buildProductFamilyKeyFromStockRow(
  row: Pick<
    ActiveProductStockReadRow,
    'manufacturer' | 'productLine' | 'officialName' | 'variant' | 'productFamilyKey'
  >,
): string | null {
  if (row.productFamilyKey?.trim()) {
    return normalizeProductFamilyKey(row.productFamilyKey.trim())
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
  const normalizedInputFamilyKey = normalizeProductFamilyKey(input.productFamilyKey)
  if (!normalizedInputFamilyKey) {
    return {
      savedProductProfileId: input.newSavedProductProfileId,
      matchedExistingStock: false,
      matchedInventoryItemId: null,
      previousSavedProductProfileId: null,
      reusedContainer: false,
    }
  }

  const matchingRows = input.activeStockRows.filter((row) => {
    if (row.baseUnit !== input.baseUnit) {
      return false
    }

    const rowFamilyKey = buildProductFamilyKeyFromStockRow(row)
    return productFamilyKeysEquivalent(rowFamilyKey, normalizedInputFamilyKey)
  })

  if (matchingRows.length === 0) {
    return {
      savedProductProfileId: input.newSavedProductProfileId,
      matchedExistingStock: false,
      matchedInventoryItemId: null,
      previousSavedProductProfileId: null,
      reusedContainer: false,
    }
  }

  const preferred = matchingRows[0]!
  const previousSavedProductProfileId =
    preferred.savedProductProfileId !== input.newSavedProductProfileId
      ? preferred.savedProductProfileId
      : null

  return {
    savedProductProfileId: input.newSavedProductProfileId,
    matchedExistingStock: true,
    matchedInventoryItemId: preferred.inventoryItemId,
    previousSavedProductProfileId,
    reusedContainer: true,
  }
}
