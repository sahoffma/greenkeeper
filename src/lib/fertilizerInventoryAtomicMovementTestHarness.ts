import type { SupabaseClient } from '@supabase/supabase-js'
import {
  APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC,
  type AppendFertilizerInventoryCoreMovementRpcParams,
} from './fertilizerInventoryAppendMovementRpcCore'
import {
  FERTILIZER_INVENTORY_CONTAINERS_TABLE,
  FERTILIZER_INVENTORY_MOVEMENTS_TABLE,
  type FertilizerInventoryContainerRow,
  type FertilizerInventoryMovementRow,
} from './fertilizerInventoryRepositoryMappingCore'

export interface AtomicAppendRpcHarnessState {
  containers: FertilizerInventoryContainerRow[]
  movements: FertilizerInventoryMovementRow[]
}

export interface AtomicAppendRpcHarness {
  client: SupabaseClient
  state: AtomicAppendRpcHarnessState
  rpcCalls: Array<{ fn: string; params: Record<string, unknown> }>
  movementInserts: number
}

const containerLocks = new Map<string, Promise<void>>()

async function withContainerLock<T>(containerId: string, operation: () => Promise<T>): Promise<T> {
  const previous = containerLocks.get(containerId) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  containerLocks.set(
    containerId,
    previous.then(() => gate),
  )

  await previous

  try {
    return await operation()
  } finally {
    release()
    if (containerLocks.get(containerId) === gate) {
      containerLocks.delete(containerId)
    }
  }
}

function findContainer(
  state: AtomicAppendRpcHarnessState,
  params: AppendFertilizerInventoryCoreMovementRpcParams,
): FertilizerInventoryContainerRow | null {
  const container = state.containers.find((row) => row.id === params.p_inventory_item_id)
  if (!container) {
    return null
  }

  if (
    !container.saved_product_profile_id ||
    !container.access_kind ||
    !container.base_unit
  ) {
    return null
  }

  if (container.access_kind !== params.p_access_kind) {
    throw rpcError('INVENTORY_ACCESS_DENIED')
  }

  if (container.access_kind === 'authenticated_user') {
    if (container.user_id !== params.p_user_id) {
      throw rpcError('INVENTORY_ACCESS_DENIED')
    }
  } else if (container.session_access_hash !== params.p_session_access_hash) {
    throw rpcError('INVENTORY_ACCESS_DENIED')
  }

  return container
}

function rpcError(code: string): Error {
  return new Error(code)
}

function findExistingByIdempotency(
  state: AtomicAppendRpcHarnessState,
  container: FertilizerInventoryContainerRow,
  idempotencyKey: string,
): FertilizerInventoryMovementRow | undefined {
  return state.movements.find((movement) => {
    if (!movement.movement_at || !movement.inventory_idempotency_key) {
      return false
    }

    if (movement.inventory_idempotency_key !== idempotencyKey) {
      return false
    }

    if (container.access_kind === 'authenticated_user') {
      return (
        movement.access_kind === 'authenticated_user' &&
        movement.user_id === container.user_id
      )
    }

    return (
      movement.access_kind === 'session' &&
      movement.session_access_hash === container.session_access_hash
    )
  })
}

function idempotencyPayloadMatches(
  existing: FertilizerInventoryMovementRow,
  params: AppendFertilizerInventoryCoreMovementRpcParams,
): boolean {
  return (
    existing.container_id === params.p_inventory_item_id &&
    Number(existing.quantity_delta) === Number(params.p_quantity_delta) &&
    existing.unit === params.p_unit &&
    existing.movement_type === params.p_movement_type
  )
}

function computeCoreBalance(
  state: AtomicAppendRpcHarnessState,
  containerId: string,
): number {
  return state.movements
    .filter((movement) => movement.container_id === containerId && movement.movement_at)
    .reduce((sum, movement) => sum + Number(movement.quantity_delta), 0)
}

function validateQuantity(params: AppendFertilizerInventoryCoreMovementRpcParams): void {
  const quantity = Number(params.p_quantity_delta)

  if (!Number.isFinite(quantity) || quantity === 0 || Math.abs(quantity) > 100_000) {
    throw rpcError('INVENTORY_QUANTITY_INVALID')
  }

  const normalized = quantity.toString()
  const fraction = normalized.includes('.') ? normalized.split('.')[1] : ''
  if (fraction.length > 4) {
    throw rpcError('INVENTORY_QUANTITY_INVALID')
  }
}

function appendMovementAtomically(
  state: AtomicAppendRpcHarnessState,
  params: AppendFertilizerInventoryCoreMovementRpcParams,
): FertilizerInventoryMovementRow {
  const container = findContainer(state, params)
  if (!container) {
    throw rpcError('INVENTORY_ITEM_NOT_FOUND')
  }

  if (params.p_unit !== container.base_unit) {
    throw rpcError('INVENTORY_UNIT_MISMATCH')
  }

  validateQuantity(params)

  const idempotencyKey = params.p_inventory_idempotency_key?.trim() || null
  if (idempotencyKey) {
    const existing = findExistingByIdempotency(state, container, idempotencyKey)
    if (existing) {
      if (!idempotencyPayloadMatches(existing, params)) {
        throw rpcError('INVENTORY_IDEMPOTENCY_CONFLICT')
      }

      return existing
    }
  }

  const balance = computeCoreBalance(state, params.p_inventory_item_id)
  if (balance + Number(params.p_quantity_delta) < 0) {
    throw rpcError('INVENTORY_NEGATIVE_BALANCE')
  }

  const movementAt = params.p_movement_at ?? new Date().toISOString()
  const createdAt = params.p_created_at ?? movementAt
  const inserted: FertilizerInventoryMovementRow = {
    id: params.p_movement_id ?? `movement-${state.movements.length + 1}`,
    container_id: params.p_inventory_item_id,
    access_kind: container.access_kind,
    user_id: container.user_id,
    session_access_hash: container.session_access_hash,
    quantity_delta: Number(params.p_quantity_delta),
    unit: params.p_unit,
    movement_type: params.p_movement_type,
    movement_origin: params.p_movement_origin ?? 'manual',
    movement_at: movementAt,
    inventory_idempotency_key: idempotencyKey,
    source_event_ref: params.p_source_event_ref,
    note: params.p_note,
    created_at: createdAt,
    capture_idempotency_key: null,
    movement_date: movementAt.slice(0, 10),
  }

  if (idempotencyKey) {
    const duplicate = findExistingByIdempotency(state, container, idempotencyKey)
    if (duplicate) {
      if (!idempotencyPayloadMatches(duplicate, params)) {
        throw rpcError('INVENTORY_IDEMPOTENCY_CONFLICT')
      }

      return duplicate
    }
  }

  state.movements.push(inserted)
  return inserted
}

export function executeAtomicAppendMovementRpc(
  state: AtomicAppendRpcHarnessState,
  params: AppendFertilizerInventoryCoreMovementRpcParams,
): FertilizerInventoryMovementRow {
  return appendMovementAtomically(state, params)
}

export function createAtomicAppendRpcHarness(
  initial: Partial<AtomicAppendRpcHarnessState> = {},
): AtomicAppendRpcHarness {
  const state: AtomicAppendRpcHarnessState = {
    containers: [...(initial.containers ?? [])],
    movements: [...(initial.movements ?? [])],
  }
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []
  let movementInserts = 0

  const client = {
    from(table: string) {
      throw new Error(`Direct table access is not expected in append tests: ${table}`)
    },
    rpc(fn: string, params: Record<string, unknown>) {
      rpcCalls.push({ fn, params })

      if (fn !== APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC) {
        return Promise.resolve({ data: null, error: { message: 'UNKNOWN_RPC' } })
      }

      return withContainerLock(String(params.p_inventory_item_id), async () => {
        try {
          const beforeCount = state.movements.length
          const row = appendMovementAtomically(
            state,
            params as unknown as AppendFertilizerInventoryCoreMovementRpcParams,
          )
          if (state.movements.length > beforeCount) {
            movementInserts += 1
          }

          return { data: row, error: null }
        } catch (error) {
          return {
            data: null,
            error: { message: error instanceof Error ? error.message : 'UNKNOWN' },
          }
        }
      })
    },
  } as unknown as SupabaseClient

  return {
    client,
    state,
    rpcCalls,
    get movementInserts() {
      return movementInserts
    },
  }
}

export {
  APPEND_FERTILIZER_INVENTORY_CORE_MOVEMENT_RPC,
  FERTILIZER_INVENTORY_CONTAINERS_TABLE,
  FERTILIZER_INVENTORY_MOVEMENTS_TABLE,
}
