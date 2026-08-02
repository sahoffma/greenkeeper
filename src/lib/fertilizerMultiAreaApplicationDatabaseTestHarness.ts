import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Client } from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  normalizeFertilizerMultiAreaApplication,
  type FertilizerMultiAreaApplicationInput,
  type NormalizedFertilizerMultiAreaApplication,
} from './fertilizerMultiAreaApplicationCore'
import {
  connectCreationTestPg,
  createAdminSupabaseClient,
  createAuthenticatedSupabaseClient,
  createCreationDatabaseTestUser,
  createEmptyCreationDatabaseTestState,
  CREATION_DB_DEV_REF,
  ensureCreationMigrationsApplied,
  loadCreationDatabaseTestConfig,
  parseCreationRpcSuccess,
  reloadPostgrestSchema,
  trackCreationResult,
  type CreationDatabaseTestConfig,
} from './fertilizerInventoryCreationDatabaseTestHarness'
import {
  APPLICATION_MIGRATION_FILE,
  computeContainerBalance,
  ensureApplicationMigrationsApplied,
  type ApplicationDatabaseTestState,
} from './fertilizerApplicationDatabaseTestHarness'

export const MULTI_AREA_DB_TEST_PREFIX = 'gk-multi-area-app-db'
export const MULTI_AREA_DB_DEV_REF = CREATION_DB_DEV_REF
export const MULTI_AREA_MIGRATION_FILE = '20250809_fertilizer_multi_area_application_atomic.sql'
export const APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC =
  'apply_fertilizer_inventory_item_to_areas'
export const DELETE_AREA_RPC = 'delete_area'

function readMultiAreaMigrationSql(): string {
  return readFileSync(
    resolve(process.cwd(), 'supabase/migrations', MULTI_AREA_MIGRATION_FILE),
    'utf8',
  )
}

export interface MultiAreaDatabaseTestState extends ApplicationDatabaseTestState {
  batchIds: string[]
  careGroupIds: string[]
}

export interface MultiAreaRpcAreaPayload {
  areaId: string
  areaNameSnapshot: string
  areaSizeSqmSnapshot: number
  applicationAmount: number
  applicationUnit: 'kg' | 'ml'
  ratePerSqm: number
  rateUnit: 'g_per_sqm' | 'ml_per_sqm'
  sortOrder: number
}

export interface MultiAreaRpcCallParams {
  inventoryItemId: string
  savedProductProfileId: string
  applicationMode: 'rate_per_sqm' | 'total_amount_proportional'
  selectionSource: 'manual' | 'care_group'
  careGroupId?: string | null
  confirmedInputValue: number
  confirmedInputUnit: string
  totalApplicationAmount: number
  applicationUnit: 'kg' | 'ml'
  appliedAt: string
  idempotencyKey: string
  areas: readonly MultiAreaRpcAreaPayload[]
  sourceEventRef?: string | null
  note?: string | null
  userId: string
}

export interface MultiAreaRpcAreaResult {
  areaId: string
  activityId: string
  fertilizationDetailId: string
  applicationAmount: number
  applicationUnit: 'kg' | 'ml'
  ratePerSqm: number
  rateUnit: 'g_per_sqm' | 'ml_per_sqm'
  sortOrder: number
}

export interface MultiAreaRpcSuccess {
  applicationBatchId: string
  inventoryItemId: string
  savedProductProfileId: string
  applicationMode: 'rate_per_sqm' | 'total_amount_proportional'
  selectionSource: 'manual' | 'care_group'
  totalApplicationAmount: number
  applicationUnit: 'kg' | 'ml'
  appliedAt: string
  resultingBalance: number
  movementId: string
  idempotentReplay: boolean
  areas: MultiAreaRpcAreaResult[]
}

export function isMultiAreaDatabaseWriteTestsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.ALLOW_SUPABASE_WRITE_TESTS === 'true' &&
    env.RUN_FERTILIZER_MULTI_AREA_APPLICATION_DB_TESTS === '1'
  )
}

export function loadMultiAreaDatabaseTestConfig(): CreationDatabaseTestConfig | null {
  if (!isMultiAreaDatabaseWriteTestsEnabled()) {
    return null
  }

  const config = loadCreationDatabaseTestConfig()
  if (!config) {
    return null
  }

  if (config.projectRef !== MULTI_AREA_DB_DEV_REF) {
    throw new Error(
      `Refusing multi-area DB tests: project ref must be ${MULTI_AREA_DB_DEV_REF}.`,
    )
  }

  return config
}

export function createEmptyMultiAreaDatabaseTestState(): MultiAreaDatabaseTestState {
  return {
    ...createEmptyCreationDatabaseTestState(),
    areaIds: [],
    activityIds: [],
    movementIds: [],
    applicationIdempotencyKeys: [],
    batchIds: [],
    careGroupIds: [],
  }
}

export async function ensureMultiAreaMigrationsApplied(client: Client): Promise<boolean> {
  await ensureApplicationMigrationsApplied(client)
  await client.query(readMultiAreaMigrationSql())
  return true
}

export function buildRpcAreasFromNormalized(
  normalized: NormalizedFertilizerMultiAreaApplication,
): MultiAreaRpcAreaPayload[] {
  return normalized.areaSnapshots.map((snapshot) => ({
    areaId: snapshot.areaId,
    areaNameSnapshot: snapshot.areaNameSnapshot,
    areaSizeSqmSnapshot: snapshot.areaSizeSqmSnapshot,
    applicationAmount: snapshot.applicationAmount,
    applicationUnit: snapshot.applicationUnit,
    ratePerSqm: snapshot.effortRate,
    rateUnit: snapshot.effortRateUnit,
    sortOrder: snapshot.sortOrder,
  }))
}

export function buildNormalizedFromInput(
  input: FertilizerMultiAreaApplicationInput,
): NormalizedFertilizerMultiAreaApplication {
  return normalizeFertilizerMultiAreaApplication(input)
}

export async function insertMultiAreaTestArea(
  client: Client,
  state: MultiAreaDatabaseTestState,
  userId: string,
  nameSuffix: string,
  sizeSqm: number,
): Promise<string> {
  const id = crypto.randomUUID()
  await client.query(
    `insert into public.areas (id, user_id, name, size_sqm, sort_order)
     values ($1, $2, $3, $4, 0)`,
    [id, userId, `${MULTI_AREA_DB_TEST_PREFIX}-area-${nameSuffix}`, sizeSqm],
  )
  state.areaIds.push(id)
  return id
}

export async function insertMultiAreaTestCareGroup(
  client: Client,
  state: MultiAreaDatabaseTestState,
  userId: string,
  areaIds: readonly string[],
): Promise<string> {
  const groupId = crypto.randomUUID()
  await client.query(
    `insert into public.care_groups (id, user_id, name, sort_order)
     values ($1, $2, $3, 0)`,
    [groupId, userId, `${MULTI_AREA_DB_TEST_PREFIX}-group`],
  )
  state.careGroupIds.push(groupId)

  for (const areaId of areaIds) {
    await client.query(
      `insert into public.care_group_areas (care_group_id, area_id)
       values ($1, $2)`,
      [groupId, areaId],
    )
  }

  return groupId
}

export async function callMultiAreaRpc(
  client: SupabaseClient,
  params: MultiAreaRpcCallParams,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const { data, error } = await client.rpc(APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC, {
    p_inventory_item_id: params.inventoryItemId,
    p_saved_product_profile_id: params.savedProductProfileId,
    p_application_mode: params.applicationMode,
    p_selection_source: params.selectionSource,
    p_confirmed_input_value: params.confirmedInputValue,
    p_confirmed_input_unit: params.confirmedInputUnit,
    p_total_application_amount: params.totalApplicationAmount,
    p_application_unit: params.applicationUnit,
    p_applied_at: params.appliedAt,
    p_idempotency_key: params.idempotencyKey,
    p_areas: params.areas,
    p_care_group_id: params.careGroupId ?? null,
    p_source_event_ref: params.sourceEventRef ?? null,
    p_note: params.note ?? null,
    p_user_id: params.userId,
  })

  return {
    data,
    error: error ? { message: error.message } : null,
  }
}

export function parseMultiAreaRpcSuccess(payload: unknown): MultiAreaRpcSuccess {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Multi-area RPC returned an empty payload.')
  }

  const record = payload as Record<string, unknown>
  const areas = Array.isArray(record.areas)
    ? record.areas.map((entry) => {
        const area = entry as Record<string, unknown>
        return {
          areaId: String(area.areaId),
          activityId: String(area.activityId),
          fertilizationDetailId: String(area.fertilizationDetailId ?? area.activityId),
          applicationAmount: Number(area.applicationAmount),
          applicationUnit: area.applicationUnit === 'ml' ? 'ml' : 'kg',
          ratePerSqm: Number(area.ratePerSqm),
          rateUnit: area.rateUnit === 'ml_per_sqm' ? 'ml_per_sqm' : 'g_per_sqm',
          sortOrder: Number(area.sortOrder),
        } satisfies MultiAreaRpcAreaResult
      })
    : []

  return {
    applicationBatchId: String(record.applicationBatchId),
    inventoryItemId: String(record.inventoryItemId),
    savedProductProfileId: String(record.savedProductProfileId),
    applicationMode:
      record.applicationMode === 'total_amount_proportional'
        ? 'total_amount_proportional'
        : 'rate_per_sqm',
    selectionSource: record.selectionSource === 'care_group' ? 'care_group' : 'manual',
    totalApplicationAmount: Number(record.totalApplicationAmount),
    applicationUnit: record.applicationUnit === 'ml' ? 'ml' : 'kg',
    appliedAt: String(record.appliedAt),
    resultingBalance: Number(record.resultingBalance),
    movementId: String(record.movementId),
    idempotentReplay: Boolean(record.idempotentReplay),
    areas,
  }
}

export function extractMultiAreaErrorCode(message: string): string | null {
  const match = message.match(/FERTILIZER_MULTI_AREA_APPLICATION_[A-Z_]+/)
  return match?.[0] ?? null
}

export async function countMultiAreaFailureArtifacts(
  client: Client,
  options: {
    userId: string
    idempotencyKey: string
    inventoryItemId: string
  },
): Promise<{
  batches: number
  activities: number
  fertilizationDetails: number
  movements: number
}> {
  const batches = await client.query(
    `select count(*)::int as count
     from public.fertilizer_application_batches
     where user_id = $1 and idempotency_key = $2`,
    [options.userId, options.idempotencyKey],
  )
  const activities = await client.query(
    `select count(*)::int as count
     from public.activities act
     join public.fertilizer_application_batches b on b.user_id = act.user_id
     join public.fertilization_details fd on fd.activity_id = act.id and fd.application_batch_id = b.id
     where b.user_id = $1 and b.idempotency_key = $2`,
    [options.userId, options.idempotencyKey],
  )
  const details = await client.query(
    `select count(*)::int as count
     from public.fertilization_details fd
     join public.fertilizer_application_batches b on b.id = fd.application_batch_id
     where b.user_id = $1 and b.idempotency_key = $2`,
    [options.userId, options.idempotencyKey],
  )
  const movements = await client.query(
    `select count(*)::int as count
     from public.fertilizer_stock_movements m
     join public.fertilizer_application_batches b on b.movement_id = m.id
     where b.user_id = $1 and b.idempotency_key = $2`,
    [options.userId, options.idempotencyKey],
  )

  return {
    batches: Number(batches.rows[0]?.count ?? 0),
    activities: Number(activities.rows[0]?.count ?? 0),
    fertilizationDetails: Number(details.rows[0]?.count ?? 0),
    movements: Number(movements.rows[0]?.count ?? 0),
  }
}

export async function deleteAreaForMultiAreaTest(
  client: Client,
  areaId: string,
): Promise<void> {
  await client.query(`select public.delete_area($1::uuid)`, [areaId])
}

export async function purgeMultiAreaDatabaseTestData(
  client: Client,
  state: MultiAreaDatabaseTestState,
  admin: SupabaseClient,
  options: { deleteUsers?: boolean } = {},
): Promise<void> {
  const areaIds = [...new Set(state.areaIds)]

  for (const areaId of areaIds) {
    await deleteAreaForMultiAreaTest(client, areaId)
  }

  if (options.deleteUsers !== false) {
    for (const user of state.testUsers) {
      await admin.auth.admin.deleteUser(user.id).catch(() => undefined)
    }
    state.testUsers = []
  }

  state.areaIds = []
  state.activityIds = []
  state.movementIds = []
  state.applicationIdempotencyKeys = []
  state.batchIds = []
  state.careGroupIds = []
}

export async function createInventoryItemForMultiAreaTest(
  client: Client,
  state: MultiAreaDatabaseTestState,
  auth: SupabaseClient,
  user: { id: string; email: string; password: string },
  options: {
    initialQuantity: number
    unit: 'kg' | 'ml'
    idempotencyKey: string
  },
): Promise<{ profileId: string; itemId: string }> {
  const { insertSavedProductProfileFixture } = await import(
    './fertilizerInventoryCreationDatabaseTestHarness'
  )
  const profile = await insertSavedProductProfileFixture(client, state, {
    accessKind: 'authenticated_user',
    userId: user.id,
    sessionAccessHash: null,
    productForm: options.unit === 'kg' ? 'granular' : 'liquid',
  })

  const { data, error } = await auth.rpc('create_fertilizer_inventory_core_from_confirmed_packages', {
    p_saved_product_profile_id: profile.id,
    p_access_kind: 'authenticated_user',
    p_user_id: user.id,
    p_session_access_hash: null,
    p_creation_reason: 'initial_stock',
    p_idempotency_key: options.idempotencyKey,
    p_source_event_ref: `${MULTI_AREA_DB_TEST_PREFIX}:create`,
    p_packages: [
      {
        sequence_index: 0,
        package_size_value: options.initialQuantity,
        package_size_unit: options.unit,
        initial_quantity_value: options.initialQuantity,
        initial_quantity_unit: options.unit,
        client_correlation_id: `${MULTI_AREA_DB_TEST_PREFIX}-pkg`,
      },
    ],
  })

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

export {
  connectCreationTestPg as connectMultiAreaTestPg,
  createAdminSupabaseClient,
  createAuthenticatedSupabaseClient,
  createCreationDatabaseTestUser,
  computeContainerBalance,
  reloadPostgrestSchema,
  parseCreationRpcSuccess,
  trackCreationResult,
  ensureCreationMigrationsApplied,
  APPLICATION_MIGRATION_FILE,
}
