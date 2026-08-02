import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRpc = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

import {
  APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC,
  applyFertilizerInventoryItemToAreas,
  buildMultiAreaApplicationSupabaseRpcParams,
  buildMultiAreaRpcAreasFromNormalized,
  FertilizerMultiAreaApplicationRuntimeError,
  mapMultiAreaApplicationRpcError,
  parseMultiAreaApplicationRpcResult,
  sortMultiAreaRpcAreasCanonically,
} from './fertilizerMultiAreaApplication'
import { normalizeFertilizerMultiAreaApplication } from './fertilizerMultiAreaApplicationCore'

const USER_ID = '44444444-4444-4444-8444-444444444444'
const ITEM_ID = '11111111-1111-4111-8111-111111111111'
const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const AREA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AREA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CARE_GROUP_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function buildDomainInput(
  overrides: Partial<Parameters<typeof normalizeFertilizerMultiAreaApplication>[0]> = {},
) {
  return {
    baseUnit: 'kg' as const,
    mode: 'rate_per_sqm' as const,
    selectionSource: 'manual' as const,
    areas: [{ areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: 100 }],
    rateValue: 25,
    ...overrides,
  }
}

function buildCommandInput(
  overrides: Partial<Parameters<typeof applyFertilizerInventoryItemToAreas>[0]> = {},
) {
  return {
    inventoryItemId: ITEM_ID,
    savedProductProfileId: PROFILE_ID,
    appliedAt: '2026-08-02T10:00:00.000Z',
    idempotencyKey: 'apply-multi-key',
    sourceEventRef: 'ui:apply-multi',
    note: 'Test note',
    userId: USER_ID,
    domain: buildDomainInput(),
    ...overrides,
  }
}

function buildRpcSuccessPayload() {
  return {
    applicationBatchId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    inventoryItemId: ITEM_ID,
    savedProductProfileId: PROFILE_ID,
    applicationMode: 'rate_per_sqm',
    selectionSource: 'manual',
    totalApplicationAmount: 2.5,
    applicationUnit: 'kg',
    appliedAt: '2026-08-02T10:00:00.000Z',
    resultingBalance: 17.5,
    movementId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    idempotentReplay: false,
    areas: [
      {
        areaId: AREA_A,
        activityId: '99999999-9999-4999-8999-999999999999',
        fertilizationDetailId: '88888888-8888-4888-8888-888888888888',
        applicationAmount: 2.5,
        applicationUnit: 'kg',
        ratePerSqm: 25,
        rateUnit: 'g_per_sqm',
        sortOrder: 0,
      },
    ],
  }
}

describe('fertilizerMultiAreaApplication runtime contract', () => {
  beforeEach(() => {
    mockRpc.mockReset()
  })

  it('uses the published multi-area RPC name', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })

    await applyFertilizerInventoryItemToAreas(buildCommandInput())

    expect(mockRpc).toHaveBeenCalledWith(
      APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC,
      expect.any(Object),
    )
    expect(APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC).toBe(
      'apply_fertilizer_inventory_item_to_areas',
    )
  })

  it('passes exact RPC parameters for a single area', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })
    const input = buildCommandInput()

    await applyFertilizerInventoryItemToAreas(input)

    expect(mockRpc).toHaveBeenCalledWith(APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC, {
      p_inventory_item_id: ITEM_ID,
      p_saved_product_profile_id: PROFILE_ID,
      p_application_mode: 'rate_per_sqm',
      p_selection_source: 'manual',
      p_care_group_id: null,
      p_confirmed_input_value: 25,
      p_confirmed_input_unit: 'g_per_sqm',
      p_total_application_amount: 2.5,
      p_application_unit: 'kg',
      p_applied_at: '2026-08-02T10:00:00.000Z',
      p_idempotency_key: 'apply-multi-key',
      p_source_event_ref: 'ui:apply-multi',
      p_note: 'Test note',
      p_areas: [
        expect.objectContaining({
          areaId: AREA_A,
          areaNameSnapshot: 'Vorgarten',
          areaSizeSqmSnapshot: 100,
          applicationAmount: 2.5,
          applicationUnit: 'kg',
          ratePerSqm: 25,
          rateUnit: 'g_per_sqm',
          sortOrder: 0,
        }),
      ],
      p_user_id: USER_ID,
    })
    expect(input.domain.areas).toHaveLength(1)
  })

  it('passes multiple area elements in one request', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...buildRpcSuccessPayload(),
        totalApplicationAmount: 3.75,
        areas: [
          {
            areaId: AREA_A,
            activityId: '99999999-9999-4999-8999-999999999999',
            fertilizationDetailId: '88888888-8888-4888-8888-888888888888',
            applicationAmount: 2.5,
            applicationUnit: 'kg',
            ratePerSqm: 25,
            rateUnit: 'g_per_sqm',
            sortOrder: 0,
          },
          {
            areaId: AREA_B,
            activityId: '77777777-7777-4777-8777-777777777777',
            fertilizationDetailId: '66666666-6666-4666-8666-666666666666',
            applicationAmount: 1.25,
            applicationUnit: 'kg',
            ratePerSqm: 25,
            rateUnit: 'g_per_sqm',
            sortOrder: 1,
          },
        ],
      },
      error: null,
    })

    await applyFertilizerInventoryItemToAreas(
      buildCommandInput({
        domain: buildDomainInput({
          areas: [
            { areaId: AREA_B, areaName: 'Hintergarten', areaSizeSqm: 50 },
            { areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: 100 },
          ],
        }),
      }),
    )

    const params = mockRpc.mock.calls[0]?.[1] as { p_areas: Array<{ areaId: string }> }
    expect(params.p_areas).toHaveLength(2)
    expect(params.p_areas.map((area) => area.areaId)).toEqual([AREA_A, AREA_B])
  })

  it('sorts p_areas in canonical order', () => {
    const normalized = normalizeFertilizerMultiAreaApplication(
      buildDomainInput({
        areas: [
          { areaId: AREA_B, areaName: 'Hintergarten', areaSizeSqm: 50 },
          { areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: 100 },
        ],
      }),
    )

    const sorted = sortMultiAreaRpcAreasCanonically(buildMultiAreaRpcAreasFromNormalized(normalized))
    expect(sorted.map((area) => area.areaId)).toEqual([AREA_A, AREA_B])
  })

  it('maps care group selection source and care group id', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...buildRpcSuccessPayload(),
        selectionSource: 'care_group',
      },
      error: null,
    })

    await applyFertilizerInventoryItemToAreas(
      buildCommandInput({
        domain: buildDomainInput({
          selectionSource: 'care_group',
          careGroupId: CARE_GROUP_ID,
        }),
      }),
    )

    expect(mockRpc).toHaveBeenCalledWith(
      APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC,
      expect.objectContaining({
        p_selection_source: 'care_group',
        p_care_group_id: CARE_GROUP_ID,
      }),
    )
  })

  it('maps manual selection without care group id', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })

    await applyFertilizerInventoryItemToAreas(buildCommandInput())

    expect(mockRpc).toHaveBeenCalledWith(
      APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC,
      expect.objectContaining({
        p_selection_source: 'manual',
        p_care_group_id: null,
      }),
    )
  })

  it('maps rate_per_sqm for kg with g_per_sqm', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })

    await applyFertilizerInventoryItemToAreas(buildCommandInput())

    expect(mockRpc).toHaveBeenCalledWith(
      APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC,
      expect.objectContaining({
        p_application_mode: 'rate_per_sqm',
        p_confirmed_input_unit: 'g_per_sqm',
      }),
    )
  })

  it('maps total_amount_proportional with base unit', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...buildRpcSuccessPayload(),
        applicationMode: 'total_amount_proportional',
        totalApplicationAmount: 3,
      },
      error: null,
    })

    await applyFertilizerInventoryItemToAreas(
      buildCommandInput({
        domain: buildDomainInput({
          mode: 'total_amount_proportional',
          rateValue: null,
          totalAmount: 3,
        }),
      }),
    )

    expect(mockRpc).toHaveBeenCalledWith(
      APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC,
      expect.objectContaining({
        p_application_mode: 'total_amount_proportional',
        p_confirmed_input_unit: 'kg',
        p_total_application_amount: 3,
      }),
    )
  })

  it('maps rate_per_sqm for ml with ml_per_sqm', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...buildRpcSuccessPayload(),
        applicationUnit: 'ml',
        totalApplicationAmount: 500,
        areas: [
          {
            areaId: AREA_A,
            activityId: '99999999-9999-4999-8999-999999999999',
            fertilizationDetailId: '88888888-8888-4888-8888-888888888888',
            applicationAmount: 500,
            applicationUnit: 'ml',
            ratePerSqm: 5,
            rateUnit: 'ml_per_sqm',
            sortOrder: 0,
          },
        ],
      },
      error: null,
    })

    await applyFertilizerInventoryItemToAreas(
      buildCommandInput({
        domain: buildDomainInput({
          baseUnit: 'ml',
          rateValue: 5,
        }),
      }),
    )

    expect(mockRpc).toHaveBeenCalledWith(
      APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC,
      expect.objectContaining({
        p_application_unit: 'ml',
        p_confirmed_input_unit: 'ml_per_sqm',
      }),
    )
  })

  it('validates a complete RPC response', () => {
    const result = parseMultiAreaApplicationRpcResult(buildRpcSuccessPayload())
    expect(result.applicationBatchId).toBe('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')
    expect(result.areas).toHaveLength(1)
    expect(result.areas[0]?.rateUnit).toBe('g_per_sqm')
    expect(result.resultingBalance).toBe(17.5)
  })

  it('rejects an invalid RPC response', () => {
    expect(() => parseMultiAreaApplicationRpcResult({ applicationBatchId: 'only-id' })).toThrow(
      FertilizerMultiAreaApplicationRuntimeError,
    )
  })

  it('maps known insufficient stock server errors', () => {
    const mapped = mapMultiAreaApplicationRpcError({
      message: 'FERTILIZER_MULTI_AREA_APPLICATION_INSUFFICIENT_STOCK',
    })
    expect(mapped.code).toBe('INSUFFICIENT_STOCK')
    expect(mapped.message).toContain('Bestand reicht nicht aus')
  })

  it('maps known idempotency conflict server errors', () => {
    const mapped = mapMultiAreaApplicationRpcError({
      message: 'FERTILIZER_MULTI_AREA_APPLICATION_IDEMPOTENCY_CONFLICT',
    })
    expect(mapped.code).toBe('IDEMPOTENCY_CONFLICT')
  })

  it('maps unknown server errors to a stable fallback', () => {
    const mapped = mapMultiAreaApplicationRpcError(new Error('unexpected postgres failure'))
    expect(mapped.code).toBe('application_failed')
    expect(mapped.message).toContain('konnte nicht gespeichert werden')
  })

  it('does not mutate domain input before RPC', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })
    const domain = buildDomainInput()
    const input = buildCommandInput({ domain })

    await applyFertilizerInventoryItemToAreas(input)

    expect(input.domain).toEqual(domain)
  })

  it('does not call the single-area RPC', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })
    await applyFertilizerInventoryItemToAreas(buildCommandInput())
    expect(mockRpc).not.toHaveBeenCalledWith(
      'apply_fertilizer_inventory_item_to_area',
      expect.anything(),
    )
  })

  it('does not perform direct table writes', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })
    await applyFertilizerInventoryItemToAreas(buildCommandInput())
    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('issues exactly one RPC for multiple areas', async () => {
    mockRpc.mockResolvedValue({
      data: {
        ...buildRpcSuccessPayload(),
        areas: [
          buildRpcSuccessPayload().areas[0],
          {
            ...buildRpcSuccessPayload().areas[0],
            areaId: AREA_B,
            sortOrder: 1,
          },
        ],
      },
      error: null,
    })

    await applyFertilizerInventoryItemToAreas(
      buildCommandInput({
        domain: buildDomainInput({
          areas: [
            { areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: 100 },
            { areaId: AREA_B, areaName: 'Hintergarten', areaSizeSqm: 50 },
          ],
        }),
      }),
    )

    expect(mockRpc).toHaveBeenCalledTimes(1)
  })

  it('buildMultiAreaApplicationSupabaseRpcParams exposes all contract fields', () => {
    const normalized = normalizeFertilizerMultiAreaApplication(buildDomainInput())
    const params = buildMultiAreaApplicationSupabaseRpcParams({
      inventoryItemId: ITEM_ID,
      savedProductProfileId: PROFILE_ID,
      appliedAt: '2026-08-02T10:00:00.000Z',
      idempotencyKey: 'key',
      sourceEventRef: 'ref',
      note: null,
      userId: USER_ID,
      normalized,
    })

    expect(params).toMatchObject({
      p_inventory_item_id: ITEM_ID,
      p_saved_product_profile_id: PROFILE_ID,
      p_application_mode: 'rate_per_sqm',
      p_selection_source: 'manual',
      p_care_group_id: null,
      p_confirmed_input_value: 25,
      p_confirmed_input_unit: 'g_per_sqm',
      p_total_application_amount: 2.5,
      p_application_unit: 'kg',
      p_applied_at: '2026-08-02T10:00:00.000Z',
      p_idempotency_key: 'key',
      p_source_event_ref: 'ref',
      p_note: null,
      p_user_id: USER_ID,
    })
    expect(Array.isArray(params.p_areas)).toBe(true)
  })

  it('maps domain validation errors before calling RPC', async () => {
    await expect(
      applyFertilizerInventoryItemToAreas(
        buildCommandInput({
          domain: buildDomainInput({ areas: [] }),
        }),
      ),
    ).rejects.toMatchObject({
      code: 'NO_AREAS_SELECTED',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })
})
