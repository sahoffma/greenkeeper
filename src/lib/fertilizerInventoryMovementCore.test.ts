import { describe, expect, it } from 'vitest'
import { FertilizerInventoryError } from '../types/fertilizerInventoryCore'
import { computeInventoryItemBalance } from './fertilizerInventoryBalanceCore'
import {
  assertInventoryMovementsAreUnchanged,
  validateAppendInventoryMovement,
  validateInventoryItemBaseUnitForProductForm,
  validateInventoryMovementBusinessRules,
  validateInventoryMovementsForItem,
} from './fertilizerInventoryMovementCore'
import {
  buildPhase7AInitialStockScenario,
  buildPhase7AInventoryItem,
  buildPhase7AInventoryMovement,
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

describe('fertilizerInventoryMovementCore', () => {
  it('validates a simple inbound movement for an inventory item', () => {
    const item = buildPhase7AInventoryItem()
    const movement = buildPhase7AInventoryMovement({ quantityDelta: 25, unit: 'kg' })

    expect(
      validateAppendInventoryMovement(movement, item, [], { productForm: 'granular' }),
    ).toBe(25)
  })

  it('validates inbound and outbound movements resulting in 17 kg', () => {
    const { item, initialMovement, applicationMovement } = buildPhase7AInitialStockScenario()

    validateInventoryMovementBusinessRules(initialMovement, item, { productForm: 'granular' })
    expect(
      validateAppendInventoryMovement(applicationMovement, item, [initialMovement], {
        productForm: 'granular',
      }),
    ).toBe(17)
  })

  it('allows zero balance while keeping the item conceptually valid', () => {
    const item = buildPhase7AInventoryItem()
    const inbound = buildPhase7AInventoryMovement({
      id: 'movement-inbound',
      quantityDelta: 25,
    })
    const outbound = buildPhase7AInventoryMovement({
      id: 'movement-outbound',
      quantityDelta: -25,
      movementType: 'fertilization',
    })

    validateAppendInventoryMovement(inbound, item, [])
    expect(validateAppendInventoryMovement(outbound, item, [inbound])).toBe(0)
    expect(validateInventoryMovementsForItem([inbound, outbound], item)).toBe(0)
  })

  it('prevents append operations that would produce a negative balance', () => {
    const item = buildPhase7AInventoryItem()
    const inbound = buildPhase7AInventoryMovement({ quantityDelta: 25 })
    const overdraw = buildPhase7AInventoryMovement({
      id: 'movement-overdraw',
      quantityDelta: -26,
    })

    validateAppendInventoryMovement(inbound, item, [])

    expectInventoryError(
      () => validateAppendInventoryMovement(overdraw, item, [inbound]),
      'invalid_quantity',
    )
  })

  it('rejects zero quantityDelta movements', () => {
    const item = buildPhase7AInventoryItem()
    const movement = buildPhase7AInventoryMovement({ quantityDelta: 0 })

    expectInventoryError(
      () =>
        validateInventoryMovementBusinessRules(movement, item, {
          existingMovements: [],
        }),
      'invalid_quantity',
    )
  })

  it('rejects movement units that do not match the item baseUnit', () => {
    const item = buildPhase7AInventoryItem({ baseUnit: 'kg' })
    const movement = buildPhase7AInventoryMovement({ unit: 'ml' })

    expectInventoryError(
      () => validateInventoryMovementBusinessRules(movement, item),
      'unit_mismatch',
    )
  })

  it('separates granular kg inventory from liquid ml inventory via product form checks', () => {
    const granularItem = buildPhase7AInventoryItem({ baseUnit: 'kg' })
    const liquidItem = buildPhase7AInventoryItem({
      id: 'liquid-item',
      baseUnit: 'ml',
      packageSizeValue: 5000,
      packageSizeUnit: 'ml',
    })

    validateInventoryItemBaseUnitForProductForm(granularItem.baseUnit, 'granular')
    validateInventoryItemBaseUnitForProductForm(liquidItem.baseUnit, 'liquid')

    expectInventoryError(
      () => validateInventoryItemBaseUnitForProductForm('ml', 'granular'),
      'product_form_mismatch',
    )
    expectInventoryError(
      () => validateInventoryItemBaseUnitForProductForm('kg', 'liquid'),
      'product_form_mismatch',
    )
  })

  it('accepts decimal movement values up to four fractional digits', () => {
    const item = buildPhase7AInventoryItem()
    const inbound = buildPhase7AInventoryMovement({
      id: 'movement-decimal-in',
      quantityDelta: 0.2505,
    })
    const outbound = buildPhase7AInventoryMovement({
      id: 'movement-decimal-out',
      quantityDelta: -0.1002,
    })

    validateAppendInventoryMovement(inbound, item, [])
    expect(validateAppendInventoryMovement(outbound, item, [inbound])).toBe(0.1503)
    expect(computeInventoryItemBalance([inbound, outbound])).toBe(0.1503)
  })

  it('detects mutation of movement records after capture', () => {
    const movements = [buildPhase7AInventoryMovement({ quantityDelta: 25 })]
    const snapshot = structuredClone(movements)
    const mutated = structuredClone(movements)
    mutated[0] = { ...mutated[0], quantityDelta: 24 }

    assertInventoryMovementsAreUnchanged(snapshot, snapshot)
    expectInventoryError(
      () => assertInventoryMovementsAreUnchanged(snapshot, mutated),
      'immutable_movement_violation',
    )
  })

  it('does not mutate movements while validating sequential business rules', () => {
    const { item, initialMovement, applicationMovement } = buildPhase7AInitialStockScenario()
    const movements = [initialMovement, applicationMovement]
    const snapshot = structuredClone(movements)

    validateInventoryMovementsForItem(movements, item, { productForm: 'granular' })

    expect(movements).toEqual(snapshot)
  })
})
