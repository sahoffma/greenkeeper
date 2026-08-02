import { describe, expect, it } from 'vitest'
import { validateFertilizerProductStockIntake } from './fertilizerProductStockCore'
import {
  buildProductStockIntakeMovementIdempotencyKey,
  buildRecordFertilizerProductStockIntakeRpcParams,
  mapRecordFertilizerProductStockIntakeRpcResult,
  PRODUCT_STOCK_INTAKE_MOVEMENT_IDEMPOTENCY_KEY_PREFIX,
} from './fertilizerProductStockIntakeRpcCore'

const PROFILE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const USER_ID = 'user-abc-123'

describe('fertilizerProductStockIntakeRpcCore', () => {
  it('builds RPC params from validated domain intake without user_id', () => {
    const validated = validateFertilizerProductStockIntake({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID,
      baseUnit: 'kg',
      quantity: 12.5,
      reason: 'purchase',
    })

    const params = buildRecordFertilizerProductStockIntakeRpcParams({
      validated,
      idempotencyKey: 'product-stock-intake:test-1',
      sourceEventRef: 'event-1',
    })

    expect(params).toEqual({
      p_saved_product_profile_id: PROFILE_ID.toLowerCase(),
      p_base_unit: 'kg',
      p_quantity: 12.5,
      p_reason: 'purchase',
      p_idempotency_key: 'product-stock-intake:test-1',
      p_movement_at: null,
      p_source_event_ref: 'event-1',
      p_note: null,
    })
    expect(params).not.toHaveProperty('p_user_id')
  })

  it('maps RPC success payload to typed result', () => {
    const mapped = mapRecordFertilizerProductStockIntakeRpcResult({
      operation_id: '11111111-2222-4333-8444-555555555555',
      idempotency_key: 'product-stock-intake:test-1',
      inventory_item_id: '22222222-3333-4444-8555-666666666666',
      movement_id: '33333333-4444-4555-8666-777777777777',
      saved_product_profile_id: PROFILE_ID,
      base_unit: 'kg',
      quantity_delta: 12.5,
      reason: 'purchase',
      movement_at: '2026-08-02T12:00:00.000Z',
      item_created: true,
      idempotency_replay: false,
    })

    expect(mapped.itemCreated).toBe(true)
    expect(mapped.idempotencyReplay).toBe(false)
    expect(mapped.quantityDelta).toBe(12.5)
    expect(mapped).not.toHaveProperty('currentQuantity')
    expect(mapped).not.toHaveProperty('packageSize')
  })

  it('derives movement idempotency key from receipt id', () => {
    const receiptId = '44444444-5555-4666-8777-888888888888'
    expect(buildProductStockIntakeMovementIdempotencyKey(receiptId)).toBe(
      `${PRODUCT_STOCK_INTAKE_MOVEMENT_IDEMPOTENCY_KEY_PREFIX}${receiptId}`,
    )
  })
})
