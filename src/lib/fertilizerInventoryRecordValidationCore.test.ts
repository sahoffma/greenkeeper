import { describe, expect, it } from 'vitest'
import { FertilizerInventoryError } from '../types/fertilizerInventoryCore'
import {
  assertNoForbiddenInventoryItemFields,
  inventoryItemMatchesAccessContext,
  inventoryMovementMatchesAccessContext,
  listSupportedInventoryBaseUnits,
  validateInventoryItemRecord,
  validateInventoryMovementRecord,
  validateMovementMatchesItem,
} from './fertilizerInventoryRecordValidationCore'
import {
  PHASE7A_SESSION_HASH,
  buildPhase7AInitialStockScenario,
  buildPhase7AInventoryItem,
  buildPhase7AInventoryMovement,
  phase7AAuthenticatedAccessContext,
  phase7ASessionAccessContext,
} from './fertilizerInventoryTestFixtures'

function expectInventoryError(action: () => void, code: FertilizerInventoryError['code']): void {
  try {
    action()
    expect.unreachable('Expected FertilizerInventoryError to be thrown.')
  } catch (error) {
    expect(error).toBeInstanceOf(FertilizerInventoryError)
    expect((error as FertilizerInventoryError).code).toBe(code)
  }
}

describe('fertilizerInventoryRecordValidationCore', () => {
  it('accepts a valid authenticated inventory item with nominal package size only', () => {
    expect(() => validateInventoryItemRecord(buildPhase7AInventoryItem())).not.toThrow()
  })

  it('accepts a valid session-scoped inventory item', () => {
    expect(() =>
      validateInventoryItemRecord(
        buildPhase7AInventoryItem({
          accessKind: 'session',
          userId: null,
          sessionAccessHash: PHASE7A_SESSION_HASH,
        }),
      ),
    ).not.toThrow()
  })

  it('rejects forbidden quantity fields on inventory items', () => {
    expectInventoryError(
      () =>
        assertNoForbiddenInventoryItemFields({
          id: 'item-1',
          currentQuantity: 17,
        }),
      'forbidden_inventory_field',
    )
  })

  it('rejects forbidden duplicated product fields on inventory items', () => {
    expectInventoryError(
      () =>
        assertNoForbiddenInventoryItemFields({
          id: 'item-1',
          officialName: 'Stressmanager',
        }),
      'forbidden_inventory_field',
    )
  })

  it('rejects authenticated items that store sessionAccessHash', () => {
    expectInventoryError(
      () =>
        validateInventoryItemRecord(
          buildPhase7AInventoryItem({
            sessionAccessHash: PHASE7A_SESSION_HASH,
          }),
        ),
      'access_scope_mismatch',
    )
  })

  it('rejects package size unit that differs from baseUnit', () => {
    expectInventoryError(
      () =>
        validateInventoryItemRecord(
          buildPhase7AInventoryItem({
            baseUnit: 'kg',
            packageSizeUnit: 'ml',
          }),
        ),
      'package_size_unit_mismatch',
    )
  })

  it('rejects movements with zero quantityDelta', () => {
    expectInventoryError(
      () =>
        validateInventoryMovementRecord(
          buildPhase7AInventoryMovement({
            quantityDelta: 0,
          }),
        ),
      'invalid_quantity',
    )
  })

  it('rejects unsupported movement units', () => {
    expectInventoryError(
      () =>
        validateInventoryMovementRecord(
          buildPhase7AInventoryMovement({
            unit: 'l' as 'kg',
          }),
        ),
      'unsupported_base_unit',
    )
  })

  it('requires movement unit to match item baseUnit', () => {
    const item = buildPhase7AInventoryItem({ baseUnit: 'kg' })
    const movement = buildPhase7AInventoryMovement({ unit: 'ml' })

    expectInventoryError(() => validateMovementMatchesItem(movement, item), 'unit_mismatch')
  })

  it('validates the AD-7A-02 example: 25 kg package with +25 and -8 movements', () => {
    const { item, initialMovement, applicationMovement } = buildPhase7AInitialStockScenario()

    validateInventoryItemRecord(item)
    validateInventoryMovementRecord(initialMovement)
    validateInventoryMovementRecord(applicationMovement)
    validateMovementMatchesItem(initialMovement, item)
    validateMovementMatchesItem(applicationMovement, item)

    expect(item.packageSizeValue).toBe(25)
    expect(initialMovement.quantityDelta).toBe(25)
    expect(applicationMovement.quantityDelta).toBe(-8)
  })

  it('matches inventory records against Phase 5 access contexts', () => {
    const item = buildPhase7AInventoryItem()
    const movement = buildPhase7AInventoryMovement()

    expect(
      inventoryItemMatchesAccessContext(item, phase7AAuthenticatedAccessContext()),
    ).toBe(true)
    expect(
      inventoryMovementMatchesAccessContext(movement, phase7AAuthenticatedAccessContext()),
    ).toBe(true)
    expect(
      inventoryItemMatchesAccessContext(item, phase7ASessionAccessContext(), PHASE7A_SESSION_HASH),
    ).toBe(false)
  })

  it('matches session-scoped inventory records with derived session hash', () => {
    const item = buildPhase7AInventoryItem({
      accessKind: 'session',
      userId: null,
      sessionAccessHash: PHASE7A_SESSION_HASH,
    })

    expect(
      inventoryItemMatchesAccessContext(item, phase7ASessionAccessContext(), PHASE7A_SESSION_HASH),
    ).toBe(true)
  })

  it('exposes only kg and ml as supported inventory base units', () => {
    expect(listSupportedInventoryBaseUnits()).toEqual(['kg', 'ml'])
  })
})
