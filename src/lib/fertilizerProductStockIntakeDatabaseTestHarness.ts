import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import {
  CREATION_DB_TEST_PREFIX,
  connectCreationTestPg,
  createAdminSupabaseClient as createCloudAdminSupabaseClient,
  createAuthenticatedSupabaseClient as createCloudAuthenticatedSupabaseClient,
  createCreationDatabaseTestUser as createCloudCreationDatabaseTestUser,
  ensureCreationMigrationsApplied,
  insertSavedProductProfileFixture,
  loadCreationDatabaseTestConfig,
  reloadPostgrestSchema as reloadCloudPostgrestSchema,
  type CreationDatabaseTestConfig,
  type CreationDatabaseTestState,
} from './fertilizerInventoryCreationDatabaseTestHarness'
import {
  callLocalProductStockIntakeRpc,
  callLocalProductStockOutboundRpc,
  connectLocalProductStockIntakeTestPg,
  createLocalProductStockIntakeAdminClient,
  createLocalProductStockIntakeAuthClient,
  createLocalProductStockIntakeTestUser,
  isLocalProductStockIntakeAdminClient,
  isLocalProductStockIntakeAuthClient,
  isLocalProductStockIntakeDatabaseTestConfig,
  loadLocalProductStockIntakeDatabaseTestConfig,
  purgeLocalProductStockIntakeDatabaseTestData,
  reloadLocalPostgrestSchema,
  stopLocalProductStockIntakePostgres,
  type LocalProductStockIntakeAuthClient,
  type LocalProductStockIntakeDatabaseTestConfig,
} from './fertilizerProductStockIntakeLocalPostgresHarness'
import { RECORD_FERTILIZER_PRODUCT_STOCK_INTAKE_RPC } from './fertilizerProductStockIntakeRpcCore'
import { RECORD_FERTILIZER_PRODUCT_STOCK_OUTBOUND_RPC } from './fertilizerProductStockOutboundRpcCore'

export const PRODUCT_STOCK_DB_TEST_PREFIX = `${CREATION_DB_TEST_PREFIX}-ps`

const MIGRATION_DIR = resolve(process.cwd(), 'supabase/migrations')

const PRODUCT_STOCK_MIGRATION = {
  file: '20250810_fertilizer_product_stock_intake.sql',
  probeSql: `select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'fertilizer_containers'
      and column_name = 'stock_kind'`,
} as const

const PRODUCT_STOCK_OUTBOUND_MIGRATION = {
  file: '20250813_fertilizer_product_stock_outbound.sql',
  probeSql: `select 1 from information_schema.tables
    where table_schema = 'public'
      and table_name = 'fertilizer_product_stock_outbound_receipts'`,
} as const

export type ProductStockIntakeDatabaseTestConfig =
  | CreationDatabaseTestConfig
  | LocalProductStockIntakeDatabaseTestConfig

export type ProductStockIntakeAuthClient = SupabaseClient | LocalProductStockIntakeAuthClient

export type ProductStockIntakeAdminClient = SupabaseClient | ReturnType<typeof createLocalProductStockIntakeAdminClient>

export interface ProductStockIntakeDatabaseTestState extends CreationDatabaseTestState {
  intakeReceiptIds: string[]
  intakeMovementIds: string[]
}

export interface ProductStockIntakeRpcCallParams {
  savedProductProfileId: string
  baseUnit: 'kg' | 'ml'
  quantity: number
  reason: 'initial_stock' | 'purchase' | 'gift_received'
  idempotencyKey: string
  movementAt?: string | null
  sourceEventRef?: string | null
  note?: string | null
}

export function loadProductStockIntakeDatabaseTestConfig(): ProductStockIntakeDatabaseTestConfig | null {
  return loadLocalProductStockIntakeDatabaseTestConfig() ?? loadCreationDatabaseTestConfig()
}

export function createEmptyProductStockIntakeDatabaseTestState(): ProductStockIntakeDatabaseTestState {
  return {
    ...{
      testUsers: [],
      profileIds: [],
      receiptIds: [],
      containerIds: [],
      idempotencyKeys: [],
    },
    intakeReceiptIds: [],
    intakeMovementIds: [],
  }
}

export async function connectProductStockIntakeTestPg(
  config: ProductStockIntakeDatabaseTestConfig,
): Promise<Client> {
  if (isLocalProductStockIntakeDatabaseTestConfig(config)) {
    return connectLocalProductStockIntakeTestPg(config)
  }

  return connectCreationTestPg(config)
}

export async function ensureProductStockIntakeMigrationsApplied(
  client: Client,
  config?: ProductStockIntakeDatabaseTestConfig | null,
): Promise<boolean> {
  if (config && isLocalProductStockIntakeDatabaseTestConfig(config)) {
    return false
  }

  const creationApplied = await ensureCreationMigrationsApplied(client)
  let applied = creationApplied

  const probe = await client.query(PRODUCT_STOCK_MIGRATION.probeSql)
  if (probe.rows.length === 0) {
    const sql = readFileSync(resolve(MIGRATION_DIR, PRODUCT_STOCK_MIGRATION.file), 'utf8')
    await client.query(sql)
    applied = true
  }

  const outboundProbe = await client.query(PRODUCT_STOCK_OUTBOUND_MIGRATION.probeSql)
  if (outboundProbe.rows.length === 0) {
    const outboundSql = readFileSync(
      resolve(MIGRATION_DIR, PRODUCT_STOCK_OUTBOUND_MIGRATION.file),
      'utf8',
    )
    await client.query(outboundSql)
    applied = true
  }

  return applied
}

export function buildProductStockIntakeRpcParams(
  params: ProductStockIntakeRpcCallParams,
): Record<string, unknown> {
  return {
    p_saved_product_profile_id: params.savedProductProfileId,
    p_base_unit: params.baseUnit,
    p_quantity: params.quantity,
    p_reason: params.reason,
    p_idempotency_key: params.idempotencyKey,
    p_movement_at: params.movementAt ?? null,
    p_source_event_ref: params.sourceEventRef ?? null,
    p_note: params.note ?? null,
  }
}

export async function callProductStockIntakeRpc(
  client: ProductStockIntakeAuthClient,
  params: ProductStockIntakeRpcCallParams,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const rpcParams = buildProductStockIntakeRpcParams(params)

  if (isLocalProductStockIntakeAuthClient(client)) {
    return callLocalProductStockIntakeRpc(client, rpcParams)
  }

  return client.rpc(RECORD_FERTILIZER_PRODUCT_STOCK_INTAKE_RPC, rpcParams)
}

export function extractProductStockIntakeErrorCode(message: string): string | null {
  const match = message.match(/INVENTORY_INTAKE_[A-Z_]+/)
  return match?.[0] ?? null
}

export function parseProductStockIntakeRpcSuccess(payload: unknown): {
  operationId: string
  idempotencyKey: string
  inventoryItemId: string
  movementId: string
  quantityDelta: number
  reason: string
  baseUnit: string
  itemCreated: boolean
  idempotencyReplay: boolean
} {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Intake RPC returned an empty payload.')
  }

  const record = payload as Record<string, unknown>
  return {
    operationId: String(record.operation_id),
    idempotencyKey: String(record.idempotency_key),
    inventoryItemId: String(record.inventory_item_id),
    movementId: String(record.movement_id),
    quantityDelta: Number(record.quantity_delta),
    reason: String(record.reason),
    baseUnit: String(record.base_unit),
    itemCreated: Boolean(record.item_created),
    idempotencyReplay: Boolean(record.idempotency_replay),
  }
}

export interface ProductStockOutboundRpcCallParams {
  inventoryItemId: string
  quantity: number
  reason: 'gift_given' | 'disposed' | 'inventory_correction'
  idempotencyKey: string
  movementAt?: string | null
  note?: string | null
}

export function buildProductStockOutboundRpcParams(
  params: ProductStockOutboundRpcCallParams,
): Record<string, unknown> {
  return {
    p_inventory_item_id: params.inventoryItemId,
    p_quantity: params.quantity,
    p_reason: params.reason,
    p_idempotency_key: params.idempotencyKey,
    p_movement_at: params.movementAt ?? null,
    p_note: params.note ?? null,
  }
}

export async function callProductStockOutboundRpc(
  client: ProductStockIntakeAuthClient,
  params: ProductStockOutboundRpcCallParams,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const rpcParams = buildProductStockOutboundRpcParams(params)

  if (isLocalProductStockIntakeAuthClient(client)) {
    return callLocalProductStockOutboundRpc(client, rpcParams)
  }

  return client.rpc(RECORD_FERTILIZER_PRODUCT_STOCK_OUTBOUND_RPC, rpcParams)
}

export function extractProductStockOutboundErrorCode(message: string): string | null {
  const match = message.match(/INVENTORY_OUTBOUND_[A-Z_]+/)
  return match?.[0] ?? null
}

export function parseProductStockOutboundRpcSuccess(payload: unknown): {
  operationId: string
  idempotencyKey: string
  inventoryItemId: string
  movementId: string
  quantityDelta: number
  reason: string
  movementType: string
  idempotencyReplay: boolean
} {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Outbound RPC returned an empty payload.')
  }

  const record = payload as Record<string, unknown>
  return {
    operationId: String(record.operation_id),
    idempotencyKey: String(record.idempotency_key),
    inventoryItemId: String(record.inventory_item_id),
    movementId: String(record.movement_id),
    quantityDelta: Number(record.quantity_delta),
    reason: String(record.reason),
    movementType: String(record.movement_type),
    idempotencyReplay: Boolean(record.idempotency_replay),
  }
}

export function trackProductStockIntakeResult(
  state: ProductStockIntakeDatabaseTestState,
  result: ReturnType<typeof parseProductStockIntakeRpcSuccess>,
): void {
  state.intakeReceiptIds.push(result.operationId)
  state.idempotencyKeys.push(result.idempotencyKey)
  state.containerIds.push(result.inventoryItemId)
  state.intakeMovementIds.push(result.movementId)
}

export function trackProductStockOutboundResult(
  state: ProductStockIntakeDatabaseTestState,
  result: ReturnType<typeof parseProductStockOutboundRpcSuccess>,
): void {
  state.intakeReceiptIds.push(result.operationId)
  state.idempotencyKeys.push(result.idempotencyKey)
  state.intakeMovementIds.push(result.movementId)
}

export async function withTestReplicationRole(
  client: Client,
  run: () => Promise<void>,
): Promise<void> {
  await client.query('begin')
  try {
    await client.query(`set local session_replication_role = replica`)
    await run()
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }
}

export function createAdminSupabaseClient(
  config: ProductStockIntakeDatabaseTestConfig,
): ProductStockIntakeAdminClient {
  if (isLocalProductStockIntakeDatabaseTestConfig(config)) {
    return createLocalProductStockIntakeAdminClient()
  }

  return createCloudAdminSupabaseClient(config)
}

export async function createProductStockIntakeAuthenticatedClient(
  config: ProductStockIntakeDatabaseTestConfig,
  user: { id: string; email: string; password: string },
): Promise<ProductStockIntakeAuthClient> {
  if (isLocalProductStockIntakeDatabaseTestConfig(config)) {
    return createLocalProductStockIntakeAuthClient(user)
  }

  return createCloudAuthenticatedSupabaseClient(config, user.email, user.password)
}

export async function createCreationDatabaseTestUser(
  admin: ProductStockIntakeAdminClient,
  state: CreationDatabaseTestState,
  label: string,
  password = 'Gk7bDbTest123!',
): Promise<{ id: string; email: string; password: string }> {
  if (isLocalProductStockIntakeAdminClient(admin)) {
    return createLocalProductStockIntakeTestUser(state, label, password)
  }

  return createCloudCreationDatabaseTestUser(admin, state, label, password)
}

export async function reloadPostgrestSchema(
  client: Client,
  config?: ProductStockIntakeDatabaseTestConfig | null,
): Promise<void> {
  if (config && isLocalProductStockIntakeDatabaseTestConfig(config)) {
    await reloadLocalPostgrestSchema(client)
    return
  }

  await reloadCloudPostgrestSchema(client)
}

export async function stopProductStockIntakeDatabaseTestEnvironment(
  config: ProductStockIntakeDatabaseTestConfig | null,
): Promise<void> {
  if (config && isLocalProductStockIntakeDatabaseTestConfig(config)) {
    await stopLocalProductStockIntakePostgres()
  }
}

export async function purgeProductStockIntakeDatabaseTestData(
  client: Client,
  state: ProductStockIntakeDatabaseTestState,
  admin: ProductStockIntakeAdminClient,
): Promise<void> {
  if (isLocalProductStockIntakeAdminClient(admin)) {
    await purgeLocalProductStockIntakeDatabaseTestData(client, state)
    return
  }

  const receiptIds = [...new Set(state.intakeReceiptIds)]
  const containerIds = [...new Set(state.containerIds.filter(Boolean))]
  const profileIds = [...new Set(state.profileIds)]

  await withTestReplicationRole(client, async () => {
    if (receiptIds.length > 0) {
      await client.query(
        `delete from public.fertilizer_product_stock_outbound_receipts where id = any($1::uuid[])`,
        [receiptIds],
      )
      await client.query(
        `delete from public.fertilizer_product_stock_intake_receipts where id = any($1::uuid[])`,
        [receiptIds],
      )
    }

    if (containerIds.length > 0) {
      await client.query(
        `delete from public.fertilizer_stock_movements where container_id = any($1::uuid[])`,
        [containerIds],
      )
      await client.query(
        `delete from public.fertilizer_containers
         where id = any($1::uuid[])
           and stock_kind = 'product_stock'`,
        [containerIds],
      )
    }

    if (profileIds.length > 0) {
      await client.query(
        `delete from public.fertilizer_stock_movements
         where container_id in (
           select id from public.fertilizer_containers
           where saved_product_profile_id = any($1::uuid[])
         )`,
        [profileIds],
      )
      await client.query(
        `delete from public.fertilizer_containers where saved_product_profile_id = any($1::uuid[])`,
        [profileIds],
      )
      await client.query(`delete from public.product_profiles where id = any($1::uuid[])`, [
        profileIds,
      ])
    }
  })

  for (const user of state.testUsers) {
    await admin.auth.admin.deleteUser(user.id)
  }
}

export async function countProductStockArtifacts(
  client: Client,
  options: {
    userId: string
    profileId: string
    idempotencyKey?: string
  },
): Promise<{
  productStockContainers: number
  receipts: number
  movements: number
}> {
  const containers = await client.query(
    `select count(*)::int as count
     from public.fertilizer_containers
     where user_id = $1
       and saved_product_profile_id = $2
       and stock_kind = 'product_stock'
       and archived_at is null`,
    [options.userId, options.profileId],
  )

  const receiptParams: unknown[] = [options.userId]
  let receiptWhere = 'user_id = $1'
  if (options.idempotencyKey) {
    receiptParams.push(options.idempotencyKey)
    receiptWhere += ` and idempotency_key = $${receiptParams.length}`
  }

  const receipts = await client.query(
    `select count(*)::int as count
     from public.fertilizer_product_stock_intake_receipts
     where ${receiptWhere}`,
    receiptParams,
  )

  const movements = await client.query(
    `select count(*)::int as count
     from public.fertilizer_stock_movements fsm
     join public.fertilizer_containers fc on fc.id = fsm.container_id
     where fc.user_id = $1
       and fc.saved_product_profile_id = $2
       and fc.stock_kind = 'product_stock'`,
    [options.userId, options.profileId],
  )

  return {
    productStockContainers: Number(containers.rows[0]?.count ?? 0),
    receipts: Number(receipts.rows[0]?.count ?? 0),
    movements: Number(movements.rows[0]?.count ?? 0),
  }
}

export { insertSavedProductProfileFixture, isLocalProductStockIntakeDatabaseTestConfig }
