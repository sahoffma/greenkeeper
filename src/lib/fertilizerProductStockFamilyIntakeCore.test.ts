import { describe, expect, it } from 'vitest'
import {
  buildProductFamilyKeyFromStockRow,
  resolveSavedProductProfileIdForFamilyStockIntake,
} from './fertilizerProductStockFamilyIntakeCore'
import type { ActiveProductStockReadRow } from './fertilizerProductStockReadCore'

const FAMILY_KEY = 'rasendoktor|professional|stress-manager|0-0-30'

function stockRow(overrides: Partial<ActiveProductStockReadRow> = {}): ActiveProductStockReadRow {
  return {
    inventoryItemId: 'item-existing',
    savedProductProfileId: 'profile-existing',
    baseUnit: 'kg',
    balance: 5,
    manufacturer: 'Rasendoktor GmbH',
    officialName: 'Stress-Manager',
    productLine: 'Professional',
    variant: '0-0-30',
    productForm: 'granular',
    movementCount: 1,
    lastMovementAt: '2026-07-29T10:00:00.000Z',
    ...overrides,
  }
}

describe('fertilizerProductStockFamilyIntakeCore', () => {
  it('aggregates intake onto existing canonical product stock for the same family', () => {
    const resolution = resolveSavedProductProfileIdForFamilyStockIntake({
      productFamilyKey: FAMILY_KEY,
      baseUnit: 'kg',
      newSavedProductProfileId: 'profile-new-version',
      activeStockRows: [stockRow()],
    })

    expect(resolution.matchedExistingStock).toBe(true)
    expect(resolution.savedProductProfileId).toBe('profile-existing')
    expect(resolution.matchedInventoryItemId).toBe('item-existing')
  })

  it('keeps truly different products separate', () => {
    const resolution = resolveSavedProductProfileIdForFamilyStockIntake({
      productFamilyKey: FAMILY_KEY,
      baseUnit: 'kg',
      newSavedProductProfileId: 'profile-new-version',
      activeStockRows: [
        stockRow({
          manufacturer: 'Other Brand',
          officialName: 'Other Product',
          productLine: 'Standard',
          variant: '10-10-10',
          savedProductProfileId: 'profile-other',
          inventoryItemId: 'item-other',
        }),
      ],
    })

    expect(resolution.matchedExistingStock).toBe(false)
    expect(resolution.savedProductProfileId).toBe('profile-new-version')
  })

  it('builds the same family key from stock row identity fields', () => {
    expect(buildProductFamilyKeyFromStockRow(stockRow())).toBe(FAMILY_KEY)
  })
})
