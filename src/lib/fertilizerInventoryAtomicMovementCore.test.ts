import { describe, expect, it } from 'vitest'
import {
  APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC,
  buildAppendFertilizerInventoryCoreMovementRpcParams,
  mapAppendFertilizerInventoryCoreMovementRpcError,
  mapAppendFertilizerInventoryCoreMovementRpcResult,
} from './fertilizerInventoryAppendMovementRpcCore'
import {
  FertilizerInventoryRepositoryError,
  createInMemoryFertilizerInventoryRepository,
} from './fertilizerInventoryRepositoryCore'
import { createPersistentFertilizerInventoryRepository } from './fertilizerInventoryRepositoryPersistentCore'
import { createInMemoryFertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryCore'
import {
  FERTILIZER_COMPOSITION_FINGERPRINT_VERSION,
  FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE,
  FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS,
  type FertilizerSavedProductProfile,
} from '../types/fertilizerProductProfile'
import { createAtomicAppendRpcHarness } from './fertilizerInventoryAtomicMovementTestHarness'
import { mapInventoryItemToContainerRow } from './fertilizerInventoryRepositoryMappingCore'
import {
  PHASE7A_FIXED_NOW,
  PHASE7A_SAVED_PRODUCT_PROFILE_ID,
  PHASE7A_SESSION_HASH,
  PHASE7A_SESSION_ID,
  PHASE7A_USER_ID,
  phase7AAuthenticatedAccessContext,
  phase7ASessionAccessContext,
} from './fertilizerInventoryTestFixtures'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const OTHER_USER_ID = '00000000-0000-4000-8000-0000000007b2'
const FIXED_NOW = PHASE7A_FIXED_NOW

function deriveTestSessionAccessHash(sessionId: string): string {
  if (sessionId === PHASE7A_SESSION_ID) {
    return PHASE7A_SESSION_HASH
  }

  return 'fedcba9876543210'.repeat(4)
}

function buildSavedProfile(
  overrides: Partial<FertilizerSavedProductProfile> = {},
): FertilizerSavedProductProfile {
  return {
    id: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
    accessKind: 'authenticated_user',
    userId: PHASE7A_USER_ID,
    sessionAccessHash: null,
    productFamilyKey: 'family',
    identityFingerprint: 'identity',
    manufacturer: 'ICL',
    productLine: null,
    officialName: 'Stressmanager',
    variant: '0-0-30',
    productForm: 'granular',
    npkDeclaration: '0-0-30',
    nitrogen: 0,
    phosphate: 0,
    potash: 30,
    nutrientMatrix: {},
    compositionFingerprintVersion: FERTILIZER_COMPOSITION_FINGERPRINT_VERSION,
    compositionFingerprint: 'fp-7a',
    provenance: { confirmedAt: FIXED_NOW },
    saveIdempotencyKey: 'profile-idem-7a',
    source: FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE,
    profileStatus: FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS,
    verificationStatus: 'verified',
    createdAt: FIXED_NOW,
    ...overrides,
  }
}

async function seedProfileRepository(profile: FertilizerSavedProductProfile) {
  const repository = createInMemoryFertilizerProductProfileRepository({
    deriveSessionAccessHash: deriveTestSessionAccessHash,
  })
  const accessContext =
    profile.accessKind === 'session'
      ? phase7ASessionAccessContext()
      : phase7AAuthenticatedAccessContext()
  await repository.saveNewVersion(profile, accessContext)
  return repository
}

function createInMemoryRepo() {
  return createInMemoryFertilizerInventoryRepository({
    deriveSessionAccessHash: deriveTestSessionAccessHash,
    now: () => FIXED_NOW,
    createId: (() => {
      let counter = 0
      return () => {
        counter += 1
        return `atomic-memory-id-${counter}`
      }
    })(),
  })
}

async function createPersistentRepoWithHarness(
  harness: ReturnType<typeof createAtomicAppendRpcHarness>,
  profile = buildSavedProfile(),
) {
  return createPersistentFertilizerInventoryRepository({
    supabase: harness.client,
    deriveSessionAccessHash: deriveTestSessionAccessHash,
    productProfileRepository: await seedProfileRepository(profile),
    now: () => FIXED_NOW,
    createId: (() => {
      let counter = 0
      return () => {
        counter += 1
        return `atomic-persist-id-${counter}`
      }
    })(),
  })
}

async function createItem(
  repository: ReturnType<typeof createInMemoryRepo>,
  overrides: { id?: string; profileId?: string } = {},
) {
  return repository.createInventoryItem(
    {
      id: overrides.id,
      savedProductProfileId: overrides.profileId ?? PHASE7A_SAVED_PRODUCT_PROFILE_ID,
      baseUnit: 'kg',
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
    },
    phase7AAuthenticatedAccessContext(),
  )
}

describe('fertilizerInventoryAtomicMovementCore', () => {
  it('1 — appends a successful positive movement', async () => {
    const repository = createInMemoryRepo()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await createItem(repository)

    const movement = await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )

    expect(movement.quantityDelta).toBe(25)
    expect(await repository.computeItemBalance(item.id, accessContext)).toBe(25)
  })

  it('2 — appends a successful negative movement with sufficient balance', async () => {
    const repository = createInMemoryRepo()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await createItem(repository)

    await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )
    await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: -8,
        unit: 'kg',
        movementType: 'fertilization',
      },
      accessContext,
    )

    expect(await repository.computeItemBalance(item.id, accessContext)).toBe(17)
  })

  it('3 — allows negative movement to exactly zero balance', async () => {
    const repository = createInMemoryRepo()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await createItem(repository)

    await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 10,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )
    await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: -10,
        unit: 'kg',
        movementType: 'fertilization',
      },
      accessContext,
    )

    expect(await repository.computeItemBalance(item.id, accessContext)).toBe(0)
  })

  it('4 — rejects negative movement below zero balance', async () => {
    const repository = createInMemoryRepo()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await createItem(repository)

    await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 10,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )

    await expect(
      repository.appendMovement(
        {
          inventoryItemId: item.id,
          quantityDelta: -11,
          unit: 'kg',
          movementType: 'fertilization',
        },
        accessContext,
      ),
    ).rejects.toMatchObject({ code: 'invalid_stored_record' })
  })

  it('5 — serializing RPC mock prevents concurrent overdraw', async () => {
    const harness = createAtomicAppendRpcHarness({
      containers: [
        {
          ...mapInventoryItemToContainerRow({
            id: 'container-concurrent',
            accessKind: 'authenticated_user',
            userId: PHASE7A_USER_ID,
            sessionAccessHash: null,
            savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
            baseUnit: 'kg',
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            label: null,
            status: 'active',
            createdAt: FIXED_NOW,
            archivedAt: null,
            recordSchemaVersion: 'fertilizer-inventory-core-v1',
          }),
          created_at: FIXED_NOW,
        },
      ],
      movements: [
        {
          id: 'seed-movement',
          container_id: 'container-concurrent',
          access_kind: 'authenticated_user',
          user_id: PHASE7A_USER_ID,
          session_access_hash: null,
          quantity_delta: 10,
          unit: 'kg',
          movement_type: 'initial_stock',
          movement_origin: 'manual',
          movement_at: FIXED_NOW,
          inventory_idempotency_key: null,
          source_event_ref: null,
          note: null,
          created_at: FIXED_NOW,
        },
      ],
    })

    const repository = await createPersistentRepoWithHarness(harness)
    const accessContext = phase7AAuthenticatedAccessContext()
    const append = (suffix: string) =>
      repository.appendMovement(
        {
          inventoryItemId: 'container-concurrent',
          quantityDelta: -8,
          unit: 'kg',
          movementType: 'fertilization',
          idempotencyKey: `concurrent-${suffix}`,
        },
        accessContext,
      )

    const results = await Promise.allSettled([append('a'), append('b')])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')

    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]?.status === 'rejected' && (rejected[0].reason as FertilizerInventoryRepositoryError).code).toBe(
      'negative_balance',
    )
    expect(harness.movementInserts).toBe(1)
  })

  it('6 — parallel idempotency requests create exactly one movement', async () => {
    const harness = createAtomicAppendRpcHarness({
      containers: [
        {
          ...mapInventoryItemToContainerRow({
            id: 'container-idem-parallel',
            accessKind: 'authenticated_user',
            userId: PHASE7A_USER_ID,
            sessionAccessHash: null,
            savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
            baseUnit: 'kg',
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            label: null,
            status: 'active',
            createdAt: FIXED_NOW,
            archivedAt: null,
            recordSchemaVersion: 'fertilizer-inventory-core-v1',
          }),
          created_at: FIXED_NOW,
        },
      ],
    })
    const repository = await createPersistentRepoWithHarness(harness)
    const accessContext = phase7AAuthenticatedAccessContext()
    const input = {
      inventoryItemId: 'container-idem-parallel',
      quantityDelta: 25,
      unit: 'kg' as const,
      movementType: 'initial_stock' as const,
      idempotencyKey: 'parallel-idem-key',
    }

    const [first, second] = await Promise.all([
      repository.appendMovement(input, accessContext),
      repository.appendMovement(input, accessContext),
    ])

    expect(first.id).toBe(second.id)
    expect(harness.movementInserts).toBe(1)
  })

  it('7 — identical idempotency token replays existing movement', async () => {
    const repository = createInMemoryRepo()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await createItem(repository)
    const input = {
      inventoryItemId: item.id,
      quantityDelta: 25,
      unit: 'kg' as const,
      movementType: 'initial_stock' as const,
      idempotencyKey: 'replay-key',
    }

    const first = await repository.appendMovement(input, accessContext)
    const replay = await repository.appendMovement(input, accessContext)

    expect(replay).toEqual(first)
    expect(repository.state.movementsByItemId.get(item.id)).toHaveLength(1)
  })

  it('8 — same idempotency token with different quantity is rejected', async () => {
    const repository = createInMemoryRepo()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await createItem(repository)

    await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
        idempotencyKey: 'conflict-qty',
      },
      accessContext,
    )

    await expect(
      repository.appendMovement(
        {
          inventoryItemId: item.id,
          quantityDelta: 20,
          unit: 'kg',
          movementType: 'initial_stock',
          idempotencyKey: 'conflict-qty',
        },
        accessContext,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' })
  })

  it('9 — same idempotency token with different movement type is rejected', async () => {
    const repository = createInMemoryRepo()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await createItem(repository)

    await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
        idempotencyKey: 'conflict-type',
      },
      accessContext,
    )

    await expect(
      repository.appendMovement(
        {
          inventoryItemId: item.id,
          quantityDelta: 25,
          unit: 'kg',
          movementType: 'purchase',
          idempotencyKey: 'conflict-type',
        },
        accessContext,
      ),
    ).rejects.toMatchObject({ code: 'idempotency_conflict' })
  })

  it('10 — rejects movement unit mismatch against item base unit', async () => {
    const repository = createInMemoryRepo()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await createItem(repository)

    await expect(
      repository.appendMovement(
        {
          inventoryItemId: item.id,
          quantityDelta: 5,
          unit: 'ml',
          movementType: 'initial_stock',
        },
        accessContext,
      ),
    ).rejects.toMatchObject({ code: 'invalid_stored_record' })
  })

  it('11 — user scope cannot book on foreign item', async () => {
    const repository = createInMemoryRepo()
    const item = await createItem(repository)

    await expect(
      repository.appendMovement(
        {
          inventoryItemId: item.id,
          quantityDelta: 5,
          unit: 'kg',
          movementType: 'initial_stock',
        },
        { kind: 'authenticated_user', userId: OTHER_USER_ID },
      ),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('12 — session scope cannot book on foreign session item', async () => {
    const repository = createInMemoryRepo()
    const item = await repository.createInventoryItem(
      {
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        baseUnit: 'kg',
      },
      phase7ASessionAccessContext(),
    )

    await expect(
      repository.appendMovement(
        {
          inventoryItemId: item.id,
          quantityDelta: 5,
          unit: 'kg',
          movementType: 'initial_stock',
        },
        { kind: 'session', sessionId: 'foreign-session' },
      ),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('13 — user and session scopes cannot be mixed on the same item', async () => {
    const repository = createInMemoryRepo()
    const item = await createItem(repository)

    await expect(
      repository.appendMovement(
        {
          inventoryItemId: item.id,
          quantityDelta: 5,
          unit: 'kg',
          movementType: 'initial_stock',
        },
        phase7ASessionAccessContext(),
      ),
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('14 — balance is computed only for the concrete inventory item', async () => {
    const repository = createInMemoryRepo()
    const accessContext = phase7AAuthenticatedAccessContext()
    const first = await createItem(repository, { id: 'package-a' })
    const second = await createItem(repository, { id: 'package-b' })

    await repository.appendMovement(
      {
        inventoryItemId: first.id,
        quantityDelta: 10,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )
    await repository.appendMovement(
      {
        inventoryItemId: second.id,
        quantityDelta: 3,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )

    expect(await repository.computeItemBalance(first.id, accessContext)).toBe(10)
    expect(await repository.computeItemBalance(second.id, accessContext)).toBe(3)
  })

  it('15 — two packages of the same product profile stay separated', async () => {
    const repository = createInMemoryRepo()
    const accessContext = phase7AAuthenticatedAccessContext()
    const first = await createItem(repository, { id: 'same-profile-1' })
    const second = await createItem(repository, { id: 'same-profile-2' })

    await repository.appendMovement(
      {
        inventoryItemId: first.id,
        quantityDelta: 7,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )

    expect(await repository.computeItemBalance(first.id, accessContext)).toBe(7)
    expect(await repository.computeItemBalance(second.id, accessContext)).toBe(0)
  })

  it('16 — migration prevents movement updates', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20250805_fertilizer_inventory_core.sql'),
      'utf8',
    )

    expect(sql).toContain('prevent_fertilizer_stock_movement_update')
    expect(sql).toContain('INVENTORY_MOVEMENT_IMMUTABLE')
  })

  it('17 — migration prevents movement deletes', () => {
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/20250805_fertilizer_inventory_core.sql'),
      'utf8',
    )

    expect(sql).toContain('prevent_fertilizer_stock_movement_delete')
  })

  it('18 — does not introduce stored currentQuantity or balance fields', async () => {
    const repository = createInMemoryRepo()
    const item = await createItem(repository)

    expect(item).not.toHaveProperty('currentQuantity')
    expect(item).not.toHaveProperty('balance')
  })

  it('19 — persistent repository does not call legacy save_fertilizer_capture', () => {
    expect(String(createPersistentFertilizerInventoryRepository)).not.toContain(
      'save_fertilizer_capture',
    )
  })

  it('20 — persistent repository uses atomic RPC instead of direct movement insert', async () => {
    const harness = createAtomicAppendRpcHarness({
      containers: [
        {
          ...mapInventoryItemToContainerRow({
            id: 'container-rpc-only',
            accessKind: 'authenticated_user',
            userId: PHASE7A_USER_ID,
            sessionAccessHash: null,
            savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
            baseUnit: 'kg',
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            label: null,
            status: 'active',
            createdAt: FIXED_NOW,
            archivedAt: null,
            recordSchemaVersion: 'fertilizer-inventory-core-v1',
          }),
          created_at: FIXED_NOW,
        },
      ],
    })
    const repository = await createPersistentRepoWithHarness(harness)
    const accessContext = phase7AAuthenticatedAccessContext()

    await repository.appendMovement(
      {
        inventoryItemId: 'container-rpc-only',
        quantityDelta: 4,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )

    expect(harness.rpcCalls).toHaveLength(1)
    expect(harness.rpcCalls[0]?.fn).toBe(APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC)
    expect(harness.movementInserts).toBe(1)
  })
})

describe('fertilizerInventoryAppendMovementRpcCore', () => {
  it('builds RPC params from access context and input', () => {
    const params = buildAppendFertilizerInventoryCoreMovementRpcParams(
      {
        inventoryItemId: 'item-1',
        quantityDelta: 2.5,
        unit: 'kg',
        movementType: 'initial_stock',
        idempotencyKey: 'idem-1',
      },
      phase7AAuthenticatedAccessContext(),
      deriveTestSessionAccessHash,
    )

    expect(params.p_access_kind).toBe('authenticated_user')
    expect(params.p_user_id).toBe(PHASE7A_USER_ID)
    expect(params.p_session_access_hash).toBeNull()
    expect(params.p_inventory_item_id).toBe('item-1')
  })

  it('maps RPC error codes to repository error codes', () => {
    expect(
      mapAppendFertilizerInventoryCoreMovementRpcError({ message: 'INVENTORY_NEGATIVE_BALANCE' })
        .code,
    ).toBe('negative_balance')
    expect(
      mapAppendFertilizerInventoryCoreMovementRpcError({ message: 'INVENTORY_IDEMPOTENCY_CONFLICT' })
        .code,
    ).toBe('idempotency_conflict')
  })

  it('maps RPC result payloads to domain movements', () => {
    const movement = mapAppendFertilizerInventoryCoreMovementRpcResult({
      id: 'movement-1',
      container_id: 'item-1',
      access_kind: 'authenticated_user',
      user_id: PHASE7A_USER_ID,
      session_access_hash: null,
      quantity_delta: 5,
      unit: 'kg',
      movement_type: 'initial_stock',
      movement_origin: 'manual',
      movement_at: FIXED_NOW,
      inventory_idempotency_key: null,
      source_event_ref: null,
      note: null,
      created_at: FIXED_NOW,
    })

    expect(movement.inventoryItemId).toBe('item-1')
    expect(movement.quantityDelta).toBe(5)
  })
})
