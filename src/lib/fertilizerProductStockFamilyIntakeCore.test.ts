import { describe, expect, it } from 'vitest'
import {
  buildProductFamilyKeyFromStockRow,
  resolveSavedProductProfileIdForFamilyStockIntake,
} from './fertilizerProductStockFamilyIntakeCore'
import type { ActiveProductStockReadRow } from './fertilizerProductStockReadCore'

const FAMILY_KEY = 'rasendoktor|professional|stress manager|0-0-30'

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
  it('prefers an existing container for the new profile without relink when both old and new family containers exist', () => {
    const resolution = resolveSavedProductProfileIdForFamilyStockIntake({
      productFamilyKey: FAMILY_KEY,
      baseUnit: 'kg',
      newSavedProductProfileId: 'profile-new-version',
      activeStockRows: [
        stockRow({
          inventoryItemId: 'item-old',
          savedProductProfileId: 'profile-existing',
        }),
        stockRow({
          inventoryItemId: 'item-new',
          savedProductProfileId: 'profile-new-version',
        }),
      ],
    })

    expect(resolution.matchedExistingStock).toBe(true)
    expect(resolution.reusedContainer).toBe(true)
    expect(resolution.savedProductProfileId).toBe('profile-new-version')
    expect(resolution.matchedInventoryItemId).toBe('item-new')
    expect(resolution.previousSavedProductProfileId).toBeNull()
  })

  it('reuses existing container but selects the new saved profile', () => {
    const resolution = resolveSavedProductProfileIdForFamilyStockIntake({
      productFamilyKey: FAMILY_KEY,
      baseUnit: 'kg',
      newSavedProductProfileId: 'profile-new-version',
      activeStockRows: [stockRow()],
    })

    expect(resolution.matchedExistingStock).toBe(true)
    expect(resolution.reusedContainer).toBe(true)
    expect(resolution.savedProductProfileId).toBe('profile-new-version')
    expect(resolution.previousSavedProductProfileId).toBe('profile-existing')
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

  it('matches stress manager and stress-manager family keys', () => {
    expect(
      buildProductFamilyKeyFromStockRow(
        stockRow({
          productFamilyKey: 'rasendoktor|professional|stress-manager',
        }),
      ),
    ).toBe('rasendoktor|professional|stress manager')

    const resolution = resolveSavedProductProfileIdForFamilyStockIntake({
      productFamilyKey: 'rasendoktor|professional|stress-manager|0-0-30',
      baseUnit: 'kg',
      newSavedProductProfileId: 'profile-new-version',
      activeStockRows: [stockRow({ productFamilyKey: 'rasendoktor|professional|stress manager|0-0-30' })],
    })

    expect(resolution.matchedExistingStock).toBe(true)
    expect(resolution.savedProductProfileId).toBe('profile-new-version')
  })
})
