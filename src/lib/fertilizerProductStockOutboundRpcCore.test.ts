import { describe, expect, it } from 'vitest'
import { validateFertilizerProductStockOutbound } from './fertilizerProductStockOutboundCore'
import {
  buildProductStockOutboundMovementIdempotencyKey,
  buildProductStockOutboundPayloadFingerprint,
  buildRecordFertilizerProductStockOutboundRpcParams,
  mapRecordFertilizerProductStockOutboundRpcResult,
  PRODUCT_STOCK_OUTBOUND_MOVEMENT_IDEMPOTENCY_KEY_PREFIX,
  resolveProductStockOutboundIdempotencyReplay,
} from './fertilizerProductStockOutboundRpcCore'

const ITEM_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('fertilizerProductStockOutboundRpcCore', () => {
  it('builds RPC params without user_id', () => {
    const validated = validateFertilizerProductStockOutbound({
      inventoryItemId: ITEM_ID,
      reason: 'gift_given',
      quantity: 2,
    })

    const params = buildRecordFertilizerProductStockOutboundRpcParams({
      validated,
      idempotencyKey: 'product-stock-outbound:test-1',
    })

    expect(params).toEqual({
      p_inventory_item_id: ITEM_ID.toLowerCase(),
      p_quantity: 2,
      p_reason: 'gift_given',
      p_idempotency_key: 'product-stock-outbound:test-1',
      p_movement_at: null,
      p_note: null,
    })
    expect(params).not.toHaveProperty('p_user_id')
  })

  it('builds stable fingerprints for identical payloads', () => {
    const left = buildProductStockOutboundPayloadFingerprint({
      inventoryItemId: ITEM_ID,
      reason: 'disposed',
      quantity: 1,
      note: 'test',
    })
    const right = buildProductStockOutboundPayloadFingerprint({
      inventoryItemId: ITEM_ID,
      reason: 'disposed',
      quantity: 1,
      note: 'test',
    })

    expect(left).toBe(right)
  })

  it('changes fingerprint when reason or quantity changes', () => {
    const base = buildProductStockOutboundPayloadFingerprint({
      inventoryItemId: ITEM_ID,
      reason: 'gift_given',
      quantity: 1,
    })
    const otherReason = buildProductStockOutboundPayloadFingerprint({
      inventoryItemId: ITEM_ID,
      reason: 'disposed',
      quantity: 1,
    })
    const otherQuantity = buildProductStockOutboundPayloadFingerprint({
      inventoryItemId: ITEM_ID,
      reason: 'gift_given',
      quantity: 2,
    })

    expect(otherReason).not.toBe(base)
    expect(otherQuantity).not.toBe(base)
  })

  it('derives deterministic movement idempotency key from receipt id', () => {
    const receiptId = '44444444-5555-4666-8777-888888888888'
    expect(buildProductStockOutboundMovementIdempotencyKey(receiptId)).toBe(
      `${PRODUCT_STOCK_OUTBOUND_MOVEMENT_IDEMPOTENCY_KEY_PREFIX}${receiptId}`,
    )
  })

  it('maps RPC success payload', () => {
    const mapped = mapRecordFertilizerProductStockOutboundRpcResult({
      operation_id: '11111111-2222-4333-8444-555555555555',
      idempotency_key: 'product-stock-outbound:test-1',
      inventory_item_id: ITEM_ID,
      movement_id: '33333333-4444-4555-8666-777777777777',
      quantity_delta: -2,
      reason: 'gift_given',
      movement_type: 'gifted_away',
      movement_at: '2026-08-02T12:00:00.000Z',
      idempotency_replay: false,
    })

    expect(mapped.quantityDelta).toBe(-2)
    expect(mapped.movementType).toBe('gifted_away')
  })

  it('resolves replay and conflict from stored fingerprint', () => {
    const stored = buildProductStockOutboundPayloadFingerprint({
      inventoryItemId: ITEM_ID,
      reason: 'gift_given',
      quantity: 1,
    })
    const same = buildProductStockOutboundPayloadFingerprint({
      inventoryItemId: ITEM_ID,
      reason: 'gift_given',
      quantity: 1,
    })
    const different = buildProductStockOutboundPayloadFingerprint({
      inventoryItemId: ITEM_ID,
      reason: 'gift_given',
      quantity: 2,
    })

    expect(
      resolveProductStockOutboundIdempotencyReplay({
        storedFingerprint: stored,
        nextFingerprint: same,
        storedResult: null,
      }),
    ).toBe('new')

    expect(
      resolveProductStockOutboundIdempotencyReplay({
        storedFingerprint: stored,
        nextFingerprint: same,
        storedResult: mapRecordFertilizerProductStockOutboundRpcResult({
          operation_id: '11111111-2222-4333-8444-555555555555',
          idempotency_key: 'product-stock-outbound:test-1',
          inventory_item_id: ITEM_ID,
          movement_id: '33333333-4444-4555-8666-777777777777',
          quantity_delta: -1,
          reason: 'gift_given',
          movement_type: 'gifted_away',
          movement_at: '2026-08-02T12:00:00.000Z',
          idempotency_replay: true,
        }),
      }),
    ).toBe('replay')

    expect(
      resolveProductStockOutboundIdempotencyReplay({
        storedFingerprint: stored,
        nextFingerprint: different,
        storedResult: null,
      }),
    ).toBe('conflict')
  })
})
