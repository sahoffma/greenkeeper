import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRpc = vi.fn()

vi.mock('./supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}))

import {
  CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC,
  buildInventoryCreationRpcParamsFromCaptureInput,
  createFertilizerInventoryFromCapture,
  FertilizerInventoryCreationRuntimeError,
} from './fertilizerInventoryCreation'
import { PHASE7A_SAVED_PRODUCT_PROFILE_ID, PHASE7A_USER_ID } from './fertilizerInventoryTestFixtures'

const OPERATION_ID = '44444444-4444-4444-8444-444444447b01'
const ITEM_A_ID = '55555555-5555-4555-8555-555555557b01'
const MOVEMENT_A_ID = '77777777-7777-4777-8777-777777777b01'

function buildRpcSuccessPayload() {
  return {
    operation_id: OPERATION_ID,
    idempotency_key: 'capture-idem:inventory',
    packages: [
      {
        sequence_index: 0,
        client_correlation_id: 'capture-package-0',
        item: {
          id: ITEM_A_ID,
          saved_product_profile_id: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
          access_kind: 'authenticated_user',
          user_id: PHASE7A_USER_ID,
          session_access_hash: null,
          base_unit: 'kg',
          package_size_value: 25,
          package_size_unit: 'kg',
          label: null,
          archived_at: null,
          created_at: '2026-07-31T12:00:00.000Z',
        },
        initial_movement: {
          id: MOVEMENT_A_ID,
          container_id: ITEM_A_ID,
          access_kind: 'authenticated_user',
          user_id: PHASE7A_USER_ID,
          session_access_hash: null,
          quantity_delta: 25,
          unit: 'kg',
          movement_type: 'purchase',
          movement_origin: 'manual',
          movement_at: '2026-07-31T12:00:00.000Z',
          source_event_ref: 'capture:capture-idem',
          idempotency_key: 'movement-key',
          note: null,
          created_at: '2026-07-31T12:00:00.000Z',
        },
      },
    ],
  }
}

describe('fertilizerInventoryCreation runtime contract', () => {
  beforeEach(() => {
    mockRpc.mockReset()
  })

  it('uses the published inventory-core creation RPC name', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })

    await createFertilizerInventoryFromCapture({
      savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
      userId: PHASE7A_USER_ID,
      creationReason: 'purchase',
      idempotencyKey: 'capture-idem:inventory',
      sourceEventRef: 'capture:capture-idem',
      confirmedPackageGroups: [
        {
          packageSizeValue: 25,
          packageSizeUnit: 'kg',
          initialQuantityValue: 25,
          initialQuantityUnit: 'kg',
          count: 1,
          clientCorrelationIdPrefix: 'capture-package',
        },
      ],
    })

    expect(mockRpc).toHaveBeenCalledWith(
      CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC,
      expect.any(Object),
    )
    expect(CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC).toBe(
      'create_fertilizer_inventory_core_from_confirmed_packages',
    )
  })

  it('passes saved product profile id, creation reason and authenticated user scope', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })

    await createFertilizerInventoryFromCapture({
      savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
      userId: PHASE7A_USER_ID,
      creationReason: 'gift_received',
      idempotencyKey: 'capture-idem:inventory',
      confirmedPackageGroups: [
        {
          packageSizeValue: 10,
          packageSizeUnit: 'ml',
          initialQuantityValue: 10,
          initialQuantityUnit: 'ml',
          count: 1,
        },
      ],
    })

    const params = mockRpc.mock.calls[0]?.[1]
    expect(params.p_saved_product_profile_id).toBe(PHASE7A_SAVED_PRODUCT_PROFILE_ID)
    expect(params.p_creation_reason).toBe('gift_received')
    expect(params.p_access_kind).toBe('authenticated_user')
    expect(params.p_user_id).toBe(PHASE7A_USER_ID)
    expect(params.p_idempotency_key).toBe('capture-idem:inventory')
  })

  it('expands multiple confirmed packages into separate RPC package inputs', () => {
    const rpcInput = buildInventoryCreationRpcParamsFromCaptureInput({
      savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
      userId: PHASE7A_USER_ID,
      creationReason: 'initial_stock',
      idempotencyKey: 'idem',
      confirmedPackageGroups: [
        {
          packageSizeValue: 5,
          packageSizeUnit: 'kg',
          initialQuantityValue: 5,
          initialQuantityUnit: 'kg',
          count: 2,
          clientCorrelationIdPrefix: 'capture-package',
        },
      ],
    })

    expect(rpcInput.packages).toHaveLength(2)
    expect(rpcInput.packages[0]?.sequenceIndex).toBe(0)
    expect(rpcInput.packages[1]?.sequenceIndex).toBe(1)
  })

  it('accepts kg and ml without converting g or l', () => {
    expect(() =>
      buildInventoryCreationRpcParamsFromCaptureInput({
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        userId: PHASE7A_USER_ID,
        creationReason: 'initial_stock',
        idempotencyKey: 'idem',
        confirmedPackageGroups: [
          {
            packageSizeValue: 1,
            packageSizeUnit: 'kg',
            initialQuantityValue: 1,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    ).not.toThrow()

    expect(() =>
      buildInventoryCreationRpcParamsFromCaptureInput({
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        userId: PHASE7A_USER_ID,
        creationReason: 'initial_stock',
        idempotencyKey: 'idem',
        confirmedPackageGroups: [
          {
            packageSizeValue: 1,
            packageSizeUnit: 'ml',
            initialQuantityValue: 1,
            initialQuantityUnit: 'ml',
            count: 1,
          },
        ],
      }),
    ).not.toThrow()

    expect(() =>
      buildInventoryCreationRpcParamsFromCaptureInput({
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        userId: PHASE7A_USER_ID,
        creationReason: 'initial_stock',
        idempotencyKey: 'idem',
        confirmedPackageGroups: [
          {
            packageSizeValue: 500,
            packageSizeUnit: 'g' as 'kg',
            initialQuantityValue: 500,
            initialQuantityUnit: 'g' as 'kg',
            count: 1,
          },
        ],
      }),
    ).toThrow(/kg|ml/)
  })

  it('rejects more than four decimal places', () => {
    expect(() =>
      buildInventoryCreationRpcParamsFromCaptureInput({
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        userId: PHASE7A_USER_ID,
        creationReason: 'initial_stock',
        idempotencyKey: 'idem',
        confirmedPackageGroups: [
          {
            packageSizeValue: 1.12345,
            packageSizeUnit: 'kg',
            initialQuantityValue: 1.12345,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    ).toThrow()
  })

  it('builds stable RPC params for identical capture input', () => {
    const input = {
      savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
      userId: PHASE7A_USER_ID,
      creationReason: 'purchase' as const,
      idempotencyKey: 'stable-idem',
      confirmedPackageGroups: [
        {
          packageSizeValue: 7,
          packageSizeUnit: 'kg' as const,
          initialQuantityValue: 7,
          initialQuantityUnit: 'kg' as const,
          count: 1,
        },
      ],
    }

    const first = buildInventoryCreationRpcParamsFromCaptureInput(input)
    const second = buildInventoryCreationRpcParamsFromCaptureInput(input)

    expect(first).toEqual(second)
  })

  it('validates RPC success payload and maps known server errors', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })

    const result = await createFertilizerInventoryFromCapture({
      savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
      userId: PHASE7A_USER_ID,
      creationReason: 'purchase',
      idempotencyKey: 'capture-idem:inventory',
      confirmedPackageGroups: [
        {
          packageSizeValue: 25,
          packageSizeUnit: 'kg',
          initialQuantityValue: 25,
          initialQuantityUnit: 'kg',
          count: 1,
        },
      ],
    })

    expect(result.operationId).toBe(OPERATION_ID)
    expect(result.packageCount).toBe(1)
    expect(result.totalInitialQuantity).toBe(25)
    expect(result.baseUnit).toBe('kg')
  })

  it('rejects invalid RPC success payload', async () => {
    mockRpc.mockResolvedValue({ data: { operation_id: 'x' }, error: null })

    await expect(
      createFertilizerInventoryFromCapture({
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        userId: PHASE7A_USER_ID,
        creationReason: 'purchase',
        idempotencyKey: 'capture-idem:inventory',
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(FertilizerInventoryCreationRuntimeError)
  })

  it('maps known RPC errors and falls back for unknown errors', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'INVENTORY_CREATION_PRODUCT_PROFILE_NOT_READY' },
    })

    await expect(
      createFertilizerInventoryFromCapture({
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        userId: PHASE7A_USER_ID,
        creationReason: 'purchase',
        idempotencyKey: 'capture-idem:inventory',
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'product_profile_not_ready',
      message: 'Das Produktprofil ist noch nicht bereit.',
    })

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'unexpected_failure_xyz' },
    })

    await expect(
      createFertilizerInventoryFromCapture({
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        userId: PHASE7A_USER_ID,
        creationReason: 'purchase',
        idempotencyKey: 'capture-idem:inventory',
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    ).rejects.toMatchObject({
      message: 'Der Bestand konnte gerade nicht gespeichert werden.',
    })
  })

  it('does not call legacy save RPC', async () => {
    mockRpc.mockResolvedValue({ data: buildRpcSuccessPayload(), error: null })

    await createFertilizerInventoryFromCapture({
      savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
      userId: PHASE7A_USER_ID,
      creationReason: 'purchase',
      idempotencyKey: 'capture-idem:inventory',
      confirmedPackageGroups: [
        {
          packageSizeValue: 25,
          packageSizeUnit: 'kg',
          initialQuantityValue: 25,
          initialQuantityUnit: 'kg',
          count: 1,
        },
      ],
    })

    expect(mockRpc.mock.calls.some(([rpcName]) => rpcName === 'save_fertilizer_capture')).toBe(false)
  })
})
