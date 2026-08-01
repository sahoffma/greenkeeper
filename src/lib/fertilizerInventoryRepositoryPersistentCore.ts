import type { SupabaseClient } from '@supabase/supabase-js'
import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import {
  FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  resolveInventoryBaseUnitFromProductForm,
  type FertilizerInventoryItem,
  type FertilizerInventoryMovement,
} from '../types/fertilizerInventoryCore'
import {
  buildCreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams,
  CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC,
  mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcError,
  mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult,
} from './fertilizerInventoryCreationRpcCore'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import {
  APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC,
  buildAppendFertilizerInventoryCoreMovementRpcParams,
  mapAppendFertilizerInventoryCoreMovementRpcError,
  mapAppendFertilizerInventoryCoreMovementRpcResult,
} from './fertilizerInventoryAppendMovementRpcCore'
import { computeInventoryItemBalance } from './fertilizerInventoryBalanceCore'
import type { FertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryCore'
import {
  FERTILIZER_INVENTORY_AUTH_MOVEMENT_IDEMPOTENCY_INDEX,
  FERTILIZER_INVENTORY_CONTAINER_ROW_SELECT,
  FERTILIZER_INVENTORY_CONTAINERS_TABLE,
  FERTILIZER_INVENTORY_MOVEMENT_ROW_SELECT,
  FERTILIZER_INVENTORY_MOVEMENTS_TABLE,
  FERTILIZER_INVENTORY_SESSION_MOVEMENT_IDEMPOTENCY_INDEX,
  mapContainerRowToInventoryItem,
  mapInventoryItemToContainerRow,
  mapInventoryInsertError,
  mapMovementRowToInventoryMovement,
  validateStoredInventoryItemRecord,
  validateStoredInventoryMovementRecord,
  type FertilizerInventoryContainerRow,
  type FertilizerInventoryMovementRow,
} from './fertilizerInventoryRepositoryMappingCore'
import {
  FertilizerInventoryRepositoryError,
  type CreateFertilizerInventoryItemInput,
  type FertilizerInventoryRepository,
} from './fertilizerInventoryRepositoryCore'
import { createRandomId } from './randomId'

export interface PersistentFertilizerInventoryRepositoryDependencies {
  supabase: SupabaseClient
  deriveSessionAccessHash: DeriveSessionAccessHash
  productProfileRepository: FertilizerProductProfileRepository
  validateItemRecord?: (item: FertilizerInventoryItem) => void
  validateMovementRecord?: (movement: FertilizerInventoryMovement) => void
  now?: () => string
  createId?: () => string
}

type InventoryFilterBuilder = {
  eq: (column: string, value: unknown) => InventoryFilterBuilder
  not: (column: string, operator: string, value: unknown) => InventoryFilterBuilder
  order: (column: string, options?: { ascending?: boolean }) => InventoryFilterBuilder
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>
  then: Promise<{ data: unknown; error: unknown }>['then']
}

function asInventoryFilterBuilder(query: unknown): InventoryFilterBuilder {
  return query as InventoryFilterBuilder
}

async function runInventoryMaybeSingleQuery(
  query: InventoryFilterBuilder,
): Promise<{ data: unknown; error: unknown }> {
  return query.maybeSingle()
}

async function runInventoryListQuery(
  query: InventoryFilterBuilder,
): Promise<{ data: unknown; error: unknown }> {
  return query as unknown as Promise<{ data: unknown; error: unknown }>
}

function mapPersistenceError(error: unknown): never {
  if (error instanceof FertilizerInventoryRepositoryError) {
    throw error
  }

  throw new FertilizerInventoryRepositoryError(
    'persistence_unavailable',
    'Inventory persistence failed.',
  )
}

function applyInventoryAccessFilters(
  query: unknown,
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): InventoryFilterBuilder {
  const builder = asInventoryFilterBuilder(query)

  if (accessContext.kind === 'authenticated_user') {
    return builder.eq('access_kind', 'authenticated_user').eq('user_id', accessContext.userId)
  }

  return builder
    .eq('access_kind', 'session')
    .eq('session_access_hash', deriveSessionAccessHash(accessContext.sessionId))
}

function applyCoreInventoryFilters(query: unknown): InventoryFilterBuilder {
  return asInventoryFilterBuilder(query)
    .not('saved_product_profile_id', 'is', null)
    .not('access_kind', 'is', null)
}

function resolveSessionAccessHash(
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): string {
  if (accessContext.kind !== 'session') {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Session access hash derivation is required for session-scoped inventory access.',
    )
  }

  return deriveSessionAccessHash(accessContext.sessionId)
}

function buildInventoryItemForCreate(
  input: CreateFertilizerInventoryItemInput,
  accessContext: FertilizerEnrichmentAccessContext,
  savedProductProfileId: string,
  baseUnit: FertilizerInventoryItem['baseUnit'],
  deriveSessionAccessHashFn: DeriveSessionAccessHash,
  now: () => string,
  createId: () => string,
): FertilizerInventoryItem {
  const createdAt = input.createdAt ?? now()

  if (accessContext.kind === 'authenticated_user') {
    return {
      id: input.id ?? createId(),
      accessKind: 'authenticated_user',
      userId: accessContext.userId,
      sessionAccessHash: null,
      savedProductProfileId,
      baseUnit,
      packageSizeValue: input.packageSizeValue ?? null,
      packageSizeUnit: input.packageSizeUnit ?? null,
      label: input.label ?? null,
      status: input.status ?? 'active',
      createdAt,
      archivedAt: input.archivedAt ?? null,
      recordSchemaVersion: FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
    }
  }

  return {
    id: input.id ?? createId(),
    accessKind: 'session',
    userId: null,
    sessionAccessHash: resolveSessionAccessHash(accessContext, deriveSessionAccessHashFn),
    savedProductProfileId,
    baseUnit,
    packageSizeValue: input.packageSizeValue ?? null,
    packageSizeUnit: input.packageSizeUnit ?? null,
    label: input.label ?? null,
    status: input.status ?? 'active',
    createdAt,
    archivedAt: input.archivedAt ?? null,
    recordSchemaVersion: FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  }
}

function sortMovementRows(rows: FertilizerInventoryMovementRow[]): FertilizerInventoryMovementRow[] {
  return [...rows].sort((left, right) => {
    const byTime = left.movement_at.localeCompare(right.movement_at)
    if (byTime !== 0) {
      return byTime
    }

    return left.created_at.localeCompare(right.created_at)
  })
}

export function createPersistentFertilizerInventoryRepository(
  dependencies: PersistentFertilizerInventoryRepositoryDependencies,
): FertilizerInventoryRepository {
  const {
    supabase,
    deriveSessionAccessHash: deriveSessionAccessHashFn,
    productProfileRepository,
    validateItemRecord = validateStoredInventoryItemRecord,
    validateMovementRecord = validateStoredInventoryMovementRecord,
    now = () => new Date().toISOString(),
    createId = createRandomId,
  } = dependencies

  async function loadInventoryItemById(
    id: string,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerInventoryItem | null> {
    const { data, error } = await runInventoryMaybeSingleQuery(
      applyInventoryAccessFilters(
        applyCoreInventoryFilters(
          asInventoryFilterBuilder(
            supabase
              .from(FERTILIZER_INVENTORY_CONTAINERS_TABLE)
              .select(FERTILIZER_INVENTORY_CONTAINER_ROW_SELECT)
              .eq('id', id),
          ),
        ),
        accessContext,
        deriveSessionAccessHashFn,
      ),
    )

    if (error) {
      throw new FertilizerInventoryRepositoryError(
        'persistence_unavailable',
        'Failed to load inventory item.',
      )
    }

    if (!data) {
      return null
    }

    const item = mapContainerRowToInventoryItem(data as FertilizerInventoryContainerRow)
    validateItemRecord(item)
    return item
  }

  async function loadMovementsByItemId(
    inventoryItemId: string,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerInventoryMovement[]> {
    const item = await loadInventoryItemById(inventoryItemId, accessContext)
    if (!item) {
      return []
    }

    const { data, error } = await runInventoryListQuery(
      applyInventoryAccessFilters(
        asInventoryFilterBuilder(
          supabase
            .from(FERTILIZER_INVENTORY_MOVEMENTS_TABLE)
            .select(FERTILIZER_INVENTORY_MOVEMENT_ROW_SELECT)
            .eq('container_id', inventoryItemId)
            .not('movement_at', 'is', null)
            .order('movement_at', { ascending: true })
            .order('created_at', { ascending: true }),
        ),
        accessContext,
        deriveSessionAccessHashFn,
      ),
    )

    if (error) {
      throw new FertilizerInventoryRepositoryError(
        'persistence_unavailable',
        'Failed to load inventory movements.',
      )
    }

    const rows = sortMovementRows((data ?? []) as FertilizerInventoryMovementRow[])
    const movements = rows.map((row) => mapMovementRowToInventoryMovement(row))
    movements.forEach(validateMovementRecord)
    return movements
  }

  return {
    async createInventoryItem(input, accessContext) {
      try {
        const profile = await productProfileRepository.getById(
          input.savedProductProfileId,
          accessContext,
        )

        if (!profile) {
          throw new FertilizerInventoryRepositoryError(
            'invalid_stored_record',
            'Saved product profile was not found for the current access scope.',
          )
        }

        const baseUnit = resolveInventoryBaseUnitFromProductForm(profile.productForm)
        const item = buildInventoryItemForCreate(
          input,
          accessContext,
          profile.id,
          baseUnit,
          deriveSessionAccessHashFn,
          now,
          createId,
        )
        validateItemRecord(item)

        const { data, error } = await supabase
          .from(FERTILIZER_INVENTORY_CONTAINERS_TABLE)
          .insert(mapInventoryItemToContainerRow(item))
          .select(FERTILIZER_INVENTORY_CONTAINER_ROW_SELECT)
          .single()

        if (error) {
          throw mapInventoryInsertError(error)
        }

        const persisted = mapContainerRowToInventoryItem(data as FertilizerInventoryContainerRow)
        validateItemRecord(persisted)
        return persisted
      } catch (error) {
        mapPersistenceError(error)
      }
    },

    async createInventoryItemsWithInitialMovements(input, accessContext) {
      try {
        const rpcParams = buildCreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams(
          input,
          accessContext,
          deriveSessionAccessHashFn,
        )

        const { data, error } = await supabase.rpc(
          CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC,
          rpcParams,
        )

        if (error) {
          throw mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcError(error)
        }

        const persisted = mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult(data)
        persisted.packages.forEach((entry) => {
          validateItemRecord(entry.item)
          validateMovementRecord(entry.initialMovement)
        })
        return persisted
      } catch (error) {
        mapPersistenceError(error)
      }
    },

    async getInventoryItemById(id, accessContext) {
      try {
        return await loadInventoryItemById(id, accessContext)
      } catch (error) {
        mapPersistenceError(error)
      }
    },

    async listInventoryItemsByProductVersion(savedProductProfileId, accessContext) {
      try {
        const { data, error } = await runInventoryListQuery(
          applyInventoryAccessFilters(
            applyCoreInventoryFilters(
              asInventoryFilterBuilder(
                supabase
                  .from(FERTILIZER_INVENTORY_CONTAINERS_TABLE)
                  .select(FERTILIZER_INVENTORY_CONTAINER_ROW_SELECT)
                  .eq('saved_product_profile_id', savedProductProfileId),
              ),
            ),
            accessContext,
            deriveSessionAccessHashFn,
          ),
        )

        if (error) {
          throw new FertilizerInventoryRepositoryError(
            'persistence_unavailable',
            'Failed to list inventory items.',
          )
        }

        const items = ((data ?? []) as FertilizerInventoryContainerRow[]).map((row) =>
          mapContainerRowToInventoryItem(row),
        )
        items.forEach(validateItemRecord)
        return items
      } catch (error) {
        mapPersistenceError(error)
      }
    },

    async appendMovement(input, accessContext) {
      try {
        const rpcParams = buildAppendFertilizerInventoryCoreMovementRpcParams(
          input,
          accessContext,
          deriveSessionAccessHashFn,
          {
            movementId: input.id ?? createId(),
            createdAt: input.createdAt ?? now(),
            movementAt: input.movementAt ?? now(),
            movementOrigin: input.movementOrigin ?? 'manual',
          },
        )

        const { data, error } = await supabase.rpc(
          APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC,
          rpcParams,
        )

        if (error) {
          throw mapAppendFertilizerInventoryCoreMovementRpcError(error)
        }

        const persisted = mapAppendFertilizerInventoryCoreMovementRpcResult(data)
        validateMovementRecord(persisted)
        return persisted
      } catch (error) {
        mapPersistenceError(error)
      }
    },

    async listMovementsByItemId(inventoryItemId, accessContext) {
      try {
        return await loadMovementsByItemId(inventoryItemId, accessContext)
      } catch (error) {
        mapPersistenceError(error)
      }
    },

    async computeItemBalance(inventoryItemId, accessContext) {
      try {
        const item = await loadInventoryItemById(inventoryItemId, accessContext)
        if (!item) {
          throw new FertilizerInventoryRepositoryError(
            'not_found',
            'Inventory item was not found for the current access scope.',
          )
        }

        const movements = await loadMovementsByItemId(inventoryItemId, accessContext)
        return computeInventoryItemBalance(movements)
      } catch (error) {
        mapPersistenceError(error)
      }
    },
  }
}

export {
  FERTILIZER_INVENTORY_AUTH_MOVEMENT_IDEMPOTENCY_INDEX,
  FERTILIZER_INVENTORY_SESSION_MOVEMENT_IDEMPOTENCY_INDEX,
}
