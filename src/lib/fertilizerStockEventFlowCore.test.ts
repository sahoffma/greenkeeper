import { describe, expect, it } from 'vitest'
import {
  advanceStockEventFlowToConfirm,
  beginStockEventFlowSaving,
  buildStockEventFlowIdempotencyKey,
  canConfirmStockEventFlow,
  completeStockEventFlowSuccess,
  createInitialStockEventFlowDraft,
  failStockEventFlow,
  resetStockEventFlowInputWithNewKey,
  retryStockEventFlowWithSameKey,
  setStockEventOutboundReason,
  shouldStockEventFlowAllowSignedQuantity,
} from './fertilizerStockEventFlowCore'

describe('fertilizerStockEventFlowCore', () => {
  it('starts intake and outbound flows in details phase', () => {
    expect(createInitialStockEventFlowDraft('intake', 'item-1').phase).toBe('details')
    expect(createInitialStockEventFlowDraft('outbound', 'item-1').phase).toBe('details')
  })

  it('moves through confirm, saving and success', () => {
    let draft = createInitialStockEventFlowDraft('intake', 'item-1')
    draft = { ...draft, quantityInput: '2', intakeReason: 'purchase' }
    draft = advanceStockEventFlowToConfirm(draft)
    expect(draft.phase).toBe('confirm')

    draft = beginStockEventFlowSaving(draft, 'product-stock-intake:abc')
    expect(draft.phase).toBe('saving')

    draft = completeStockEventFlowSuccess(draft)
    expect(draft.phase).toBe('success')
  })

  it('retries with the same idempotency key and resets with a new key after input changes', () => {
    let draft = beginStockEventFlowSaving(
      createInitialStockEventFlowDraft('outbound', 'item-1'),
      'product-stock-outbound:abc',
    )
    draft = failStockEventFlow(draft, 'failed')
    expect(draft.phase).toBe('error')

    draft = retryStockEventFlowWithSameKey(draft)
    expect(draft.phase).toBe('saving')
    expect(draft.idempotencyKey).toBe('product-stock-outbound:abc')

    draft = resetStockEventFlowInputWithNewKey(draft, 'product-stock-outbound:def')
    expect(draft.phase).toBe('details')
    expect(draft.idempotencyKey).toBe('product-stock-outbound:def')
  })

  it('requires signed quantity only for inventory_correction', () => {
    let draft = createInitialStockEventFlowDraft('outbound', 'item-1')
    draft = setStockEventOutboundReason(draft, 'inventory_correction')
    expect(shouldStockEventFlowAllowSignedQuantity(draft)).toBe(true)

    draft = { ...draft, quantityInput: '-1' }
    expect(canConfirmStockEventFlow(draft)).toBe(true)

    draft = setStockEventOutboundReason(
      createInitialStockEventFlowDraft('outbound', 'item-1'),
      'gift_given',
    )
    draft = { ...draft, quantityInput: '-1' }
    expect(canConfirmStockEventFlow(draft)).toBe(false)
  })

  it('builds scoped idempotency keys', () => {
    expect(buildStockEventFlowIdempotencyKey('product-stock-intake', 'token')).toBe(
      'product-stock-intake:token',
    )
  })
})
