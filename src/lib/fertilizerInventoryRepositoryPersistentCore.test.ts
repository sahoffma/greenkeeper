import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FertilizerSavedProductProfile } from '../types/fertilizerProductProfile'
import {
  FERTILIZER_COMPOSITION_FINGERPRINT_VERSION,
  FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE,
  FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS,
} from '../types/fertilizerProductProfile'
import type { FertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryCore'
import { createInMemoryFertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryCore'
import { createInMemoryFertilizerInventoryRepository } from './fertilizerInventoryRepositoryCore'
import {
  FERTILIZER_INVENTORY_CONTAINERS_TABLE,
  FERTILIZER_INVENTORY_MOVEMENTS_TABLE,
  mapInventoryItemToContainerRow,
  type FertilizerInventoryContainerRow,
  type FertilizerInventoryMovementRow,
} from './fertilizerInventoryRepositoryMappingCore'
import { createPersistentFertilizerInventoryRepository } from './fertilizerInventoryRepositoryPersistentCore'
import { APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC } from './fertilizerInventoryAppendMovementRpcCore'
import {
  executeAtomicAppendMovementRpc,
  type AtomicAppendRpcHarnessState,
} from './fertilizerInventoryAtomicMovementTestHarness'
import {
  PHASE7A_FIXED_NOW,
  PHASE7A_SAVED_PRODUCT_PROFILE_ID,
  PHASE7A_SESSION_HASH,
  PHASE7A_SESSION_ID,
  PHASE7A_USER_ID,
  phase7AAuthenticatedAccessContext,
  phase7ASessionAccessContext,
} from './fertilizerInventoryTestFixtures'

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

type QueryMode = 'select' | 'insert'

interface CapturedQuery {
  table: string
  mode: QueryMode
  filters: Array<[string, unknown]>
  notFilters: Array<[string, string, unknown]>
  orders: Array<[string, { ascending?: boolean }]>
  values?: Record<string, unknown>
}

function matchesFilters(
  row: Record<string, unknown>,
  eqFilters: Array<[string, unknown]>,
  notFilters: Array<[string, string, unknown]>,
): boolean {
  const eqMatch = eqFilters.every(([column, value]) => row[column] === value)
  const notMatch = notFilters.every(([column, operator, value]) => {
    if (operator === 'is' && value === null) {
      return row[column] != null
    }

    return true
  })

  return eqMatch && notMatch
}

function createFakeSupabase(initial: {
  containers?: FertilizerInventoryContainerRow[]
  movements?: FertilizerInventoryMovementRow[]
} = {}) {
  const containers = [...(initial.containers ?? [])]
  const movements = [...(initial.movements ?? [])]
  const queries: CapturedQuery[] = []

  class FakeQueryBuilder {
    private mode: QueryMode = 'select'
    private eqFilters: Array<[string, unknown]> = []
    private notFilters: Array<[string, string, unknown]> = []
    private orders: Array<[string, { ascending?: boolean }]> = []
    private values: Record<string, unknown> | null = null
    private requireSingle = false
    private requireMaybeSingle = false

    constructor(private readonly table: string) {}

    select(_columns = '*') {
      return this
    }

    insert(values: Record<string, unknown> | Record<string, unknown>[]) {
      this.mode = 'insert'
      this.values = Array.isArray(values) ? values[0] : values
      return this
    }

    update(_values: Record<string, unknown>) {
      throw new Error('update is not supported in inventory core tests')
    }

    delete() {
      throw new Error('delete is not supported in inventory core tests')
    }

    eq(column: string, value: unknown) {
      this.eqFilters.push([column, value])
      return this
    }

    not(column: string, operator: string, value: unknown) {
      this.notFilters.push([column, operator, value])
      return this
    }

    order(column: string, options?: { ascending?: boolean }) {
      this.orders.push([column, options ?? {}])
      return this
    }

    single() {
      this.requireSingle = true
      return this.execute()
    }

    maybeSingle() {
      this.requireMaybeSingle = true
      return this.execute()
    }

    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return this.execute().then(onFulfilled, onRejected)
    }

    private async execute() {
      queries.push({
        table: this.table,
        mode: this.mode,
        filters: [...this.eqFilters],
        notFilters: [...this.notFilters],
        orders: [...this.orders],
        values: this.values ?? undefined,
      })

      const tableRows =
        this.table === FERTILIZER_INVENTORY_CONTAINERS_TABLE
          ? containers
          : this.table === FERTILIZER_INVENTORY_MOVEMENTS_TABLE
            ? movements
            : null

      if (!tableRows) {
        return { data: null, error: { message: `Unknown table ${this.table}` } }
      }

      if (this.mode === 'insert' && this.values) {
        if (this.table === FERTILIZER_INVENTORY_MOVEMENTS_TABLE) {
          return {
            data: null,
            error: {
              message:
                'Direct movement insert is not allowed; use append_fertilizer_inventory_core_movement RPC.',
            },
          }
        }

        const inserted = {
          ...this.values,
          created_at: this.values.created_at ?? FIXED_NOW,
        }

        tableRows.push(inserted as never)
        return { data: inserted, error: null }
      }

      let matches = tableRows.filter((row) =>
        matchesFilters(row as unknown as Record<string, unknown>, this.eqFilters, this.notFilters),
      )

      for (const [column, options] of this.orders) {
        matches = [...matches].sort((left, right) => {
          const leftRecord = left as unknown as Record<string, unknown>
          const rightRecord = right as unknown as Record<string, unknown>
          const leftValue = String(leftRecord[column] ?? '')
          const rightValue = String(rightRecord[column] ?? '')
          const result = leftValue.localeCompare(rightValue)
          return options.ascending === false ? -result : result
        })
      }

      if (this.requireSingle && matches.length !== 1) {
        return { data: null, error: { message: 'Expected single row' } }
      }

      if (this.requireMaybeSingle) {
        return { data: matches[0] ?? null, error: null }
      }

      return { data: this.requireSingle ? matches[0] ?? null : matches, error: null }
    }
  }

  const client = {
    from(table: string) {
      return new FakeQueryBuilder(table)
    },
    rpc(fn: string, params: Record<string, unknown>) {
      if (fn !== APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC) {
        return Promise.resolve({ data: null, error: { message: 'UNKNOWN_RPC' } })
      }

      const rpcState: AtomicAppendRpcHarnessState = { containers, movements }
      try {
        const row = executeAtomicAppendMovementRpc(
          rpcState,
          params as unknown as Parameters<typeof executeAtomicAppendMovementRpc>[1],
        )
        return Promise.resolve({ data: row, error: null })
      } catch (error) {
        return Promise.resolve({
          data: null,
          error: { message: error instanceof Error ? error.message : 'UNKNOWN' },
        })
      }
    },
  } as unknown as SupabaseClient

  return { client, containers, movements, queries }
}

async function seedProfileRepository(
  profile: FertilizerSavedProductProfile,
): Promise<FertilizerProductProfileRepository> {
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

describe('fertilizerInventoryRepositoryPersistentCore', () => {
  it('inserts and reads an inventory item through the persistent adapter', async () => {
    const profile = buildSavedProfile()
    const { client } = createFakeSupabase()
    const repository = createPersistentFertilizerInventoryRepository({
      supabase: client,
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      productProfileRepository: await seedProfileRepository(profile),
      now: () => FIXED_NOW,
      createId: () => 'item-persist-1',
    })

    const created = await repository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
        packageSizeValue: 25,
        packageSizeUnit: 'kg',
        label: '25 kg Sack',
      },
      phase7AAuthenticatedAccessContext(),
    )

    const loaded = await repository.getInventoryItemById(created.id, phase7AAuthenticatedAccessContext())

    expect(loaded).toEqual(created)
    expect(loaded?.savedProductProfileId).toBe(profile.id)
    expect(loaded).not.toHaveProperty('officialName')
  })

  it('derives baseUnit from saved product profile productForm instead of trusting client input', async () => {
    const profile = buildSavedProfile({ productForm: 'liquid' })
    const { client } = createFakeSupabase()
    const repository = createPersistentFertilizerInventoryRepository({
      supabase: client,
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      productProfileRepository: await seedProfileRepository(profile),
      now: () => FIXED_NOW,
      createId: () => 'liquid-item-1',
    })

    const created = await repository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
        packageSizeValue: 5000,
        packageSizeUnit: 'ml',
      },
      phase7AAuthenticatedAccessContext(),
    )

    expect(created.baseUnit).toBe('ml')
  })

  it('appends movements append-only and computes balance from loaded movements', async () => {
    const profile = buildSavedProfile()
    const { client } = createFakeSupabase()
    const repository = createPersistentFertilizerInventoryRepository({
      supabase: client,
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      productProfileRepository: await seedProfileRepository(profile),
      now: () => FIXED_NOW,
      createId: (() => {
        let counter = 0
        return () => {
          counter += 1
          return counter === 1 ? 'item-persist-2' : `movement-persist-${counter - 1}`
        }
      })(),
    })
    const accessContext = phase7AAuthenticatedAccessContext()

    const item = await repository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
        packageSizeValue: 25,
        packageSizeUnit: 'kg',
      },
      accessContext,
    )

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
        movementAt: '2026-08-01T09:00:00.000Z',
      },
      accessContext,
    )

    const movements = await repository.listMovementsByItemId(item.id, accessContext)
    const balance = await repository.computeItemBalance(item.id, accessContext)

    expect(movements).toHaveLength(2)
    expect(balance).toBe(17)
  })

  it('isolates access scope for persistent reads and writes', async () => {
    const profile = buildSavedProfile()
    const item = mapInventoryItemToContainerRow({
      id: 'scoped-item',
      accessKind: 'authenticated_user',
      userId: PHASE7A_USER_ID,
      sessionAccessHash: null,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      label: 'Scoped',
      status: 'active',
      createdAt: FIXED_NOW,
      archivedAt: null,
      recordSchemaVersion: 'fertilizer-inventory-core-v1',
    })

    const { client } = createFakeSupabase({
      containers: [{ ...item, created_at: FIXED_NOW }],
    })

    const repository = createPersistentFertilizerInventoryRepository({
      supabase: client,
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      productProfileRepository: await seedProfileRepository(profile),
    })

    expect(
      await repository.getInventoryItemById('scoped-item', phase7AAuthenticatedAccessContext()),
    ).not.toBeNull()
    expect(
      await repository.getInventoryItemById('scoped-item', {
        kind: 'authenticated_user',
        userId: OTHER_USER_ID,
      }),
    ).toBeNull()
  })

  it('replays inventory movement inserts by idempotency key', async () => {
    const profile = buildSavedProfile()
    const { client, movements } = createFakeSupabase()
    const repository = createPersistentFertilizerInventoryRepository({
      supabase: client,
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      productProfileRepository: await seedProfileRepository(profile),
      now: () => FIXED_NOW,
      createId: (() => {
        let counter = 0
        return () => {
          counter += 1
          return counter === 1 ? 'item-persist-3' : 'movement-persist-idem'
        }
      })(),
    })
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await repository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
      },
      accessContext,
    )

    const first = await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
        idempotencyKey: 'inventory-idem-1',
      },
      accessContext,
    )
    const replay = await repository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
        idempotencyKey: 'inventory-idem-1',
      },
      accessContext,
    )

    expect(replay.id).toBe(first.id)
    expect(movements).toHaveLength(1)
  })

  it('does not expose quantity mutation APIs and never calls save_fertilizer_capture', async () => {
    const repository = createPersistentFertilizerInventoryRepository({
      supabase: { from: vi.fn() } as unknown as SupabaseClient,
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      productProfileRepository: await seedProfileRepository(buildSavedProfile()),
    })

    expect('updateQuantity' in repository).toBe(false)
    expect('updateMovement' in repository).toBe(false)
    expect('deleteMovement' in repository).toBe(false)
    expect('mergeItems' in repository).toBe(false)
    expect(String(createPersistentFertilizerInventoryRepository)).not.toContain('save_fertilizer_capture')
  })

  it('matches in-memory repository balance behavior for the same scenario', async () => {
    const profile = buildSavedProfile()
    const accessContext = phase7AAuthenticatedAccessContext()
    const inMemory = createInMemoryFertilizerInventoryRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      now: () => FIXED_NOW,
      createId: (() => {
        let counter = 0
        return () => `shared-id-${(counter += 1)}`
      })(),
    })

    const persistent = createPersistentFertilizerInventoryRepository({
      supabase: createFakeSupabase().client,
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      productProfileRepository: await seedProfileRepository(profile),
      now: () => FIXED_NOW,
      createId: (() => {
        let counter = 0
        return () => `shared-id-${(counter += 1)}`
      })(),
    })

    for (const repository of [inMemory, persistent]) {
      const item = await repository.createInventoryItem(
        {
          savedProductProfileId: profile.id,
          baseUnit: 'kg',
          packageSizeValue: 25,
          packageSizeUnit: 'kg',
        },
        accessContext,
      )

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
    }
  })

  it('supports session-scoped inventory persistence via session_access_hash', async () => {
    const profile = buildSavedProfile({
      accessKind: 'session',
      userId: null,
      sessionAccessHash: PHASE7A_SESSION_HASH,
      saveIdempotencyKey: 'session-profile-idem',
    })
    const { client } = createFakeSupabase()
    const repository = createPersistentFertilizerInventoryRepository({
      supabase: client,
      deriveSessionAccessHash: deriveTestSessionAccessHash,
      productProfileRepository: await seedProfileRepository(profile),
      now: () => FIXED_NOW,
      createId: () => 'session-item-1',
    })

    const item = await repository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
      },
      phase7ASessionAccessContext(),
    )

    expect(item.sessionAccessHash).toBe(PHASE7A_SESSION_HASH)
    expect(item.userId).toBeNull()
    expect(JSON.stringify(item).includes(PHASE7A_SESSION_ID)).toBe(false)
  })
})
