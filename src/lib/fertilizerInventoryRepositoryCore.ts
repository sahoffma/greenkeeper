import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import {
  FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  FertilizerInventoryError,
  type FertilizerInventoryBaseUnit,
  type FertilizerInventoryItem,
  type FertilizerInventoryItemStatus,
  type FertilizerInventoryMovement,
  type FertilizerInventoryMovementOrigin,
  type FertilizerInventoryMovementType,
} from '../types/fertilizerInventoryCore'
import { computeInventoryItemBalance } from './fertilizerInventoryBalanceCore'
import { validateAppendInventoryMovement } from './fertilizerInventoryMovementCore'
import { inventoryMovementIdempotencyPayloadMatches } from './fertilizerInventoryMovementIdempotencyCore'
import {
  inventoryItemMatchesAccessContext,
  inventoryMovementMatchesAccessContext,
  validateInventoryItemRecord,
} from './fertilizerInventoryRecordValidationCore'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import { createRandomId } from './randomId'

export const FERTILIZER_INVENTORY_REPOSITORY_ERROR_CODES = [
  'invalid_stored_record',
  'persistence_unavailable',
  'idempotency_conflict',
  'not_found',
  'access_denied',
  'unit_mismatch',
  'quantity_invalid',
  'negative_balance',
] as const

export type FertilizerInventoryRepositoryErrorCode =
  (typeof FERTILIZER_INVENTORY_REPOSITORY_ERROR_CODES)[number]

export class FertilizerInventoryRepositoryError extends Error {
  readonly code: FertilizerInventoryRepositoryErrorCode

  constructor(code: FertilizerInventoryRepositoryErrorCode, message: string) {
    super(message)
    this.name = 'FertilizerInventoryRepositoryError'
    this.code = code
  }
}

export interface CreateFertilizerInventoryItemInput {
  id?: string
  savedProductProfileId: string
  baseUnit: FertilizerInventoryBaseUnit
  packageSizeValue?: number | null
  packageSizeUnit?: FertilizerInventoryBaseUnit | null
  label?: string | null
  status?: FertilizerInventoryItemStatus
  createdAt?: string
  archivedAt?: string | null
}

export interface AppendFertilizerInventoryMovementInput {
  id?: string
  inventoryItemId: string
  quantityDelta: number
  unit: FertilizerInventoryBaseUnit
  movementType: FertilizerInventoryMovementType
  movementOrigin?: FertilizerInventoryMovementOrigin
  movementAt?: string
  sourceEventRef?: string | null
  idempotencyKey?: string | null
  note?: string | null
  createdAt?: string
}

export interface FertilizerInventoryRepository {
  createInventoryItem(
    input: CreateFertilizerInventoryItemInput,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerInventoryItem>
  getInventoryItemById(
    id: string,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerInventoryItem | null>
  listInventoryItemsByProductVersion(
    savedProductProfileId: string,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerInventoryItem[]>
  appendMovement(
    input: AppendFertilizerInventoryMovementInput,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerInventoryMovement>
  listMovementsByItemId(
    inventoryItemId: string,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerInventoryMovement[]>
  computeItemBalance(
    inventoryItemId: string,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<number>
}

export interface InMemoryFertilizerInventoryRepositoryState {
  itemsById: Map<string, FertilizerInventoryItem>
  movementsByItemId: Map<string, FertilizerInventoryMovement[]>
  movementIdempotencyByScope: Map<string, string>
}

export interface InMemoryFertilizerInventoryRepositoryOptions {
  initialState?: Partial<InMemoryFertilizerInventoryRepositoryState>
  deriveSessionAccessHash?: DeriveSessionAccessHash
  now?: () => string
  createId?: () => string
}

function cloneInventoryItem(item: FertilizerInventoryItem): FertilizerInventoryItem {
  return structuredClone(item)
}

function cloneInventoryMovement(movement: FertilizerInventoryMovement): FertilizerInventoryMovement {
  return structuredClone(movement)
}

function resolveSessionAccessHash(
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash?: DeriveSessionAccessHash,
): string {
  if (accessContext.kind !== 'session') {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Session access hash derivation is required for session-scoped inventory access.',
    )
  }

  if (!deriveSessionAccessHash) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Session access hash derivation is required for session-scoped inventory access.',
    )
  }

  return deriveSessionAccessHash(accessContext.sessionId)
}

function inventoryAccessScopeKey(
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash?: DeriveSessionAccessHash,
): string {
  if (accessContext.kind === 'authenticated_user') {
    return `user:${accessContext.userId}`
  }

  return `session:${resolveSessionAccessHash(accessContext, deriveSessionAccessHash)}`
}

function inventoryItemAccessScopeKey(item: FertilizerInventoryItem): string {
  if (item.accessKind === 'authenticated_user') {
    return `user:${item.userId}`
  }

  return `session:${item.sessionAccessHash}`
}

function movementIdempotencyLookupKey(accessScope: string, idempotencyKey: string): string {
  return `${accessScope}|${idempotencyKey}`
}

function mapInventoryDomainError(error: unknown): never {
  if (error instanceof FertilizerInventoryError) {
    throw new FertilizerInventoryRepositoryError('invalid_stored_record', error.message)
  }

  throw error
}

function buildInventoryItemFromInput(
  input: CreateFertilizerInventoryItemInput,
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash | undefined,
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
      savedProductProfileId: input.savedProductProfileId,
      baseUnit: input.baseUnit,
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
    sessionAccessHash: resolveSessionAccessHash(accessContext, deriveSessionAccessHash),
    savedProductProfileId: input.savedProductProfileId,
    baseUnit: input.baseUnit,
    packageSizeValue: input.packageSizeValue ?? null,
    packageSizeUnit: input.packageSizeUnit ?? null,
    label: input.label ?? null,
    status: input.status ?? 'active',
    createdAt,
    archivedAt: input.archivedAt ?? null,
    recordSchemaVersion: FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  }
}

function buildInventoryMovementFromInput(
  input: AppendFertilizerInventoryMovementInput,
  item: FertilizerInventoryItem,
  now: () => string,
  createId: () => string,
): FertilizerInventoryMovement {
  return {
    id: input.id ?? createId(),
    inventoryItemId: input.inventoryItemId,
    accessKind: item.accessKind,
    userId: item.userId,
    sessionAccessHash: item.sessionAccessHash,
    quantityDelta: input.quantityDelta,
    unit: input.unit,
    movementType: input.movementType,
    movementOrigin: input.movementOrigin ?? 'manual',
    movementAt: input.movementAt ?? now(),
    sourceEventRef: input.sourceEventRef ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    note: input.note ?? null,
    createdAt: input.createdAt ?? now(),
    recordSchemaVersion: FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  }
}

function sortMovements(movements: FertilizerInventoryMovement[]): FertilizerInventoryMovement[] {
  return [...movements].sort((left, right) => {
    const byTime = left.movementAt.localeCompare(right.movementAt)
    if (byTime !== 0) {
      return byTime
    }

    return left.createdAt.localeCompare(right.createdAt)
  })
}

export function createInMemoryFertilizerInventoryRepository(
  options: InMemoryFertilizerInventoryRepositoryOptions = {},
): FertilizerInventoryRepository & {
  state: InMemoryFertilizerInventoryRepositoryState
} {
  const {
    initialState,
    deriveSessionAccessHash,
    now = () => new Date().toISOString(),
    createId = createRandomId,
  } = options

  const state: InMemoryFertilizerInventoryRepositoryState = {
    itemsById: initialState?.itemsById ?? new Map(),
    movementsByItemId: initialState?.movementsByItemId ?? new Map(),
    movementIdempotencyByScope: initialState?.movementIdempotencyByScope ?? new Map(),
  }

  function getItemInScope(
    id: string,
    accessContext: FertilizerEnrichmentAccessContext,
  ): FertilizerInventoryItem | null {
    const item = state.itemsById.get(id)
    if (!item) {
      return null
    }

    const sessionAccessHash =
      accessContext.kind === 'session'
        ? resolveSessionAccessHash(accessContext, deriveSessionAccessHash)
        : null

    if (!inventoryItemMatchesAccessContext(item, accessContext, sessionAccessHash)) {
      return null
    }

    return item
  }

  function listStoredMovementsForItem(itemId: string): FertilizerInventoryMovement[] {
    return [...(state.movementsByItemId.get(itemId) ?? [])]
  }

  function findStoredMovementById(movementId: string): FertilizerInventoryMovement | null {
    for (const movements of state.movementsByItemId.values()) {
      const match = movements.find((movement) => movement.id === movementId)
      if (match) {
        return match
      }
    }

    return null
  }

  return {
    state,
    async createInventoryItem(input, accessContext) {
      try {
        const item = buildInventoryItemFromInput(
          input,
          accessContext,
          deriveSessionAccessHash,
          now,
          createId,
        )
        validateInventoryItemRecord(item)

        if (state.itemsById.has(item.id)) {
          throw new FertilizerInventoryRepositoryError(
            'invalid_stored_record',
            'Inventory item id already exists.',
          )
        }

        const snapshot = cloneInventoryItem(item)
        state.itemsById.set(snapshot.id, snapshot)
        return cloneInventoryItem(snapshot)
      } catch (error) {
        mapInventoryDomainError(error)
      }
    },
    async getInventoryItemById(id, accessContext) {
      const item = getItemInScope(id, accessContext)
      return item ? cloneInventoryItem(item) : null
    },
    async listInventoryItemsByProductVersion(savedProductProfileId, accessContext) {
      const sessionAccessHash =
        accessContext.kind === 'session'
          ? resolveSessionAccessHash(accessContext, deriveSessionAccessHash)
          : null

      const items = [...state.itemsById.values()].filter(
        (item) =>
          item.savedProductProfileId === savedProductProfileId &&
          inventoryItemMatchesAccessContext(item, accessContext, sessionAccessHash),
      )

      return items.map(cloneInventoryItem)
    },
    async appendMovement(input, accessContext) {
      try {
        const item = getItemInScope(input.inventoryItemId, accessContext)
        if (!item) {
          throw new FertilizerInventoryRepositoryError(
            'not_found',
            'Inventory item was not found for the current access scope.',
          )
        }

        const accessScope = inventoryAccessScopeKey(accessContext, deriveSessionAccessHash)
        if (input.idempotencyKey) {
          const existingMovementId = state.movementIdempotencyByScope.get(
            movementIdempotencyLookupKey(accessScope, input.idempotencyKey),
          )
          if (existingMovementId) {
            const existingMovement = findStoredMovementById(existingMovementId)
            if (existingMovement) {
              if (existingMovement.inventoryItemId !== item.id) {
                throw new FertilizerInventoryRepositoryError(
                  'idempotency_conflict',
                  'Inventory movement idempotency conflict.',
                )
              }

              if (!inventoryMovementIdempotencyPayloadMatches(existingMovement, input, item.id)) {
                throw new FertilizerInventoryRepositoryError(
                  'idempotency_conflict',
                  'Inventory movement idempotency conflict.',
                )
              }

              return cloneInventoryMovement(existingMovement)
            }
          }
        }

        const existingMovements = listStoredMovementsForItem(item.id)
        const movement = buildInventoryMovementFromInput(input, item, now, createId)

        validateAppendInventoryMovement(movement, item, existingMovements)

        if (input.idempotencyKey) {
          const lookupKey = movementIdempotencyLookupKey(accessScope, input.idempotencyKey)
          if (state.movementIdempotencyByScope.has(lookupKey)) {
            throw new FertilizerInventoryRepositoryError(
              'idempotency_conflict',
              'Inventory movement idempotency conflict.',
            )
          }
        }

        const snapshot = cloneInventoryMovement(movement)
        state.movementsByItemId.set(item.id, [...existingMovements, snapshot])

        if (snapshot.idempotencyKey) {
          state.movementIdempotencyByScope.set(
            movementIdempotencyLookupKey(accessScope, snapshot.idempotencyKey),
            snapshot.id,
          )
        }

        return cloneInventoryMovement(snapshot)
      } catch (error) {
        if (error instanceof FertilizerInventoryRepositoryError) {
          throw error
        }

        mapInventoryDomainError(error)
      }
    },
    async listMovementsByItemId(inventoryItemId, accessContext) {
      const item = getItemInScope(inventoryItemId, accessContext)
      if (!item) {
        return []
      }

      const sessionAccessHash =
        accessContext.kind === 'session'
          ? resolveSessionAccessHash(accessContext, deriveSessionAccessHash)
          : null

      const movements = sortMovements(listStoredMovementsForItem(item.id)).filter((movement) =>
        inventoryMovementMatchesAccessContext(movement, accessContext, sessionAccessHash),
      )

      return movements.map(cloneInventoryMovement)
    },
    async computeItemBalance(inventoryItemId, accessContext) {
      const item = getItemInScope(inventoryItemId, accessContext)
      if (!item) {
        throw new FertilizerInventoryRepositoryError(
          'not_found',
          'Inventory item was not found for the current access scope.',
        )
      }

      const movements = await this.listMovementsByItemId(inventoryItemId, accessContext)
      return computeInventoryItemBalance(movements)
    },
  }
}

export {
  inventoryItemAccessScopeKey,
  inventoryAccessScopeKey,
  inventoryItemMatchesAccessContext,
}
