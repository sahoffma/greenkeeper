import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Client } from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import { APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREA_RPC } from './fertilizerApplicationCore'
import {
  connectCreationTestPg,
  createAdminSupabaseClient,
  createAuthenticatedSupabaseClient,
  createCreationDatabaseTestUser,
  createEmptyCreationDatabaseTestState,
  CREATION_DB_DEV_REF,
  CREATION_DB_TEST_PREFIX,
  ensureCreationMigrationsApplied,
  insertSavedProductProfileFixture,
  loadCreationDatabaseTestConfig,
  parseCreationRpcSuccess,
  reloadPostgrestSchema,
  trackCreationResult,
  type CreationDatabaseTestConfig,
  type CreationDatabaseTestState,
} from './fertilizerInventoryCreationDatabaseTestHarness'

export const APPLICATION_DB_TEST_PREFIX = `${CREATION_DB_TEST_PREFIX}-app`
export const APPLICATION_MIGRATION_FILE = '20250808_fertilizer_application_atomic.sql'

export interface ApplicationDatabaseTestState extends CreationDatabaseTestState {
  areaIds: string[]
  activityIds: string[]
  movementIds: string[]
  applicationIdempotencyKeys: string[]
}

export interface ApplicationRpcCallParams {
  inventoryItemId: string
  savedProductProfileId: string
  areaId: string
  applicationAmount: number
  applicationUnit: 'kg' | 'ml'
  appliedAt: string
  idempotencyKey: string
  sourceEventRef?: string | null
  note?: string | null
  userId: string
}

export interface ApplicationRpcSuccess {
  activityId: string
  movementId: string
  inventoryItemId: string
  savedProductProfileId: string
  targetKind: 'area'
  targetId: string
  applicationAmount: number
  applicationUnit: 'kg' | 'ml'
  appliedAt: string
  resultingBalance: number
  idempotentReplay: boolean
}

export function isApplicationDatabaseWriteTestsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.ALLOW_SUPABASE_WRITE_TESTS === 'true' &&
    env.RUN_FERTILIZER_APPLICATION_DB_TESTS === '1'
  )
}

export function loadApplicationDatabaseTestConfig(): CreationDatabaseTestConfig | null {
  if (!isApplicationDatabaseWriteTestsEnabled()) {
    return null
  }

  return loadCreationDatabaseTestConfig()
}

export function createEmptyApplicationDatabaseTestState(): ApplicationDatabaseTestState {
  return {
    ...createEmptyCreationDatabaseTestState(),
    areaIds: [],
    activityIds: [],
    movementIds: [],
    applicationIdempotencyKeys: [],
  }
}

export async function ensureApplicationMigrationsApplied(client: Client): Promise<boolean> {
  const creationApplied = await ensureCreationMigrationsApplied(client)
  const probe = await client.query(
    `select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'fertilizer_application_receipts'`,
  )

  if (probe.rows.length > 0) {
    return creationApplied
  }

  const sql = readFileSync(
    resolve(process.cwd(), 'supabase/migrations', APPLICATION_MIGRATION_FILE),
    'utf8',
  )
  await client.query(sql)
  return true
}

export async function insertApplicationTestArea(
  client: Client,
  state: ApplicationDatabaseTestState,
  userId: string,
  nameSuffix: string,
): Promise<string> {
  const id = crypto.randomUUID()
  await client.query(
    `insert into public.areas (id, user_id, name, sort_order)
     values ($1, $2, $3, 0)`,
    [id, userId, `${APPLICATION_DB_TEST_PREFIX}-area-${nameSuffix}`],
  )
  state.areaIds.push(id)
  return id
}

export async function createInventoryItemForApplication(
  config: CreationDatabaseTestConfig,
  client: Client,
  state: ApplicationDatabaseTestState,
  user: { id: string; email: string; password: string },
  options: {
    initialQuantity: number
    unit: 'kg' | 'ml'
    idempotencyKey: string
  },
): Promise<{ profileId: string; itemId: string }> {
  const profile = await insertSavedProductProfileFixture(client, state, {
    accessKind: 'authenticated_user',
    userId: user.id,
    sessionAccessHash: null,
    productForm: options.unit === 'kg' ? 'granular' : 'liquid',
  })

  const authClient = await createAuthenticatedSupabaseClient(config, user.email, user.password)

  const { data, error } = await authClient.rpc(
    'create_fertilizer_inventory_core_from_confirmed_packages',
    {
      p_saved_product_profile_id: profile.id,
      p_access_kind: 'authenticated_user',
      p_user_id: user.id,
      p_session_access_hash: null,
      p_creation_reason: 'initial_stock',
      p_idempotency_key: options.idempotencyKey,
      p_source_event_ref: `${APPLICATION_DB_TEST_PREFIX}:create`,
      p_packages: [
        {
          sequence_index: 0,
          package_size_value: options.initialQuantity,
          package_size_unit: options.unit,
          initial_quantity_value: options.initialQuantity,
          initial_quantity_unit: options.unit,
          client_correlation_id: `${APPLICATION_DB_TEST_PREFIX}-pkg`,
        },
      ],
    },
  )

  if (error) {
    throw new Error(`Inventory creation failed: ${error.message}`)
  }

  const parsed = parseCreationRpcSuccess(data)
  trackCreationResult(state, parsed)
  return {
    profileId: profile.id,
    itemId: parsed.packages[0]!.itemId,
  }
}

export async function callApplicationRpc(
  client: SupabaseClient,
  params: ApplicationRpcCallParams,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const { data, error } = await client.rpc(APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREA_RPC, {
    p_inventory_item_id: params.inventoryItemId,
    p_saved_product_profile_id: params.savedProductProfileId,
    p_area_id: params.areaId,
    p_application_amount: params.applicationAmount,
    p_application_unit: params.applicationUnit,
    p_applied_at: params.appliedAt,
    p_idempotency_key: params.idempotencyKey,
    p_source_event_ref: params.sourceEventRef ?? null,
    p_note: params.note ?? null,
    p_user_id: params.userId,
  })

  return {
    data,
    error: error ? { message: error.message } : null,
  }
}

export function parseApplicationRpcSuccess(payload: unknown): ApplicationRpcSuccess {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Application RPC returned an empty payload.')
  }

  const record = payload as Record<string, unknown>
  return {
    activityId: String(record.activityId),
    movementId: String(record.movementId),
    inventoryItemId: String(record.inventoryItemId),
    savedProductProfileId: String(record.savedProductProfileId),
    targetKind: 'area',
    targetId: String(record.targetId),
    applicationAmount: Number(record.applicationAmount),
    applicationUnit: record.applicationUnit === 'ml' ? 'ml' : 'kg',
    appliedAt: String(record.appliedAt),
    resultingBalance: Number(record.resultingBalance),
    idempotentReplay: Boolean(record.idempotentReplay),
  }
}

export function extractApplicationErrorCode(message: string): string | null {
  const match = message.match(/FERTILIZER_APPLICATION_[A-Z_]+/)
  return match?.[0] ?? null
}

export async function computeContainerBalance(
  client: Client,
  containerId: string,
): Promise<number> {
  const { rows } = await client.query(
    `select coalesce(sum(quantity_delta), 0)::numeric as balance
     from public.fertilizer_stock_movements
     where container_id = $1 and movement_at is not null`,
    [containerId],
  )
  return Number(rows[0]?.balance ?? 0)
}

async function withTestReplicationRole(client: Client, run: () => Promise<void>): Promise<void> {
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

export async function purgeApplicationDatabaseTestData(
  client: Client,
  state: ApplicationDatabaseTestState,
  admin: SupabaseClient,
): Promise<void> {
  const activityIds = [...new Set(state.activityIds)]
  const movementIds = [...new Set(state.movementIds)]
  const areaIds = [...new Set(state.areaIds)]

  await withTestReplicationRole(client, async () => {
    if (movementIds.length > 0) {
      await client.query(`delete from public.fertilizer_stock_movements where id = any($1::uuid[])`, [
        movementIds,
      ])
    }

    if (activityIds.length > 0) {
      await client.query(`delete from public.fertilization_details where activity_id = any($1::uuid[])`, [
        activityIds,
      ])
      await client.query(`delete from public.activities where id = any($1::uuid[])`, [activityIds])
    }

    await client.query(
      `delete from public.fertilizer_application_receipts
       where idempotency_key like $1 or user_id = any($2::uuid[])`,
      [
        `${APPLICATION_DB_TEST_PREFIX}%`,
        state.testUsers.map((entry) => entry.id),
      ],
    )

    if (areaIds.length > 0) {
      await client.query(`delete from public.areas where id = any($1::uuid[])`, [areaIds])
    }
  })

  const creationState: CreationDatabaseTestState = state
  const { purgeCreationDatabaseTestData } = await import(
    './fertilizerInventoryCreationDatabaseTestHarness'
  )
  await purgeCreationDatabaseTestData(client, creationState, admin)

  for (const user of state.testUsers) {
    await admin.auth.admin.deleteUser(user.id).catch(() => undefined)
  }

  state.testUsers = []
  state.areaIds = []
  state.activityIds = []
  state.movementIds = []
  state.applicationIdempotencyKeys = []
}

export {
  connectCreationTestPg as connectApplicationTestPg,
  createAdminSupabaseClient,
  createAuthenticatedSupabaseClient,
  createCreationDatabaseTestUser,
  reloadPostgrestSchema,
  CREATION_DB_DEV_REF,
}
