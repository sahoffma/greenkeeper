import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Client } from 'pg'
import type { LegacyContainerMigrationUpgradePlan } from './fertilizerInventoryLegacyMigrationCore'
import {
  CREATION_DB_DEV_REF,
  connectCreationTestPg,
  createAdminSupabaseClient,
  createAuthenticatedSupabaseClient,
  createCreationDatabaseTestUser,
  ensureCreationMigrationsApplied,
  insertSavedProductProfileFixture,
  reloadPostgrestSchema,
  resolveCreationDatabaseTestConfig,
  type CreationDatabaseTestConfig,
} from './fertilizerInventoryCreationDatabaseTestHarness'

export const LEGACY_MIGRATION_DB_TEST_PREFIX = 'gk-legacy-mig-db'
export const UPGRADE_FERTILIZER_LEGACY_CONTAINER_TO_INVENTORY_CORE_RPC =
  'upgrade_fertilizer_legacy_container_to_inventory_core'

const LEGACY_MIGRATION_FILE = '20250807_fertilizer_inventory_legacy_core_upgrade.sql'
const MIGRATION_DIR = resolve(process.cwd(), 'supabase/migrations')

export interface LegacyMigrationDatabaseTestState {
  testUsers: Array<{ id: string; email: string; password: string; label: string }>
  profileIds: string[]
  productIds: string[]
  candidateIds: string[]
  containerIds: string[]
  movementIds: string[]
  receiptIds: string[]
  migrationKeys: string[]
  idempotencyKeys: string[]
}

export interface LegacyContainerFixture {
  containerId: string
  userId: string
  productId: string | null
  candidateId: string | null
  packageSizeValue: number
  packageSizeUnit: string
  movements: Array<{
    movementId: string
    movementType: string
    quantityDelta: number
    unit: string
    movementDate?: string
    captureIdempotencyKey?: string | null
    note?: string | null
  }>
}

export function isLegacyMigrationDatabaseWriteTestsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    env.ALLOW_SUPABASE_WRITE_TESTS === 'true' &&
    env.RUN_FERTILIZER_LEGACY_MIGRATION_DB_TESTS === '1'
  )
}

export function loadLegacyMigrationDatabaseTestConfig(): CreationDatabaseTestConfig | null {
  if (!isLegacyMigrationDatabaseWriteTestsEnabled()) {
    return null
  }

  try {
    return resolveCreationDatabaseTestConfig(
      Object.fromEntries(
        readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
          .split('\n')
          .filter((line) => line && !line.startsWith('#'))
          .map((line) => {
            const index = line.indexOf('=')
            return [line.slice(0, index), line.slice(index + 1)]
          }),
      ),
    )
  } catch {
    return null
  }
}

export function createEmptyLegacyMigrationDatabaseTestState(): LegacyMigrationDatabaseTestState {
  return {
    testUsers: [],
    profileIds: [],
    productIds: [],
    candidateIds: [],
    containerIds: [],
    movementIds: [],
    receiptIds: [],
    migrationKeys: [],
    idempotencyKeys: [],
  }
}

export async function ensureLegacyMigrationApplied(client: Client): Promise<boolean> {
  const appliedCore = await ensureCreationMigrationsApplied(client)
  const probe = await client.query(
    `select 1 from information_schema.tables
     where table_schema = 'public'
       and table_name = 'fertilizer_inventory_migration_receipts'`,
  )

  if (probe.rows.length > 0) {
    return appliedCore
  }

  const sql = readFileSync(resolve(MIGRATION_DIR, LEGACY_MIGRATION_FILE), 'utf8')
  await client.query(sql)
  return true
}

export function computeLegacyMigrationPayloadFingerprint(canonicalPayload: string): string {
  return createHash('sha256').update(canonicalPayload, 'utf8').digest('hex')
}

export function buildUpgradeRpcParams(plan: LegacyContainerMigrationUpgradePlan): Record<string, unknown> {
  return {
    p_container_id: plan.containerId,
    p_saved_product_profile_id: plan.savedProductProfileId,
    p_access_kind: plan.accessKind,
    p_user_id: plan.userId,
    p_session_access_hash: plan.sessionAccessHash,
    p_package_size_value: plan.packageSizeValue,
    p_package_size_unit: plan.packageSizeUnit,
    p_base_unit: plan.baseUnit,
    p_creation_reason: plan.creationReason,
    p_migration_key: plan.migrationIdempotencyKey,
    p_payload_fingerprint: computeLegacyMigrationPayloadFingerprint(plan.canonicalFingerprintInput),
    p_canonical_payload: plan.canonicalFingerprintInput,
    p_source_event_ref: plan.sourceEventRef,
    p_movement_upgrades: plan.movementUpgrades.map((movement) => ({
      movement_id: movement.movementId,
      movement_at: movement.movementAt,
      inventory_idempotency_key: movement.inventoryIdempotencyKey,
      source_event_ref: movement.sourceEventRef,
      movement_origin: movement.movementOrigin,
    })),
  }
}

export async function callLegacyUpgradeRpc(
  client: SupabaseClient,
  plan: LegacyContainerMigrationUpgradePlan,
): Promise<{ data: unknown; error: { message: string } | null }> {
  return client.rpc(UPGRADE_FERTILIZER_LEGACY_CONTAINER_TO_INVENTORY_CORE_RPC, buildUpgradeRpcParams(plan))
}

export function extractLegacyMigrationErrorCode(message: string): string | null {
  const codes = [
    'NOT_AUTHENTICATED',
    'FOREIGN_OR_MISSING_CONTAINER',
    'MIGRATION_RECEIPT_FINGERPRINT_MISMATCH',
    'CORE_BINDING_ALREADY_COMPLETE',
    'LEGACY_AND_CORE_BINDING_CONFLICT',
    'INVALID_ACCESS_BINDING',
    'FOREIGN_OR_MISSING_SAVED_PROFILE',
    'INVALID_SAVED_PROFILE_STATUS',
    'INVALID_SAVED_PROFILE_SOURCE',
    'UNKNOWN_PRODUCT_FORM',
    'UNSUPPORTED_PACKAGE_UNIT',
    'INVALID_PACKAGE_VALUE',
    'EXCESSIVE_PACKAGE_PRECISION',
    'CONFLICTING_MOVEMENT_UNITS',
    'INVALID_MOVEMENT',
    'NEGATIVE_BALANCE',
    'AMBIGUOUS_CREATION_REASON',
    'AGGREGATED_LEGACY_CONTAINER',
  ]

  return codes.find((code) => message.includes(code)) ?? null
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function insertLegacyCatalogProductFixture(
  client: Client,
  state: LegacyMigrationDatabaseTestState,
): Promise<string> {
  const suffix = uniqueSuffix()
  const { rows } = await client.query(
    `insert into public.products (manufacturer, official_name, aliases, product_form)
     values ($1, $2, '{}'::text[], 'granular')
     returning id`,
    [`${LEGACY_MIGRATION_DB_TEST_PREFIX}-mfg`, `${LEGACY_MIGRATION_DB_TEST_PREFIX}-product-${suffix}`],
  )
  const productId = rows[0].id as string
  state.productIds.push(productId)
  return productId
}

export async function insertLegacyContainerFixture(
  client: Client,
  state: LegacyMigrationDatabaseTestState,
  options: {
    userId: string
    productId?: string | null
    candidateId?: string | null
    packageSizeValue: number
    packageSizeUnit: string
    label?: string
    movements: Array<{
      movementType: string
      quantityDelta: number
      unit: string
      movementDate?: string
      captureIdempotencyKey?: string | null
      note?: string | null
    }>
  },
): Promise<LegacyContainerFixture> {
  const containerId = crypto.randomUUID()
  await client.query(
    `insert into public.fertilizer_containers (
      id, user_id, product_id, recognition_candidate_id,
      package_size_value, package_size_unit, label
    ) values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      containerId,
      options.userId,
      options.productId ?? null,
      options.candidateId ?? null,
      options.packageSizeValue,
      options.packageSizeUnit,
      options.label ?? `${LEGACY_MIGRATION_DB_TEST_PREFIX}-container`,
    ],
  )

  state.containerIds.push(containerId)

  const movements: LegacyContainerFixture['movements'] = []

  for (const movement of options.movements) {
    const movementId = crypto.randomUUID()
    await client.query(
      `insert into public.fertilizer_stock_movements (
        id, user_id, container_id, movement_type, movement_origin,
        quantity_delta, unit, movement_date, capture_idempotency_key, note
      ) values ($1, $2, $3, $4::public.fertilizer_movement_type, 'manual', $5, $6, $7, $8, $9)`,
      [
        movementId,
        options.userId,
        containerId,
        movement.movementType,
        movement.quantityDelta,
        movement.unit,
        movement.movementDate ?? '2026-07-31',
        movement.captureIdempotencyKey ?? null,
        movement.note ?? null,
      ],
    )
    state.movementIds.push(movementId)
    movements.push({
      movementId,
      movementType: movement.movementType,
      quantityDelta: movement.quantityDelta,
      unit: movement.unit,
      movementDate: movement.movementDate,
      captureIdempotencyKey: movement.captureIdempotencyKey ?? null,
      note: movement.note ?? null,
    })
  }

  return {
    containerId,
    userId: options.userId,
    productId: options.productId ?? null,
    candidateId: options.candidateId ?? null,
    packageSizeValue: options.packageSizeValue,
    packageSizeUnit: options.packageSizeUnit,
    movements,
  }
}

export async function fetchContainerBalance(client: Client, containerId: string): Promise<number> {
  const { rows } = await client.query(
    `select coalesce(sum(quantity_delta), 0)::numeric as balance
     from public.fertilizer_stock_movements
     where container_id = $1`,
    [containerId],
  )
  return Number(rows[0]?.balance ?? 0)
}

export async function fetchContainerRow(client: Client, containerId: string) {
  const { rows } = await client.query(`select * from public.fertilizer_containers where id = $1`, [
    containerId,
  ])
  return rows[0] as Record<string, unknown> | undefined
}

export async function fetchMovementsForContainer(client: Client, containerId: string) {
  const { rows } = await client.query(
    `select * from public.fertilizer_stock_movements where container_id = $1 order by created_at asc`,
    [containerId],
  )
  return rows as Array<Record<string, unknown>>
}

export async function countLegacyMigrationArtifacts(
  client: Client,
  options: { containerId?: string; migrationKey?: string },
): Promise<{ receipts: number; containers: number; movements: number }> {
  const receiptParams: unknown[] = []
  let receiptWhere = '1=1'
  if (options.containerId) {
    receiptParams.push(options.containerId)
    receiptWhere += ` and legacy_container_id = $${receiptParams.length}`
  }
  if (options.migrationKey) {
    receiptParams.push(options.migrationKey)
    receiptWhere += ` and migration_key = $${receiptParams.length}`
  }

  const receipts = await client.query(
    `select count(*)::int as count from public.fertilizer_inventory_migration_receipts where ${receiptWhere}`,
    receiptParams,
  )

  const containerParams: unknown[] = []
  let containerWhere = '1=1'
  if (options.containerId) {
    containerParams.push(options.containerId)
    containerWhere += ` and id = $${containerParams.length}`
  }

  const containers = await client.query(
    `select count(*)::int as count from public.fertilizer_containers where ${containerWhere}`,
    containerParams,
  )

  const movementParams: unknown[] = []
  let movementWhere = '1=1'
  if (options.containerId) {
    movementParams.push(options.containerId)
    movementWhere += ` and container_id = $${movementParams.length}`
  }

  const movements = await client.query(
    `select count(*)::int as count from public.fertilizer_stock_movements where ${movementWhere}`,
    movementParams,
  )

  return {
    receipts: Number(receipts.rows[0]?.count ?? 0),
    containers: Number(containers.rows[0]?.count ?? 0),
    movements: Number(movements.rows[0]?.count ?? 0),
  }
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

export async function purgeLegacyMigrationDatabaseTestData(
  client: Client,
  state: LegacyMigrationDatabaseTestState,
  admin: SupabaseClient,
): Promise<void> {
  const containerIds = [...new Set(state.containerIds)]
  const profileIds = [...new Set(state.profileIds)]
  const productIds = [...new Set(state.productIds)]
  const candidateIds = [...new Set(state.candidateIds)]
  const migrationKeys = [...new Set(state.migrationKeys)]

  await withTestReplicationRole(client, async () => {
    if (migrationKeys.length > 0) {
      await client.query(
        `delete from public.fertilizer_inventory_migration_receipts where migration_key = any($1::text[])`,
        [migrationKeys],
      )
    }

    if (containerIds.length > 0) {
      await client.query(
        `delete from public.fertilizer_inventory_migration_receipts where legacy_container_id = any($1::uuid[])`,
        [containerIds],
      )
      await client.query(
        `delete from public.fertilizer_stock_movements where container_id = any($1::uuid[])`,
        [containerIds],
      )
      await client.query(`delete from public.fertilizer_containers where id = any($1::uuid[])`, [
        containerIds,
      ])
    }

    if (candidateIds.length > 0) {
      await client.query(
        `delete from public.fertilizer_recognition_candidates where id = any($1::uuid[])`,
        [candidateIds],
      )
    }

    if (profileIds.length > 0) {
      await client.query(`delete from public.product_profiles where id = any($1::uuid[])`, [
        profileIds,
      ])
    }

    if (productIds.length > 0) {
      await client.query(`delete from public.products where id = any($1::uuid[])`, [productIds])
    }
  })

  for (const user of state.testUsers) {
    await admin.auth.admin.deleteUser(user.id)
  }

  state.testUsers = []
  state.profileIds = []
  state.productIds = []
  state.candidateIds = []
  state.containerIds = []
  state.movementIds = []
  state.receiptIds = []
  state.migrationKeys = []
  state.idempotencyKeys = []
}

export {
  connectCreationTestPg as connectLegacyMigrationTestPg,
  createAdminSupabaseClient,
  createAuthenticatedSupabaseClient,
  createCreationDatabaseTestUser as createLegacyMigrationDatabaseTestUser,
  insertSavedProductProfileFixture,
  reloadPostgrestSchema,
  CREATION_DB_DEV_REF,
}
