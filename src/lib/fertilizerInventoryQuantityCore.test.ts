import { describe, expect, it } from 'vitest'
import { FertilizerInventoryError } from '../types/fertilizerInventoryCore'
import {
  assertInventoryQuantityPrecision,
  normalizeInventoryQuantity,
  scaleInventoryQuantity,
} from './fertilizerInventoryQuantityCore'

function expectInventoryError(action: () => void, code: FertilizerInventoryError['code']): void {
  try {
    action()
    expect.unreachable('Expected FertilizerInventoryError to be thrown.')
  } catch (error) {
    expect(error).toBeInstanceOf(FertilizerInventoryError)
    expect((error as FertilizerInventoryError).code).toBe(code)
  }
}

describe('fertilizerInventoryQuantityCore', () => {
  it('accepts quantities with up to four decimal places', () => {
    expect(normalizeInventoryQuantity(12.5001)).toBe(12.5001)
    expect(normalizeInventoryQuantity(0.0001)).toBe(0.0001)
    expect(scaleInventoryQuantity(0.2505)).toBe(2505)
  })

  it('rejects quantities with more than four decimal places', () => {
    expectInventoryError(() => normalizeInventoryQuantity(0.00001), 'invalid_quantity')
  })

  it('rejects non-finite quantities', () => {
    expectInventoryError(() => assertInventoryQuantityPrecision(Number.NaN), 'invalid_quantity')
    expectInventoryError(() => assertInventoryQuantityPrecision(Number.POSITIVE_INFINITY), 'invalid_quantity')
  })

  it('does not apply display rounding beyond DL-021 precision normalization', () => {
    expect(normalizeInventoryQuantity(17)).toBe(17)
    expect(normalizeInventoryQuantity(17.1)).toBe(17.1)
    expect(normalizeInventoryQuantity(17.1234)).toBe(17.1234)
  })
})
