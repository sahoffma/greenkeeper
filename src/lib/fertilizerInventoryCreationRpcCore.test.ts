import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildCreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams,
  buildInventoryCreationMovementIdempotencyKey,
  CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC,
  mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcError,
  mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult,
} from './fertilizerInventoryCreationRpcCore'
import {
  FertilizerInventoryRepositoryError,
  createInMemoryFertilizerInventoryRepository,
} from './fertilizerInventoryRepositoryCore'
import { createPersistentFertilizerInventoryRepository } from './fertilizerInventoryRepositoryPersistentCore'
import { APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC } from './fertilizerInventoryAppendMovementRpcCore'
import { createInMemoryFertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryCore'
import {
  PHASE7A_FIXED_NOW,
  PHASE7A_SAVED_PRODUCT_PROFILE_ID,
  PHASE7A_SESSION_HASH,
  PHASE7A_SESSION_ID,
  PHASE7A_USER_ID,
  phase7AAuthenticatedAccessContext,
  phase7ASessionAccessContext,
} from './fertilizerInventoryTestFixtures'

const OPERATION_ID = '44444444-4444-4444-8444-444444447b01'
const ITEM_A_ID = '55555555-5555-4555-8555-555555557b01'
const ITEM_B_ID = '66666666-6666-4666-8666-666666667b01'
const MOVEMENT_A_ID = '77777777-7777-4777-8777-777777777b01'
const MOVEMENT_B_ID = '88888888-8888-4888-8888-888888887b01'

function deriveTestSessionAccessHash(sessionId: string): string {
  if (sessionId === PHASE7A_SESSION_ID) {
    return PHASE7A_SESSION_HASH
  }

  return 'fedcba9876543210'.repeat(4)
}

const RECEIPT_B_ID = '99999999-9999-4999-8999-999999997b01'

function movementKey(receiptId: string, sequenceIndex: number): string {
  return buildInventoryCreationMovementIdempotencyKey(receiptId, sequenceIndex)
}

function buildCreationInput() {
  return {
    savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
    creationReason: 'initial_stock' as const,
    idempotencyKey: 'creation-idem-7b',
    sourceEventRef: 'onboarding:step-3',
    packages: [
      {
        packageSizeValue: 25,
        packageSizeUnit: 'kg' as const,
        initialQuantityValue: 25,
        initialQuantityUnit: 'kg' as const,
        sequenceIndex: 0,
        clientCorrelationId: 'sack-a',
      },
      {
        packageSizeValue: 25,
        packageSizeUnit: 'kg' as const,
        initialQuantityValue: 20,
        initialQuantityUnit: 'kg' as const,
        sequenceIndex: 1,
      },
    ],
  }
}

function buildRpcSuccessPayload() {
  return {
    operation_id: OPERATION_ID,
    idempotency_key: 'creation-idem-7b',
    packages: [
      {
        sequence_index: 0,
        client_correlation_id: 'sack-a',
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
          created_at: PHASE7A_FIXED_NOW,
        },
        initial_movement: {
          id: MOVEMENT_A_ID,
          container_id: ITEM_A_ID,
          access_kind: 'authenticated_user',
          user_id: PHASE7A_USER_ID,
          session_access_hash: null,
          quantity_delta: 25,
          unit: 'kg',
          movement_type: 'initial_stock',
          movement_origin: 'manual',
          movement_at: PHASE7A_FIXED_NOW,
          inventory_idempotency_key: movementKey(OPERATION_ID, 0),
          source_event_ref: 'onboarding:step-3',
          note: null,
          created_at: PHASE7A_FIXED_NOW,
        },
      },
      {
        sequence_index: 1,
        client_correlation_id: null,
        item: {
          id: ITEM_B_ID,
          saved_product_profile_id: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
          access_kind: 'authenticated_user',
          user_id: PHASE7A_USER_ID,
          session_access_hash: null,
          base_unit: 'kg',
          package_size_value: 25,
          package_size_unit: 'kg',
          label: null,
          archived_at: null,
          created_at: PHASE7A_FIXED_NOW,
        },
        initial_movement: {
          id: MOVEMENT_B_ID,
          container_id: ITEM_B_ID,
          access_kind: 'authenticated_user',
          user_id: PHASE7A_USER_ID,
          session_access_hash: null,
          quantity_delta: 20,
          unit: 'kg',
          movement_type: 'initial_stock',
          movement_origin: 'manual',
          movement_at: PHASE7A_FIXED_NOW,
          inventory_idempotency_key: movementKey(OPERATION_ID, 1),
          source_event_ref: 'onboarding:step-3',
          note: null,
          created_at: PHASE7A_FIXED_NOW,
        },
      },
    ],
  }
}

describe('fertilizerInventoryCreationRpcCore', () => {
  it('builds RPC params without a client fingerprint', () => {
    const params = buildCreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams(
      buildCreationInput(),
      phase7AAuthenticatedAccessContext(),
      deriveTestSessionAccessHash,
    )

    expect(params).not.toHaveProperty('p_payload_fingerprint')
    expect(params.p_saved_product_profile_id).toBe(PHASE7A_SAVED_PRODUCT_PROFILE_ID)
    expect(params.p_idempotency_key).toBe('creation-idem-7b')
  })

  it('serializes packages in stable sequenceIndex order', () => {
    const input = buildCreationInput()
    input.packages = [...input.packages].reverse()

    const params = buildCreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams(
      input,
      phase7AAuthenticatedAccessContext(),
      deriveTestSessionAccessHash,
    )

    expect(params.p_packages.map((pkg) => pkg.sequence_index)).toEqual([0, 1])
  })

  it('preserves sequenceIndex and maps clientCorrelationId to null or string', () => {
    const params = buildCreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams(
      buildCreationInput(),
      phase7AAuthenticatedAccessContext(),
      deriveTestSessionAccessHash,
    )

    expect(params.p_packages[0]?.client_correlation_id).toBe('sack-a')
    expect(params.p_packages[1]?.client_correlation_id).toBeNull()
  })

  it('maps session access hash for session-scoped creation', () => {
    const params = buildCreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams(
      buildCreationInput(),
      phase7ASessionAccessContext(),
      deriveTestSessionAccessHash,
    )

    expect(params.p_access_kind).toBe('session')
    expect(params.p_session_access_hash).toBe(PHASE7A_SESSION_HASH)
    expect(params.p_user_id).toBeNull()
  })

  it('maps a valid RPC result into domain records sorted by sequenceIndex', () => {
    const mapped = mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult(
      buildRpcSuccessPayload(),
    )

    expect(mapped.operationId).toBe(OPERATION_ID)
    expect(mapped.idempotencyKey).toBe('creation-idem-7b')
    expect(mapped.packages.map((entry) => entry.sequenceIndex)).toEqual([0, 1])
    expect(mapped.packages[0]?.clientCorrelationId).toBe('sack-a')
    expect(mapped.packages[1]?.clientCorrelationId).toBeUndefined()
    expect(mapped.packages[0]?.item.id).toBe(ITEM_A_ID)
    expect(mapped.packages[0]?.initialMovement.quantityDelta).toBe(25)
    expect(mapped.packages[1]?.initialMovement.quantityDelta).toBe(20)
    expect(mapped.packages[0]?.initialMovement.idempotencyKey).toBe(
      movementKey(OPERATION_ID, 0),
    )
    expect(mapped.packages[1]?.initialMovement.idempotencyKey).toBe(
      movementKey(OPERATION_ID, 1),
    )
  })

  it('builds receipt-based movement idempotency keys without request key prefixes', () => {
    const keyA = buildInventoryCreationMovementIdempotencyKey(OPERATION_ID, 0)
    const keyB = buildInventoryCreationMovementIdempotencyKey(OPERATION_ID, 1)
    const keyOtherReceipt = buildInventoryCreationMovementIdempotencyKey(RECEIPT_B_ID, 0)

    expect(keyA).toBe(`inventory-create:${OPERATION_ID}:0`)
    expect(keyB).toBe(`inventory-create:${OPERATION_ID}:1`)
    expect(keyA).not.toBe(keyB)
    expect(keyOtherReceipt).not.toBe(keyA)
    expect(keyA.startsWith('inventory-create:')).toBe(true)
    expect(keyA.includes(OPERATION_ID)).toBe(true)
    expect(keyA.endsWith(':0')).toBe(true)
  })

  it('keeps movement keys distinct when request idempotency keys share a long prefix', () => {
    const sharedPrefix = 'x'.repeat(240)
    const keyForRequestA = buildInventoryCreationMovementIdempotencyKey(OPERATION_ID, 0)
    const keyForRequestB = buildInventoryCreationMovementIdempotencyKey(RECEIPT_B_ID, 0)

    expect(`${sharedPrefix}-suffix-a`).toMatch(new RegExp(`^${sharedPrefix}`))
    expect(`${sharedPrefix}-suffix-b`).toMatch(new RegExp(`^${sharedPrefix}`))
    expect(keyForRequestA).not.toBe(keyForRequestB)
    expect(keyForRequestA).not.toContain(sharedPrefix)
    expect(keyForRequestB).not.toContain(sharedPrefix)
  })

  it('rejects invalid RPC result structures with invalid_stored_record', () => {
    expect(() =>
      mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult(null),
    ).toThrow(FertilizerInventoryRepositoryError)

    expect(() =>
      mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult({
        operation_id: OPERATION_ID,
        idempotency_key: 'creation-idem-7b',
        packages: [{ sequence_index: 0 }],
      }),
    ).toThrow(FertilizerInventoryRepositoryError)
  })

  it.each([
    ['INVENTORY_CREATION_PRODUCT_PROFILE_NOT_FOUND', 'product_profile_not_found'],
    ['INVENTORY_CREATION_PRODUCT_PROFILE_NOT_READY', 'product_profile_not_ready'],
    ['INVENTORY_CREATION_ACCESS_DENIED', 'access_denied'],
    ['INVENTORY_CREATION_PACKAGE_LIST_EMPTY', 'package_list_empty'],
    ['INVENTORY_CREATION_PACKAGE_COUNT_EXCEEDED', 'package_count_exceeded'],
    ['INVENTORY_CREATION_PACKAGE_INVALID', 'package_invalid'],
    ['INVENTORY_CREATION_PACKAGE_SIZE_INVALID', 'package_size_invalid'],
    ['INVENTORY_CREATION_INITIAL_QUANTITY_INVALID', 'initial_quantity_invalid'],
    [
      'INVENTORY_CREATION_INITIAL_QUANTITY_EXCEEDS_PACKAGE_SIZE',
      'initial_quantity_exceeds_package_size',
    ],
    ['INVENTORY_CREATION_UNIT_MISMATCH', 'unit_mismatch'],
    ['INVENTORY_CREATION_REASON_INVALID', 'creation_reason_invalid'],
    ['INVENTORY_CREATION_IDEMPOTENCY_INVALID', 'creation_idempotency_invalid'],
    ['INVENTORY_CREATION_IDEMPOTENCY_CONFLICT', 'creation_idempotency_conflict'],
    ['INVENTORY_CREATION_FAILED', 'creation_failed'],
  ] as const)('maps %s to %s', (rpcCode, repositoryCode) => {
    const mapped = mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcError({
      message: rpcCode,
    })

    expect(mapped.code).toBe(repositoryCode)
  })

  it('maps unknown RPC failures to persistence_unavailable', () => {
    const mapped = mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcError({
      message: 'unexpected database failure',
    })

    expect(mapped.code).toBe('persistence_unavailable')
  })
})

describe('persistent repository creation binding', () => {
  it('uses only the creation RPC and not append movement or direct inserts', async () => {
    const rpc = vi.fn(async (name: string, _params?: Record<string, unknown>) => {
      expect(name).toBe(CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC)
      return { data: buildRpcSuccessPayload(), error: null }
    })

    const from = vi.fn(() => {
      throw new Error('direct table access must not be used for creation')
    })

    const supabase = {
      rpc,
      from,
    } as unknown as SupabaseClient

    const repository = createPersistentFertilizerInventoryRepository({
      supabase,
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      productProfileRepository: createInMemoryFertilizerProductProfileRepository(),
    })

    const result = await repository.createInventoryItemsWithInitialMovements(
      buildCreationInput(),
      phase7AAuthenticatedAccessContext(),
    )

    expect(rpc).toHaveBeenCalledTimes(1)
    expect(from).not.toHaveBeenCalled()
    expect(result.packages).toHaveLength(2)
    expect(result.packages[0]?.item.id).toBe(ITEM_A_ID)
    expect(result.packages[1]?.item.id).toBe(ITEM_B_ID)

    const rpcCall = rpc.mock.calls[0]
    expect(rpcCall?.[0]).toBe(CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC)
    const rpcParams = rpcCall?.[1] as Record<string, unknown> | undefined
    expect(rpcParams).toBeDefined()
    expect(rpcParams).not.toHaveProperty('p_payload_fingerprint')
    expect(APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC).toBe(
      'append_fertilizer_inventory_core_movement',
    )
  })
})

describe('in-memory repository creation movement keys', () => {
  it('derives movement keys from the receipt operation id and sequence index', async () => {
    let idCounter = 0
    const repository = createInMemoryFertilizerInventoryRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      now: () => PHASE7A_FIXED_NOW,
      createId: () => {
        idCounter += 1
        return idCounter === 1
          ? OPERATION_ID
          : `inventory-item-${idCounter}-${Date.now()}`
      },
    })

    const input = buildCreationInput()
    const first = await repository.createInventoryItemsWithInitialMovements(
      input,
      phase7AAuthenticatedAccessContext(),
    )
    const replay = await repository.createInventoryItemsWithInitialMovements(
      input,
      phase7AAuthenticatedAccessContext(),
    )

    expect(first.operationId).toBe(OPERATION_ID)
    expect(first.packages[0]?.initialMovement.idempotencyKey).toBe(
      movementKey(OPERATION_ID, 0),
    )
    expect(first.packages[1]?.initialMovement.idempotencyKey).toBe(
      movementKey(OPERATION_ID, 1),
    )
    expect(replay.packages[0]?.initialMovement.idempotencyKey).toBe(
      movementKey(OPERATION_ID, 0),
    )
    expect(repository.state.itemsById.size).toBe(2)
    expect(repository.state.movementsByItemId.size).toBe(2)
  })

  it('assigns different movement keys for separate creation receipts', async () => {
    let idCounter = 0
    const repository = createInMemoryFertilizerInventoryRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      now: () => PHASE7A_FIXED_NOW,
      createId: () => {
        idCounter += 1
        if (idCounter === 1) {
          return OPERATION_ID
        }

        if (idCounter === 4) {
          return RECEIPT_B_ID
        }

        return `inventory-item-${idCounter}`
      },
    })

    const sharedPrefix = 'p'.repeat(240)
    const basePackage = {
      packageSizeValue: 25,
      packageSizeUnit: 'kg' as const,
      initialQuantityValue: 25,
      initialQuantityUnit: 'kg' as const,
      sequenceIndex: 0,
    }

    const first = await repository.createInventoryItemsWithInitialMovements(
      {
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        creationReason: 'initial_stock',
        idempotencyKey: `${sharedPrefix}-request-a`,
        packages: [basePackage],
      },
      phase7AAuthenticatedAccessContext(),
    )

    const second = await repository.createInventoryItemsWithInitialMovements(
      {
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        creationReason: 'initial_stock',
        idempotencyKey: `${sharedPrefix}-request-b`,
        packages: [basePackage],
      },
      phase7AAuthenticatedAccessContext(),
    )

    expect(first.operationId).toBe(OPERATION_ID)
    expect(second.operationId).toBe(RECEIPT_B_ID)
    expect(first.packages[0]?.initialMovement.idempotencyKey).toBe(
      movementKey(OPERATION_ID, 0),
    )
    expect(second.packages[0]?.initialMovement.idempotencyKey).toBe(
      movementKey(RECEIPT_B_ID, 0),
    )
    expect(first.packages[0]?.initialMovement.idempotencyKey).not.toBe(
      second.packages[0]?.initialMovement.idempotencyKey,
    )
  })
})
