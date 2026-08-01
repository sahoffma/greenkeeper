import { describe, expect, it } from 'vitest'
import {
  FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS,
  type FertilizerInventoryItem,
} from '../types/fertilizerInventoryCore'
import {
  FertilizerInventoryRepositoryError,
  createInMemoryFertilizerInventoryRepository,
  type FertilizerInventoryRepository,
} from './fertilizerInventoryRepositoryCore'
import { buildInventoryCreationMovementIdempotencyKey } from './fertilizerInventoryCreationRpcCore'
import {
  PHASE7A_SAVED_PRODUCT_PROFILE_ID,
  PHASE7A_SESSION_HASH,
  PHASE7A_SESSION_ID,
  PHASE7A_USER_ID,
  phase7AAuthenticatedAccessContext,
  phase7ASessionAccessContext,
} from './fertilizerInventoryTestFixtures'

const OTHER_USER_ID = '00000000-0000-4000-8000-0000000007b2'
const FIXED_NOW = '2026-07-31T12:00:00.000Z'

function deriveTestSessionAccessHash(sessionId: string): string {
  if (sessionId === PHASE7A_SESSION_ID) {
    return PHASE7A_SESSION_HASH
  }

  return 'fedcba9876543210'.repeat(4)
}

function createTestRepository(): FertilizerInventoryRepository & {
  state: ReturnType<typeof createInMemoryFertilizerInventoryRepository>['state']
} {
  return createInMemoryFertilizerInventoryRepository({
    deriveSessionAccessHash: deriveTestSessionAccessHash,
    now: () => FIXED_NOW,
    createId: (() => {
      let counter = 0
      return () => {
        counter += 1
        return `inventory-test-id-${counter}`
      }
    })(),
  })
}

function createGranularItemInput(overrides: {
  id?: string
  label?: string | null
} = {}) {
  return {
    id: overrides.id,
    savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
    baseUnit: 'kg' as const,
    packageSizeValue: 25,
    packageSizeUnit: 'kg' as const,
    label: overrides.label ?? '25 kg Sack',
  }
}

describe('fertilizerInventoryRepositoryCore', () => {
  it('creates and loads an inventory item in the authenticated access scope', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()

    const created = await repository.createInventoryItem(createGranularItemInput(), accessContext)
    const loaded = await repository.getInventoryItemById(created.id, accessContext)

    expect(loaded).toEqual(created)
    expect(loaded?.userId).toBe(PHASE7A_USER_ID)
    expect(loaded?.sessionAccessHash).toBeNull()
  })

  it('lists inventory items by saved product version within the same access scope', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()

    const first = await repository.createInventoryItem(
      createGranularItemInput({ id: 'item-a', label: 'Sack A' }),
      accessContext,
    )
    const second = await repository.createInventoryItem(
      createGranularItemInput({ id: 'item-b', label: 'Sack B' }),
      accessContext,
    )
    await repository.createInventoryItem(
      {
        ...createGranularItemInput({ id: 'item-other-profile' }),
        savedProductProfileId: '99999999-9999-4999-8999-999999999999',
      },
      accessContext,
    )

    const listed = await repository.listInventoryItemsByProductVersion(
      PHASE7A_SAVED_PRODUCT_PROFILE_ID,
      accessContext,
    )

    expect(listed.map((item) => item.id).sort()).toEqual([first.id, second.id].sort())
  })

  it('keeps two identical product-version packages as separate inventory items', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()

    const first = await repository.createInventoryItem(
      createGranularItemInput({ id: 'package-1' }),
      accessContext,
    )
    const second = await repository.createInventoryItem(
      createGranularItemInput({ id: 'package-2' }),
      accessContext,
    )

    expect(first.id).not.toBe(second.id)
    expect(repository.state.itemsById.size).toBe(2)
  })

  it('appends movements append-only and loads them for an inventory item', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await repository.createInventoryItem(createGranularItemInput(), accessContext)

    const initialMovement = await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )
    const applicationMovement = await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: -8,
        unit: 'kg',
        movementType: 'fertilization',
        movementAt: '2026-08-01T09:00:00.000Z',
      },
      accessContext,
    )

    const movements = await repository.listMovementsByItemId(item.id, accessContext)

    expect(movements).toHaveLength(2)
    expect(movements[0]?.id).toBe(initialMovement.id)
    expect(movements[1]?.id).toBe(applicationMovement.id)
    expect(repository.state.movementsByItemId.get(item.id)).toHaveLength(2)
  })

  it('computes item balance from movements without persisting a balance field', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await repository.createInventoryItem(createGranularItemInput(), accessContext)

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

    const balance = await repository.computeItemBalance(item.id, accessContext)
    const storedItem = repository.state.itemsById.get(item.id) as FertilizerInventoryItem

    expect(balance).toBe(17)
    expect(storedItem).not.toHaveProperty('currentQuantity')
    expect(storedItem).not.toHaveProperty('balance')
    expect(storedItem).not.toHaveProperty('remainingAmount')
  })

  it('returns zero balance while keeping the inventory item stored', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await repository.createInventoryItem(createGranularItemInput(), accessContext)

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
        quantityDelta: -25,
        unit: 'kg',
        movementType: 'fertilization',
      },
      accessContext,
    )

    expect(await repository.computeItemBalance(item.id, accessContext)).toBe(0)
    expect(await repository.getInventoryItemById(item.id, accessContext)).not.toBeNull()
  })

  it('isolates authenticated user inventory from other users', async () => {
    const repository = createTestRepository()
    const ownerContext = phase7AAuthenticatedAccessContext()
    const foreignContext = { kind: 'authenticated_user' as const, userId: OTHER_USER_ID }

    const item = await repository.createInventoryItem(createGranularItemInput(), ownerContext)

    expect(await repository.getInventoryItemById(item.id, foreignContext)).toBeNull()
    expect(
      await repository.listInventoryItemsByProductVersion(
        PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        foreignContext,
      ),
    ).toEqual([])
    expect(await repository.listMovementsByItemId(item.id, foreignContext)).toEqual([])
    await expect(repository.computeItemBalance(item.id, foreignContext)).rejects.toBeInstanceOf(
      FertilizerInventoryRepositoryError,
    )
  })

  it('isolates session-scoped inventory by session access hash', async () => {
    const repository = createTestRepository()
    const ownerContext = phase7ASessionAccessContext()
    const foreignContext = { kind: 'session' as const, sessionId: 'foreign-session' }

    const item = await repository.createInventoryItem(createGranularItemInput(), ownerContext)

    expect(await repository.getInventoryItemById(item.id, ownerContext)).not.toBeNull()
    expect(await repository.getInventoryItemById(item.id, foreignContext)).toBeNull()
    expect(JSON.stringify(item).includes(PHASE7A_SESSION_ID)).toBe(false)
    expect(JSON.stringify(item).includes(PHASE7A_SESSION_HASH)).toBe(true)
  })

  it('does not expose quantity mutation or merge APIs on the repository contract', () => {
    const repository = createTestRepository()

    expect('updateInventoryItem' in repository).toBe(false)
    expect('setQuantity' in repository).toBe(false)
    expect('adjustBalance' in repository).toBe(false)
    expect('mergeInventoryItems' in repository).toBe(false)
  })

  it('stores inventory items without duplicated product profile fields', async () => {
    const repository = createTestRepository()
    const item = await repository.createInventoryItem(
      createGranularItemInput(),
      phase7AAuthenticatedAccessContext(),
    )

    for (const forbiddenField of FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS) {
      expect(item).not.toHaveProperty(forbiddenField)
    }

    expect(item.savedProductProfileId).toBe(PHASE7A_SAVED_PRODUCT_PROFILE_ID)
  })

  it('requires explicit createInventoryItem calls and does not auto-create inventory', async () => {
    const repository = createTestRepository()

    expect(repository.state.itemsById.size).toBe(0)
    expect(
      await repository.listInventoryItemsByProductVersion(
        PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        phase7AAuthenticatedAccessContext(),
      ),
    ).toEqual([])
  })

  it('preserves existing movement history when appending a new movement', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await repository.createInventoryItem(createGranularItemInput(), accessContext)

    const first = await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )
    const historyBeforeAppend = structuredClone(
      repository.state.movementsByItemId.get(item.id) ?? [],
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

    const historyAfterAppend = repository.state.movementsByItemId.get(item.id) ?? []

    expect(historyAfterAppend).toHaveLength(2)
    expect(historyAfterAppend[0]).toEqual(first)
    expect(historyAfterAppend[0]?.quantityDelta).toBe(25)
    expect(historyBeforeAppend[0]?.quantityDelta).toBe(25)
  })

  it('rejects append operations that would produce a negative balance', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await repository.createInventoryItem(createGranularItemInput(), accessContext)

    await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )

    await expect(
      repository.appendMovement(
        {
          inventoryItemId: item.id,
          quantityDelta: -26,
          unit: 'kg',
          movementType: 'fertilization',
        },
        accessContext,
      ),
    ).rejects.toBeInstanceOf(FertilizerInventoryRepositoryError)

    expect(repository.state.movementsByItemId.get(item.id)).toHaveLength(1)
  })

  it('replays idempotent movement appends without duplicating history', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await repository.createInventoryItem(createGranularItemInput(), accessContext)

    const first = await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
        idempotencyKey: 'movement-idem-1',
      },
      accessContext,
    )
    const replay = await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
        idempotencyKey: 'movement-idem-1',
      },
      accessContext,
    )

    expect(replay.id).toBe(first.id)
    expect(repository.state.movementsByItemId.get(item.id)).toHaveLength(1)
  })

  it('creates multiple inventory items with initial movements atomically in memory', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()

    const result = await repository.createInventoryItemsWithInitialMovements(
      {
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        creationReason: 'purchase',
        idempotencyKey: 'creation-idem-memory',
        packages: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            sequenceIndex: 0,
          },
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            sequenceIndex: 1,
          },
        ],
      },
      accessContext,
    )

    expect(result.packages).toHaveLength(2)
    expect(result.packages[0]?.item.id).not.toBe(result.packages[1]?.item.id)
    expect(result.packages[0]?.initialMovement.inventoryItemId).toBe(result.packages[0]?.item.id)
    expect(repository.state.itemsById.size).toBe(2)
    expect(repository.state.movementsByItemId.size).toBe(2)
  })

  it('replays identical in-memory creation requests deterministically', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()
    const input = {
      savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
      creationReason: 'gift_received' as const,
      idempotencyKey: 'creation-idem-replay',
      packages: [
        {
          packageSizeValue: 10,
          packageSizeUnit: 'kg' as const,
          initialQuantityValue: 10,
          initialQuantityUnit: 'kg' as const,
          sequenceIndex: 0,
        },
      ],
    }

    const first = await repository.createInventoryItemsWithInitialMovements(input, accessContext)
    const replay = await repository.createInventoryItemsWithInitialMovements(input, accessContext)

    expect(replay.operationId).toBe(first.operationId)
    expect(replay.packages[0]?.item.id).toBe(first.packages[0]?.item.id)
    expect(replay.packages[0]?.initialMovement.id).toBe(first.packages[0]?.initialMovement.id)
    expect(repository.state.itemsById.size).toBe(1)
  })

  it('rejects in-memory creation idempotency conflicts for differing payloads', async () => {
    const repository = createTestRepository()
    const accessContext = phase7AAuthenticatedAccessContext()

    await repository.createInventoryItemsWithInitialMovements(
      {
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        creationReason: 'initial_stock',
        idempotencyKey: 'creation-idem-conflict',
        packages: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            sequenceIndex: 0,
          },
        ],
      },
      accessContext,
    )

    await expect(
      repository.createInventoryItemsWithInitialMovements(
        {
          savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
          creationReason: 'initial_stock',
          idempotencyKey: 'creation-idem-conflict',
          packages: [
            {
              packageSizeValue: 10,
              packageSizeUnit: 'kg',
              initialQuantityValue: 10,
              initialQuantityUnit: 'kg',
              sequenceIndex: 0,
            },
          ],
        },
        accessContext,
      ),
    ).rejects.toMatchObject({ code: 'creation_idempotency_conflict' })

    expect(repository.state.itemsById.size).toBe(1)
  })

  it('uses receipt-based movement idempotency keys in memory', async () => {
    let idCounter = 0
    const receiptId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'
    const repository = createInMemoryFertilizerInventoryRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      now: () => FIXED_NOW,
      createId: () => {
        idCounter += 1
        return idCounter === 1 ? receiptId : `inventory-item-${idCounter}`
      },
    })

    const result = await repository.createInventoryItemsWithInitialMovements(
      {
        savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        creationReason: 'purchase',
        idempotencyKey: 'creation-idem-memory-keys',
        packages: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            sequenceIndex: 0,
          },
        ],
      },
      phase7AAuthenticatedAccessContext(),
    )

    expect(result.operationId).toBe(receiptId)
    expect(result.packages[0]?.initialMovement.idempotencyKey).toBe(
      buildInventoryCreationMovementIdempotencyKey(receiptId, 0),
    )
    expect(result.packages[0]?.initialMovement.idempotencyKey).not.toContain(
      'creation-idem-memory-keys',
    )
  })
})
