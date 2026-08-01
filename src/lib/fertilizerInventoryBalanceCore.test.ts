import { describe, expect, it } from 'vitest'
import { FertilizerInventoryError } from '../types/fertilizerInventoryCore'
import {
  assertNonNegativeInventoryBalance,
  computeInventoryItemBalance,
  isZeroInventoryBalance,
  projectInventoryItemBalanceAfterMovement,
  validateInventoryItemBalanceFromMovements,
} from './fertilizerInventoryBalanceCore'
import {
  buildPhase7AInitialStockScenario,
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

describe('fertilizerInventoryBalanceCore', () => {
  it('computes a simple inbound movement balance', () => {
    const movement = buildPhase7AInventoryMovement({ quantityDelta: 25 })

    expect(computeInventoryItemBalance([movement])).toBe(25)
  })

  it('computes balance after inbound and multiple outbound movements', () => {
    const { initialMovement, applicationMovement } = buildPhase7AInitialStockScenario()
    const secondApplication = buildPhase7AInventoryMovement({
      id: 'movement-application-2',
      quantityDelta: -5,
      movementType: 'fertilization',
    })

    expect(
      computeInventoryItemBalance([initialMovement, applicationMovement, secondApplication]),
    ).toBe(12)
  })

  it('returns zero balance when inbound and outbound movements cancel out', () => {
    const inbound = buildPhase7AInventoryMovement({
      id: 'movement-inbound',
      quantityDelta: 25,
      movementType: 'initial_stock',
    })
    const outbound = buildPhase7AInventoryMovement({
      id: 'movement-outbound',
      quantityDelta: -25,
      movementType: 'fertilization',
    })

    const balance = computeInventoryItemBalance([inbound, outbound])

    expect(balance).toBe(0)
    expect(isZeroInventoryBalance(balance)).toBe(true)
  })

  it('projects balance after appending a movement without persisting a balance field', () => {
    const { initialMovement, applicationMovement } = buildPhase7AInitialStockScenario()

    expect(projectInventoryItemBalanceAfterMovement([initialMovement], applicationMovement)).toBe(17)
  })

  it('rejects negative balances', () => {
    expectInventoryError(() => assertNonNegativeInventoryBalance(-0.0001), 'invalid_quantity')
  })

  it('accepts zero balance as valid non-negative inventory state', () => {
    expect(() => assertNonNegativeInventoryBalance(0)).not.toThrow()
    expect(validateInventoryItemBalanceFromMovements([])).toBe(0)
  })

  it('validates a non-negative balance derived from movements', () => {
    const { initialMovement, applicationMovement } = buildPhase7AInitialStockScenario()

    expect(
      validateInventoryItemBalanceFromMovements([initialMovement, applicationMovement]),
    ).toBe(17)
  })

  it('rejects movement histories that produce a negative balance', () => {
    const inbound = buildPhase7AInventoryMovement({ quantityDelta: 25 })
    const outbound = buildPhase7AInventoryMovement({
      id: 'movement-overdraw',
      quantityDelta: -26,
    })

    expectInventoryError(
      () => validateInventoryItemBalanceFromMovements([inbound, outbound]),
      'invalid_quantity',
    )
  })

  it('does not mutate movement records while computing balance', () => {
    const movements = [
      buildPhase7AInventoryMovement({ id: 'movement-1', quantityDelta: 25 }),
      buildPhase7AInventoryMovement({ id: 'movement-2', quantityDelta: -8 }),
    ]
    const snapshot = structuredClone(movements)

    computeInventoryItemBalance(movements)

    expect(movements).toEqual(snapshot)
  })
})
