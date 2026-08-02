import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRpc = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

import {
  APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREA_RPC,
  applyFertilizerInventoryItemToArea,
  buildApplicationSupabaseRpcParams,
  FertilizerApplicationRuntimeError,
  mapApplicationRpcError,
  parseApplicationRpcResult,
} from './fertilizerApplication'
import { normalizeFertilizerApplicationCommand } from './fertilizerApplicationCore'

const USER_ID = '44444444-4444-4444-8444-444444444444'
const ITEM_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const AREA_ID = '33333333-3333-4333-8333-333333333333'

const BASE_INPUT = {
  inventoryItemId: ITEM_ID,
  savedProductProfileId: PROFILE_ID,
  targetKind: 'area' as const,
  targetId: AREA_ID,
  applicationAmount: 2.5,
  applicationUnit: 'kg',
  appliedAt: '2026-08-02T10:00:00.000Z',
  idempotencyKey: 'apply-test-key',
  sourceEventRef: 'ui:apply-test',
  note: 'Test note',
  userId: USER_ID,
}

function buildRpcSuccessPayload() {
  return {
    activityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    movementId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    inventoryItemId: ITEM_ID,
    savedProductProfileId: PROFILE_ID,
    targetKind: 'area',
    targetId: AREA_ID,
    applicationAmount: 2.5,
    applicationUnit: 'kg',
    appliedAt: '2026-08-02T10:00:00.000Z',
    resultingBalance: 17.5,
    idempotentReplay: false,
  }
}

describe('fertilizerApplication runtime contract', () => {
  beforeEach(() => {
    mockRpc.mockReset()
  })

  it('uses the published application RPC name', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })

    await applyFertilizerInventoryItemToArea(BASE_INPUT)

    expect(mockRpc).toHaveBeenCalledWith(
      APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREA_RPC,
      expect.any(Object),
    )
    expect(APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREA_RPC).toBe(
      'apply_fertilizer_inventory_item_to_area',
    )
  })

  it('passes exact RPC parameters without mutating input', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })
    const input = { ...BASE_INPUT }

    await applyFertilizerInventoryItemToArea(input)

    expect(mockRpc).toHaveBeenCalledWith(APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREA_RPC, {
      p_inventory_item_id: ITEM_ID,
      p_saved_product_profile_id: PROFILE_ID,
      p_area_id: AREA_ID,
      p_application_amount: 2.5,
      p_application_unit: 'kg',
      p_applied_at: '2026-08-02T10:00:00.000Z',
      p_idempotency_key: 'apply-test-key',
      p_source_event_ref: 'ui:apply-test',
      p_note: 'Test note',
      p_user_id: USER_ID,
    })
    expect(input).toEqual(BASE_INPUT)
  })

  it('buildApplicationSupabaseRpcParams maps normalized command fields', () => {
    const normalized = normalizeFertilizerApplicationCommand(BASE_INPUT)
    expect(buildApplicationSupabaseRpcParams(normalized)).toEqual({
      p_inventory_item_id: ITEM_ID,
      p_saved_product_profile_id: PROFILE_ID,
      p_area_id: AREA_ID,
      p_application_amount: 2.5,
      p_application_unit: 'kg',
      p_applied_at: '2026-08-02T10:00:00.000Z',
      p_idempotency_key: 'apply-test-key',
      p_source_event_ref: 'ui:apply-test',
      p_note: 'Test note',
      p_user_id: USER_ID,
    })
  })

  it('validates a complete RPC response', () => {
    const result = parseApplicationRpcResult(buildRpcSuccessPayload())
    expect(result.activityId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(result.movementId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    expect(result.resultingBalance).toBe(17.5)
    expect(result.idempotentReplay).toBe(false)
  })

  it('rejects an invalid RPC response', () => {
    expect(() => parseApplicationRpcResult({ activityId: 'only-id' })).toThrow(
      FertilizerApplicationRuntimeError,
    )
  })

  it('maps known insufficient stock server errors', () => {
    const mapped = mapApplicationRpcError({
      message: 'FERTILIZER_APPLICATION_INSUFFICIENT_STOCK',
    })
    expect(mapped.code).toBe('INSUFFICIENT_STOCK')
    expect(mapped.message).toContain('Bestand reicht nicht aus')
  })

  it('maps known idempotency conflict server errors', () => {
    const mapped = mapApplicationRpcError({
      message: 'FERTILIZER_APPLICATION_IDEMPOTENCY_CONFLICT',
    })
    expect(mapped.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('maps unknown server errors to a stable fallback', () => {
    const mapped = mapApplicationRpcError(new Error('unexpected postgres failure'))
    expect(mapped.code).toBe('application_failed')
    expect(mapped.message).toContain('konnte nicht gespeichert werden')
  })

  it('maps domain validation errors before calling RPC', async () => {
    await expect(
      applyFertilizerInventoryItemToArea({
        ...BASE_INPUT,
        applicationAmount: 0,
      }),
    ).rejects.toMatchObject({
      code: 'APPLICATION_AMOUNT_INVALID',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('does not call legacy capture RPC', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })
    await applyFertilizerInventoryItemToArea(BASE_INPUT)
    expect(mockRpc).not.toHaveBeenCalledWith('save_fertilizer_capture', expect.anything())
  })

  it('does not scale units before RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...buildRpcSuccessPayload(),
        applicationAmount: 750,
        applicationUnit: 'ml',
        resultingBalance: 250,
      },
      error: null,
    })

    await applyFertilizerInventoryItemToArea({
      ...BASE_INPUT,
      applicationAmount: 750,
      applicationUnit: 'ml',
    })

    expect(mockRpc).toHaveBeenCalledWith(
      APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREA_RPC,
      expect.objectContaining({
        p_application_amount: 750,
        p_application_unit: 'ml',
      }),
    )
  })
})
