import { describe, expect, it } from 'vitest'
import {
  isRejectedProductStockOutboundReason,
  mapOutboundReasonToMovementType,
  normalizeOutboundStoredDelta,
  validateFertilizerProductStockOutbound,
} from './fertilizerProductStockOutboundCore'

const ITEM_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('fertilizerProductStockOutboundCore', () => {
  it('maps gift_given to gifted_away', () => {
    expect(mapOutboundReasonToMovementType('gift_given')).toBe('gifted_away')
  })

  it('maps disposed to disposal', () => {
    expect(mapOutboundReasonToMovementType('disposed')).toBe('disposal')
  })

  it('maps inventory_correction to inventory_correction', () => {
    expect(mapOutboundReasonToMovementType('inventory_correction')).toBe('inventory_correction')
  })

  it('stores real outflows as negative deltas from positive user input', () => {
    expect(
      normalizeOutboundStoredDelta({ reason: 'gift_given', quantity: 2 }),
    ).toEqual({ userQuantity: 2, quantityDelta: -2 })

    expect(
      normalizeOutboundStoredDelta({ reason: 'disposed', quantity: 1.5 }),
    ).toEqual({ userQuantity: 1.5, quantityDelta: -1.5 })
  })

  it('allows signed correction deltas', () => {
    expect(
      normalizeOutboundStoredDelta({ reason: 'inventory_correction', quantity: -3 }),
    ).toEqual({ userQuantity: -3, quantityDelta: -3 })

    expect(
      normalizeOutboundStoredDelta({ reason: 'inventory_correction', quantity: 2 }),
    ).toEqual({ userQuantity: 2, quantityDelta: 2 })
  })

  it('rejects zero correction deltas', () => {
    expect(() =>
      normalizeOutboundStoredDelta({ reason: 'inventory_correction', quantity: 0 }),
    ).toThrow(/non-zero/)
  })

  it('rejects wrong sign for real outflows', () => {
    expect(() => normalizeOutboundStoredDelta({ reason: 'disposed', quantity: -1 })).toThrow(
      /greater than zero/,
    )
  })

  it('rejects intake, application and migration reasons', () => {
    for (const reason of ['initial_stock', 'purchase', 'gift_received', 'application', 'legacy_balance_migration']) {
      expect(isRejectedProductStockOutboundReason(reason)).toBe(true)
      expect(() =>
        validateFertilizerProductStockOutbound({
          inventoryItemId: ITEM_ID,
          reason: reason as never,
          quantity: 1,
        }),
      ).toThrow(/not allowed/)
    }
  })

  it('keeps kg and ml separate via item context only', () => {
    const validated = validateFertilizerProductStockOutbound({
      inventoryItemId: ITEM_ID,
      reason: 'gift_given',
      quantity: 1,
    })

    expect(validated.quantityDelta).toBe(-1)
    expect(validated).not.toHaveProperty('baseUnit')
  })
})
