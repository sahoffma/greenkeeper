import type { Client } from 'pg'
import { insertSavedProductProfileFixture } from './fertilizerProductStockIntakeDatabaseTestHarness'
import type { LocalProductStockIntakeAuthClient } from './fertilizerProductStockIntakeLocalPostgresHarness'
import {
  GET_ACTIVE_FERTILIZER_PRODUCT_STOCK_ITEM_RPC,
  LIST_ACTIVE_FERTILIZER_PRODUCT_STOCK_RPC,
  parseActiveProductStockItemPayload,
  parseActiveProductStockListPayload,
} from './fertilizerProductStockReadCore'
import type { LegacyMigrationDatabaseTestState } from './fertilizerProductStockLegacyMigrationDatabaseTestHarness'

export {
  connectLegacyMigrationTestPg as connectProductStockReadTestPg,
  createEmptyLegacyMigrationDatabaseTestState as createEmptyProductStockReadDatabaseTestState,
  createLegacyMigrationAuthClient as createProductStockReadAuthClient,
  createLegacyMigrationTestUser as createProductStockReadTestUser,
  insertCanonicalProductStockFixture,
  insertLegacyContainerFixture,
  insertLegacyMovementFixture,
  loadLegacyMigrationDatabaseTestConfig as loadProductStockReadDatabaseTestConfig,
  purgeLegacyMigrationDatabaseTestData as purgeProductStockReadDatabaseTestData,
} from './fertilizerProductStockLegacyMigrationDatabaseTestHarness'

import { ensureProductStockIntakeMigrationsApplied, withTestReplicationRole } from './fertilizerProductStockIntakeDatabaseTestHarness'
export { insertSavedProductProfileFixture, ensureProductStockIntakeMigrationsApplied, withTestReplicationRole }
export { stopLocalProductStockIntakePostgres } from './fertilizerProductStockIntakeLocalPostgresHarness'
export { stopProductStockIntakeDatabaseTestEnvironment } from './fertilizerProductStockIntakeDatabaseTestHarness'

export async function callListActiveProductStockViaRpc(
  authClient: LocalProductStockIntakeAuthClient,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const client = await authClient.pool.connect()

  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authClient.userId])
    const { rows } = await client.query(
      `select public.${LIST_ACTIVE_FERTILIZER_PRODUCT_STOCK_RPC}() as result`,
    )
    await client.query('commit')
    return { data: rows[0]?.result ?? null, error: null }
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    return { data: null, error: { message: (error as Error).message } }
  } finally {
    client.release()
  }
}

export async function callGetActiveProductStockItemViaRpc(
  authClient: LocalProductStockIntakeAuthClient,
  inventoryItemId: string,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const client = await authClient.pool.connect()

  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authClient.userId])
    const { rows } = await client.query(
      `select public.${GET_ACTIVE_FERTILIZER_PRODUCT_STOCK_ITEM_RPC}($1::uuid) as result`,
      [inventoryItemId],
    )
    await client.query('commit')
    return { data: rows[0]?.result ?? null, error: null }
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    return { data: null, error: { message: (error as Error).message } }
  } finally {
    client.release()
  }
}

export async function callListActiveProductStockUnauthenticated(
  client: Client,
): Promise<{ data: unknown; error: { message: string } | null }> {
  try {
    const { rows } = await client.query(
      `select public.${LIST_ACTIVE_FERTILIZER_PRODUCT_STOCK_RPC}() as result`,
    )
    return { data: rows[0]?.result ?? null, error: null }
  } catch (error) {
    return { data: null, error: { message: (error as Error).message } }
  }
}

export async function loadContainerRowDirect(
  client: Client,
  containerId: string,
): Promise<Record<string, unknown> | null> {
  const { rows } = await client.query(
    `select id, user_id, stock_kind, archived_at, superseded_by_container_id, saved_product_profile_id, base_unit
     from public.fertilizer_containers
     where id = $1`,
    [containerId],
  )
  return (rows[0] as Record<string, unknown> | undefined) ?? null
}

export async function computeEffectiveBalanceDirect(
  client: Client,
  containerId: string,
  userId: string,
): Promise<number> {
  const { rows } = await client.query(
    `select coalesce(sum(quantity_delta), 0)::numeric as balance
     from public.fertilizer_stock_movements
     where container_id = $1
       and user_id = $2
       and movement_at is not null`,
    [containerId, userId],
  )
  return Number(rows[0]?.balance ?? 0)
}

export type ProductStockReadDatabaseTestState = LegacyMigrationDatabaseTestState

export {
  parseActiveProductStockItemPayload,
  parseActiveProductStockListPayload,
}
