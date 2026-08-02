import { createHash } from 'node:crypto'
import type { Client } from 'pg'
import {
  insertDraftProductProfileFixture,
  type CreationDatabaseTestState,
} from './fertilizerInventoryCreationDatabaseTestHarness'
import {
  connectLocalProductStockIntakeTestPg,
  createLocalProductStockIntakeAuthClient,
  createLocalProductStockIntakeTestUser,
  isLocalProductStockIntakeAuthClient,
  loadLocalProductStockIntakeDatabaseTestConfig,
  type LocalProductStockIntakeAuthClient,
  type LocalProductStockIntakeDatabaseTestConfig,
} from './fertilizerProductStockIntakeLocalPostgresHarness'
import {
  ANALYZE_FERTILIZER_PRODUCT_STOCK_LEGACY_MIGRATION_RPC,
  MIGRATE_FERTILIZER_PRODUCT_STOCK_LEGACY_GROUP_RPC,
  type LegacyMigrationGroupAnalysis,
  type MigrateLegacyGroupRpcParams,
} from './fertilizerProductStockLegacyMigrationRpcCore'

export const LEGACY_MIGRATION_DB_TEST_PREFIX = 'gk-ps-legacy-mig'

export interface LegacyMigrationDatabaseTestState extends CreationDatabaseTestState {
  migrationReceiptIds: string[]
  legacyContainerIds: string[]
  canonicalContainerIds: string[]
  movementIds: string[]
  areaIds: string[]
  applicationIdempotencyKeys: string[]
}

export interface LegacyMigrationApplicationAreaPayload {
  areaId: string
  areaNameSnapshot: string
  areaSizeSqmSnapshot: number
  applicationAmount: number
  applicationUnit: 'kg' | 'ml'
  ratePerSqm: number
  rateUnit: 'g_per_sqm' | 'ml_per_sqm'
  sortOrder: number
}

export interface LegacyMigrationApplicationArtifactCounts {
  batches: number
  activities: number
  fertilizationDetails: number
  movements: number
}

export function loadLegacyMigrationDatabaseTestConfig(): LocalProductStockIntakeDatabaseTestConfig | null {
  return loadLocalProductStockIntakeDatabaseTestConfig()
}

export function createEmptyLegacyMigrationDatabaseTestState(): LegacyMigrationDatabaseTestState {
  return {
    testUsers: [],
    profileIds: [],
    receiptIds: [],
    containerIds: [],
    idempotencyKeys: [],
    migrationReceiptIds: [],
    legacyContainerIds: [],
    canonicalContainerIds: [],
    movementIds: [],
    areaIds: [],
    applicationIdempotencyKeys: [],
  }
}

export async function connectLegacyMigrationTestPg(
  config: LocalProductStockIntakeDatabaseTestConfig,
): Promise<Client> {
  return connectLocalProductStockIntakeTestPg(config)
}

export async function createLegacyMigrationTestUser(
  state: LegacyMigrationDatabaseTestState,
  label: string,
): Promise<{ id: string; email: string; password: string }> {
  return createLocalProductStockIntakeTestUser(state, label)
}

export async function createLegacyMigrationAuthClient(
  user: { id: string },
): Promise<LocalProductStockIntakeAuthClient> {
  return createLocalProductStockIntakeAuthClient(user)
}

export async function insertLegacyContainerFixture(
  client: Client,
  state: LegacyMigrationDatabaseTestState,
  options: {
    userId: string
    savedProductProfileId: string
    baseUnit: 'kg' | 'ml'
    packageSizeValue?: number
    packageSizeUnit?: 'kg' | 'ml'
    stockKind?: 'legacy_container' | null
    archivedAt?: string | null
    supersededByContainerId?: string | null
  },
): Promise<string> {
  const id = crypto.randomUUID()
  const packageSizeValue = options.packageSizeValue ?? 10
  const packageSizeUnit = options.packageSizeUnit ?? options.baseUnit

  await client.query(
    `insert into public.fertilizer_containers (
      id, user_id, saved_product_profile_id, access_kind, base_unit,
      package_size_value, package_size_unit, stock_kind, archived_at, superseded_by_container_id
    ) values (
      $1, $2, $3, 'authenticated_user', $4,
      $5, $6, $7, $8, $9
    )`,
    [
      id,
      options.userId,
      options.savedProductProfileId,
      options.baseUnit,
      packageSizeValue,
      packageSizeUnit,
      options.stockKind ?? null,
      options.archivedAt ?? null,
      options.supersededByContainerId ?? null,
    ],
  )

  state.legacyContainerIds.push(id)
  state.containerIds.push(id)
  return id
}

export async function insertLegacyContainerBypassingProfileValidation(
  client: Client,
  state: LegacyMigrationDatabaseTestState,
  options: {
    userId: string
    savedProductProfileId: string
    baseUnit: 'kg' | 'ml'
  },
): Promise<string> {
  const id = crypto.randomUUID()

  await client.query('begin')
  try {
    await client.query(`set local session_replication_role = replica`)
    await client.query(
      `insert into public.fertilizer_containers (
        id, user_id, saved_product_profile_id, access_kind, base_unit,
        package_size_value, package_size_unit
      ) values (
        $1, $2, $3, 'authenticated_user', $4, 10, $4
      )`,
      [id, options.userId, options.savedProductProfileId, options.baseUnit],
    )
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }

  state.legacyContainerIds.push(id)
  state.containerIds.push(id)
  return id
}

export async function insertCanonicalProductStockFixture(
  client: Client,
  state: LegacyMigrationDatabaseTestState,
  options: {
    userId: string
    savedProductProfileId: string
    baseUnit: 'kg' | 'ml'
  },
): Promise<string> {
  const id = crypto.randomUUID()

  await client.query(
    `insert into public.fertilizer_containers (
      id, user_id, saved_product_profile_id, access_kind, base_unit, stock_kind
    ) values ($1, $2, $3, 'authenticated_user', $4, 'product_stock')`,
    [id, options.userId, options.savedProductProfileId, options.baseUnit],
  )

  state.canonicalContainerIds.push(id)
  state.containerIds.push(id)
  return id
}

export async function insertLegacyMovementFixture(
  client: Client,
  state: LegacyMigrationDatabaseTestState,
  options: {
    containerId: string
    userId: string
    quantityDelta: number
    unit: 'kg' | 'ml'
    movementType?: string
    movementAt?: string | null
  },
): Promise<string> {
  const id = crypto.randomUUID()
  const movementAt = options.movementAt === undefined ? new Date().toISOString() : options.movementAt

  await client.query(
    `insert into public.fertilizer_stock_movements (
      id, container_id, user_id, access_kind, quantity_delta, unit,
      movement_type, movement_origin, movement_at, movement_date
    ) values (
      $1, $2, $3, 'authenticated_user', $4, $5,
      $6::public.fertilizer_movement_type, 'manual', $7::timestamptz,
      case when $7::timestamptz is null then null else ($7::timestamptz at time zone 'UTC')::date end
    )`,
    [
      id,
      options.containerId,
      options.userId,
      options.quantityDelta,
      options.unit,
      options.movementType ?? 'purchase',
      movementAt,
    ],
  )

  state.movementIds.push(id)
  return id
}

export async function callAnalyzeLegacyMigrationRpc(
  authClient: LocalProductStockIntakeAuthClient,
  migrationCutoffAt?: string | null,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const client = await authClient.pool.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authClient.userId])
    const { rows } = await client.query(
      `select public.${ANALYZE_FERTILIZER_PRODUCT_STOCK_LEGACY_MIGRATION_RPC}($1::timestamptz) as result`,
      [migrationCutoffAt ?? null],
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

export async function callMigrateLegacyGroupRpc(
  authClient: LocalProductStockIntakeAuthClient,
  params: MigrateLegacyGroupRpcParams,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const client = await authClient.pool.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authClient.userId])
    const { rows } = await client.query(
      `select public.${MIGRATE_FERTILIZER_PRODUCT_STOCK_LEGACY_GROUP_RPC}(
        $1::uuid, $2::text, $3::text, $4::text, $5::timestamptz, $6::uuid[]
      ) as result`,
      [
        params.p_saved_product_profile_id,
        params.p_base_unit,
        params.p_idempotency_key,
        params.p_payload_fingerprint,
        params.p_migration_cutoff_at,
        params.p_legacy_container_ids ?? null,
      ],
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

export async function computeLegacyMigrationFingerprint(
  client: Client,
  group: LegacyMigrationGroupAnalysis,
  migrationCutoffAt: string,
): Promise<string> {
  const legacyIds = [...group.legacyContainerIds].sort()
  const { rows: movementRows } = await client.query(
    `select public._product_stock_legacy_migration_effective_movement_ids($1::uuid[], $2::timestamptz) as ids`,
    [legacyIds, migrationCutoffAt],
  )
  const movementIds = (movementRows[0]?.ids as string[]) ?? []

  const { rows } = await client.query(
    `select public._product_stock_legacy_migration_compute_fingerprint(
      public._product_stock_legacy_migration_build_fingerprint_json(
        $1::uuid,
        $2::uuid,
        $3::text,
        $4::uuid[],
        $5::uuid[],
        public._product_stock_legacy_migration_compute_movement_checksum($5::uuid[]),
        $6::timestamptz,
        $7::numeric,
        $8::uuid
      )
    ) as fingerprint`,
    [
      group.userId,
      group.savedProductProfileId,
      group.baseUnit,
      legacyIds,
      movementIds,
      migrationCutoffAt,
      group.effectiveBalance,
      group.canonicalContainerId,
    ],
  )

  return String(rows[0]?.fingerprint ?? '')
}

export async function insertDraftProductProfileForLegacyMigration(
  client: Client,
  state: LegacyMigrationDatabaseTestState,
  userId: string,
): Promise<string> {
  return insertDraftProductProfileFixture(client, state, userId)
}

export async function insertLegacyMigrationTestArea(
  client: Client,
  state: LegacyMigrationDatabaseTestState,
  userId: string,
  label: string,
  sizeSqm: number,
): Promise<string> {
  const id = crypto.randomUUID()
  await client.query(
    `insert into public.areas (id, user_id, name, size_sqm, sort_order)
     values ($1, $2, $3, $4, 0)`,
    [id, userId, `${LEGACY_MIGRATION_DB_TEST_PREFIX}-area-${label}`, sizeSqm],
  )
  state.areaIds.push(id)
  return id
}

export async function analyzeLegacyMigrationGroupDirect(
  client: Client,
  options: {
    userId: string
    savedProductProfileId: string
    baseUnit: string | null
    migrationCutoffAt: string
  },
): Promise<Record<string, unknown>> {
  const { rows } = await client.query(
    `select public._product_stock_legacy_migration_analyze_group(
      $1::uuid, $2::uuid, $3::text, $4::timestamptz
    ) as result`,
    [
      options.userId,
      options.savedProductProfileId,
      options.baseUnit,
      options.migrationCutoffAt,
    ],
  )
  return (rows[0]?.result ?? {}) as Record<string, unknown>
}

export async function countLegacyMigrationReceipts(client: Client): Promise<number> {
  const { rows } = await client.query(
    `select count(*)::int as count from public.fertilizer_product_stock_migration_receipts`,
  )
  return Number(rows[0]?.count ?? 0)
}

export async function countLegacyBalanceMigrationMovements(client: Client): Promise<number> {
  const { rows } = await client.query(
    `select count(*)::int as count
     from public.fertilizer_stock_movements
     where movement_type = 'legacy_balance_migration'`,
  )
  return Number(rows[0]?.count ?? 0)
}

export async function computeLegacyContainerBalance(
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

export async function countLegacyMigrationApplicationArtifacts(
  client: Client,
  options: {
    userId: string
    idempotencyKey: string
    inventoryItemId: string
  },
): Promise<LegacyMigrationApplicationArtifactCounts> {
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
     where m.container_id = $1::uuid
       and m.movement_type = 'fertilization'::public.fertilizer_movement_type
       and exists (
         select 1
         from public.fertilizer_application_batches b
         where b.user_id = $2
           and b.idempotency_key = $3
           and b.movement_id = m.id
       )`,
    [options.inventoryItemId, options.userId, options.idempotencyKey],
  )

  return {
    batches: Number(batches.rows[0]?.count ?? 0),
    activities: Number(activities.rows[0]?.count ?? 0),
    fertilizationDetails: Number(details.rows[0]?.count ?? 0),
    movements: Number(movements.rows[0]?.count ?? 0),
  }
}

export async function callApplyInventoryToAreasViaRpc(
  authClient: LocalProductStockIntakeAuthClient,
  options: {
    inventoryItemId: string
    savedProductProfileId: string
    userId: string
    idempotencyKey: string
    totalApplicationAmount: number
    applicationUnit: 'kg' | 'ml'
    appliedAt: string
    areas: LegacyMigrationApplicationAreaPayload[]
  },
): Promise<{ data: unknown; error: { message: string } | null }> {
  const client = await authClient.pool.connect()
  const effortRateUnit = options.applicationUnit === 'kg' ? 'g_per_sqm' : 'ml_per_sqm'
  const areasJson = options.areas.map((area) => ({
    areaId: area.areaId,
    areaNameSnapshot: area.areaNameSnapshot,
    areaSizeSqmSnapshot: area.areaSizeSqmSnapshot,
    applicationAmount: area.applicationAmount,
    applicationUnit: area.applicationUnit,
    ratePerSqm: area.ratePerSqm,
    rateUnit: area.rateUnit,
    sortOrder: area.sortOrder,
  }))

  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authClient.userId])
    const { rows } = await client.query(
      `select public.apply_fertilizer_inventory_item_to_areas(
        $1::uuid,
        $2::uuid,
        'rate_per_sqm',
        'manual',
        $3::numeric,
        $4::text,
        $5::numeric,
        $6::text,
        $7::timestamptz,
        $8::text,
        $9::jsonb,
        null,
        null,
        null,
        $10::uuid
      ) as result`,
      [
        options.inventoryItemId,
        options.savedProductProfileId,
        options.areas[0]!.ratePerSqm,
        effortRateUnit,
        options.totalApplicationAmount,
        options.applicationUnit,
        options.appliedAt,
        options.idempotencyKey,
        JSON.stringify(areasJson),
        options.userId,
      ],
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

export async function findGroupAnalysis(
  dryRun: { groups: LegacyMigrationGroupAnalysis[] },
  profileId: string,
  baseUnit: 'kg' | 'ml',
): Promise<LegacyMigrationGroupAnalysis> {
  const group = dryRun.groups.find(
    (entry) => entry.savedProductProfileId === profileId && entry.baseUnit === baseUnit,
  )
  if (!group) {
    throw new Error(`Group not found for profile ${profileId} / ${baseUnit}`)
  }
  return group
}

export async function appendMovementViaRpc(
  authClient: LocalProductStockIntakeAuthClient,
  options: {
    containerId: string
    userId: string
    quantityDelta: number
    unit: 'kg' | 'ml'
    movementType: string
    idempotencyKey?: string
  },
): Promise<{ data: unknown; error: { message: string } | null }> {
  const client = await authClient.pool.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authClient.userId])
    const { rows } = await client.query(
      `select public.append_fertilizer_inventory_core_movement(
        $1::uuid, 'authenticated_user', $2::uuid, null,
        $3::numeric, $4::text, $5::text, 'manual', timezone('utc', now()), $6::text, null, null, null, null
      ) as result`,
      [
        options.containerId,
        options.userId,
        options.quantityDelta,
        options.unit,
        options.movementType,
        options.idempotencyKey ?? null,
      ],
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

export async function purgeLegacyMigrationDatabaseTestData(
  client: Client,
  state: LegacyMigrationDatabaseTestState,
): Promise<void> {
  const receiptIds = [...new Set(state.migrationReceiptIds)]
  const containerIds = [...new Set([...state.legacyContainerIds, ...state.canonicalContainerIds])]
  const profileIds = [...new Set(state.profileIds)]
  const userIds = [...new Set(state.testUsers.map((user) => user.id))]

  await client.query('begin')
  try {
    await client.query(`set local session_replication_role = replica`)

    if (receiptIds.length > 0) {
      await client.query(
        `delete from public.fertilizer_product_stock_migration_receipts where id = any($1::uuid[])`,
        [receiptIds],
      )
    }

    if (containerIds.length > 0) {
      await client.query(
        `delete from public.fertilizer_stock_movements where container_id = any($1::uuid[])`,
        [containerIds],
      )
      await client.query(
        `delete from public.fertilizer_containers where id = any($1::uuid[])`,
        [containerIds],
      )
    }

    if (receiptIds.length > 0) {
      await client.query(
        `delete from public.fertilizer_stock_movements
         where id in (
           select takeover_movement_id
           from public.fertilizer_product_stock_migration_receipts
           where id = any($1::uuid[]) and takeover_movement_id is not null
         )`,
        [receiptIds],
      )
    }

    if (profileIds.length > 0) {
      await client.query(`delete from public.product_profiles where id = any($1::uuid[])`, [
        profileIds,
      ])
    }

    const areaIds = [...new Set(state.areaIds)]
    if (areaIds.length > 0) {
      for (const areaId of areaIds) {
        await client.query(`select public.delete_area($1::uuid)`, [areaId]).catch(() => undefined)
      }
    }

    if (userIds.length > 0) {
      await client.query(`delete from auth.users where id = any($1::uuid[])`, [userIds])
    }

    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

export { isLocalProductStockIntakeAuthClient }
