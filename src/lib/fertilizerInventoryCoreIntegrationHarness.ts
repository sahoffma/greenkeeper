import type { SupabaseClient } from '@supabase/supabase-js'
import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerSavedProductProfile } from '../types/fertilizerProductProfile'
import {
  resolveInventoryBaseUnitFromProductForm,
} from '../types/fertilizerInventoryCore'
import type { FertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryCore'
import { createInMemoryFertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryCore'
import { createPersistentFertilizerInventoryRepository } from './fertilizerInventoryRepositoryPersistentCore'
import type { FertilizerInventoryRepository } from './fertilizerInventoryRepositoryCore'
import {
  FERTILIZER_INVENTORY_CONTAINERS_TABLE,
  FERTILIZER_INVENTORY_MOVEMENTS_TABLE,
  type FertilizerInventoryContainerRow,
  type FertilizerInventoryMovementRow,
} from './fertilizerInventoryRepositoryMappingCore'
import { APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC } from './fertilizerInventoryAppendMovementRpcCore'
import {
  executeAtomicAppendMovementRpc,
  type AtomicAppendRpcHarnessState,
} from './fertilizerInventoryAtomicMovementTestHarness'
import {
  PHASE7A_FIXED_NOW,
  PHASE7A_SESSION_HASH,
  PHASE7A_SESSION_ID,
} from './fertilizerInventoryTestFixtures'

export const INVENTORY_MOVEMENT_IMMUTABLE_ERROR = 'INVENTORY_MOVEMENT_IMMUTABLE'
export const INVENTORY_MOVEMENT_UNIT_MISMATCH_ERROR = 'INVENTORY_MOVEMENT_UNIT_MISMATCH'
export const INVENTORY_BASE_UNIT_PRODUCT_FORM_MISMATCH_ERROR =
  'INVENTORY_BASE_UNIT_PRODUCT_FORM_MISMATCH'

type QueryMode = 'select' | 'insert' | 'update' | 'delete'

function deriveIntegrationSessionAccessHash(sessionId: string): string {
  if (sessionId === PHASE7A_SESSION_ID) {
    return PHASE7A_SESSION_HASH
  }

  return 'fedcba9876543210'.repeat(4)
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

function assertCoreContainerInsert(
  values: Record<string, unknown>,
  profile: FertilizerSavedProductProfile | null,
): void {
  if (!values.saved_product_profile_id || !values.access_kind || !values.base_unit) {
    return
  }

  if (values.product_id != null || values.recognition_candidate_id != null) {
    throw new Error('Legacy product bindings are not allowed on core inventory containers.')
  }

  if (!profile || profile.profileStatus !== 'saved' || profile.source !== 'enrichment') {
    throw new Error('INVALID_SAVED_PRODUCT_PROFILE_REFERENCE')
  }

  const expectedBaseUnit = resolveInventoryBaseUnitFromProductForm(profile.productForm)
  if (values.base_unit !== expectedBaseUnit) {
    throw new Error(INVENTORY_BASE_UNIT_PRODUCT_FORM_MISMATCH_ERROR)
  }
}

export interface MigrationAwareInventorySupabase {
  client: SupabaseClient
  containers: FertilizerInventoryContainerRow[]
  movements: FertilizerInventoryMovementRow[]
}

export interface InventoryCoreIntegrationStack {
  profileRepository: FertilizerProductProfileRepository
  inventoryRepository: FertilizerInventoryRepository
  supabase: MigrationAwareInventorySupabase
  deriveSessionAccessHash: (sessionId: string) => string
  seedProfile: (
    profile: FertilizerSavedProductProfile,
    accessContext: FertilizerEnrichmentAccessContext,
  ) => Promise<FertilizerSavedProductProfile>
}

export interface InventoryCoreIntegrationStackOptions {
  fixedNow?: string
  createId?: () => string
  initialContainers?: FertilizerInventoryContainerRow[]
  initialMovements?: FertilizerInventoryMovementRow[]
  profileRepository?: FertilizerProductProfileRepository
}

export function createMigrationAwareInventorySupabase(
  profileRepository: FertilizerProductProfileRepository,
  options: Pick<
    InventoryCoreIntegrationStackOptions,
    'initialContainers' | 'initialMovements' | 'fixedNow'
  > = {},
): MigrationAwareInventorySupabase {
  const fixedNow = options.fixedNow ?? PHASE7A_FIXED_NOW
  const containers = [...(options.initialContainers ?? [])]
  const movements = [...(options.initialMovements ?? [])]

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

    update(values: Record<string, unknown>) {
      this.mode = 'update'
      this.values = values
      return this
    }

    delete() {
      this.mode = 'delete'
      return this
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
      const tableRows =
        this.table === FERTILIZER_INVENTORY_CONTAINERS_TABLE
          ? containers
          : this.table === FERTILIZER_INVENTORY_MOVEMENTS_TABLE
            ? movements
            : null

      if (!tableRows) {
        return { data: null, error: { message: `Unknown table ${this.table}` } }
      }

      if (this.mode === 'update' || this.mode === 'delete') {
        if (this.table === FERTILIZER_INVENTORY_MOVEMENTS_TABLE) {
          return {
            data: null,
            error: { message: INVENTORY_MOVEMENT_IMMUTABLE_ERROR },
          }
        }

        return {
          data: null,
          error: { message: 'Mutation is not supported in integration harness.' },
        }
      }

      if (this.mode === 'insert' && this.values) {
        try {
          if (this.table === FERTILIZER_INVENTORY_CONTAINERS_TABLE) {
            const profileId = String(this.values.saved_product_profile_id ?? '')
            let profile: FertilizerSavedProductProfile | null = null

            if (profileId) {
              if (this.values.access_kind === 'session') {
                profile = await profileRepository.getById(profileId, {
                  kind: 'session',
                  sessionId: PHASE7A_SESSION_ID,
                })
              } else {
                profile = await profileRepository.getById(profileId, {
                  kind: 'authenticated_user',
                  userId: String(this.values.user_id ?? ''),
                })
              }
            }

            assertCoreContainerInsert(this.values, profile)
          }

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
            created_at: this.values.created_at ?? fixedNow,
          }

          tableRows.push(inserted as never)
          return { data: inserted, error: null }
        } catch (error) {
          return {
            data: null,
            error: {
              message: error instanceof Error ? error.message : 'Insert validation failed.',
            },
          }
        }
      }

      let matches = tableRows.filter((row) =>
        matchesFilters(row as unknown as Record<string, unknown>, this.eqFilters, this.notFilters),
      )

      for (const [column, orderOptions] of this.orders) {
        matches = [...matches].sort((left, right) => {
          const leftRecord = left as unknown as Record<string, unknown>
          const rightRecord = right as unknown as Record<string, unknown>
          const leftValue = String(leftRecord[column] ?? '')
          const rightValue = String(rightRecord[column] ?? '')
          const result = leftValue.localeCompare(rightValue)
          return orderOptions.ascending === false ? -result : result
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

  return { client, containers, movements }
}

export function createInventoryCoreIntegrationStack(
  options: InventoryCoreIntegrationStackOptions = {},
): InventoryCoreIntegrationStack {
  const fixedNow = options.fixedNow ?? PHASE7A_FIXED_NOW
  const deriveSessionAccessHash = deriveIntegrationSessionAccessHash
  const profileRepository =
    options.profileRepository ??
    createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash,
    })
  const supabase = createMigrationAwareInventorySupabase(profileRepository, options)

  let idCounter = 0
  const createId =
    options.createId ??
    (() => {
      idCounter += 1
      return `integration-id-${idCounter}`
    })

  const inventoryRepository = createPersistentFertilizerInventoryRepository({
    supabase: supabase.client,
    deriveSessionAccessHash,
    productProfileRepository: profileRepository,
    now: () => fixedNow,
    createId,
  })

  async function seedProfile(
    profile: FertilizerSavedProductProfile,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerSavedProductProfile> {
    return profileRepository.saveNewVersion(profile, accessContext)
  }

  return {
    profileRepository,
    inventoryRepository,
    supabase,
    deriveSessionAccessHash,
    seedProfile,
  }
}
