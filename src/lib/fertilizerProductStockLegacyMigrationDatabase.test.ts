import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import {
  callProductStockIntakeRpc,
  ensureProductStockIntakeMigrationsApplied,
  insertSavedProductProfileFixture,
} from './fertilizerProductStockIntakeDatabaseTestHarness'
import type { LocalProductStockIntakeDatabaseTestConfig } from './fertilizerProductStockIntakeLocalPostgresHarness'
import {
  analyzeLegacyMigrationGroupDirect,
  appendMovementViaRpc,
  callAnalyzeLegacyMigrationRpc,
  callApplyInventoryToAreasViaRpc,
  callMigrateLegacyGroupRpc,
  computeLegacyContainerBalance,
  computeLegacyMigrationFingerprint,
  connectLegacyMigrationTestPg,
  countLegacyBalanceMigrationMovements,
  countLegacyMigrationApplicationArtifacts,
  countLegacyMigrationReceipts,
  createEmptyLegacyMigrationDatabaseTestState,
  createLegacyMigrationAuthClient,
  createLegacyMigrationTestUser,
  findGroupAnalysis,
  insertDraftProductProfileForLegacyMigration,
  insertLegacyContainerBypassingProfileValidation,
  insertCanonicalProductStockFixture,
  insertLegacyContainerFixture,
  insertLegacyMigrationTestArea,
  insertLegacyMovementFixture,
  loadLegacyMigrationDatabaseTestConfig,
  purgeLegacyMigrationDatabaseTestData,
  type LegacyMigrationDatabaseTestState,
  LEGACY_MIGRATION_DB_TEST_PREFIX,
} from './fertilizerProductStockLegacyMigrationDatabaseTestHarness'
import {
  mapLegacyMigrationDryRunResult,
  mapMigrateLegacyGroupRpcResult,
} from './fertilizerProductStockLegacyMigrationRpcCore'
import { stopLocalProductStockIntakePostgres } from './fertilizerProductStockIntakeLocalPostgresHarness'
import { stopProductStockIntakeDatabaseTestEnvironment } from './fertilizerProductStockIntakeDatabaseTestHarness'

const config = loadLegacyMigrationDatabaseTestConfig()
const describeDb = config ? describe : describe.skip

describeDb('fertilizerProductStockLegacyMigrationDatabase', () => {
  let pgClient: Client
  let state: LegacyMigrationDatabaseTestState
  const testConfig = config as LocalProductStockIntakeDatabaseTestConfig
  const cutoff = '2026-08-02T20:00:00.000Z'

  beforeAll(async () => {
    pgClient = await connectLegacyMigrationTestPg(testConfig)
    await ensureProductStockIntakeMigrationsApplied(pgClient, testConfig)
  }, 120_000)

  afterAll(async () => {
    if (pgClient) {
      await pgClient.end()
    }
    await stopProductStockIntakeDatabaseTestEnvironment(testConfig)
    await stopLocalProductStockIntakePostgres()
  })

  afterEach(async () => {
    if (state) {
      await purgeLegacyMigrationDatabaseTestData(pgClient, state)
    }
  })

  async function preparePositiveLegacyGroup(label: string, balance = 7.5) {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, label)
    const authClient = await createLegacyMigrationAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const legacyId = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: legacyId,
      userId: user.id,
      quantityDelta: balance,
      unit: 'kg',
      movementAt: '2026-08-01T10:00:00.000Z',
    })
    return { user, authClient, profile, legacyId }
  }

  it('DB-0 applies phase 3 migration schema', async () => {
    const { rows: supersededCol } = await pgClient.query(
      `select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'fertilizer_containers'
         and column_name = 'superseded_by_container_id'`,
    )
    const { rows: receiptTable } = await pgClient.query(
      `select 1 from information_schema.tables
       where table_schema = 'public'
         and table_name = 'fertilizer_product_stock_migration_receipts'`,
    )
    const { rows: enumValue } = await pgClient.query(
      `select 1 from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       where t.typname = 'fertilizer_movement_type'
         and e.enumlabel = 'legacy_balance_migration'`,
    )

    expect(supersededCol.length).toBe(1)
    expect(receiptTable.length).toBe(1)
    expect(enumValue.length).toBe(1)
  })

  it('DB-1 dry run makes no data changes', async () => {
    const { authClient, profile } = await preparePositiveLegacyGroup('dry-run')

    const beforeContainers = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_containers`,
    )
    const { data, error } = await callAnalyzeLegacyMigrationRpc(authClient, cutoff)
    expect(error).toBeNull()
    const dryRun = mapLegacyMigrationDryRunResult(data)
    const afterContainers = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_containers`,
    )

    expect(dryRun.summary.migrationGroupCount).toBeGreaterThan(0)
    expect(beforeContainers.rows[0]?.count).toBe(afterContainers.rows[0]?.count)

    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    expect(group.classification).toBe('B')
    expect(group.autoMigratable).toBe(true)
  })

  it('DB-2 positive balance migration creates takeover movement and supersedes legacy', async () => {
    const { authClient, profile, legacyId } = await preparePositiveLegacyGroup('positive')

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)

    const { data, error } = await callMigrateLegacyGroupRpc(authClient, {
      p_saved_product_profile_id: profile.id,
      p_base_unit: 'kg',
      p_idempotency_key: `${labelPrefix()}-positive`,
      p_payload_fingerprint: fingerprint,
      p_migration_cutoff_at: cutoff,
      p_legacy_container_ids: group.legacyContainerIds,
    })

    expect(error).toBeNull()
    const result = mapMigrateLegacyGroupRpcResult(data)
    state.migrationReceiptIds.push(result.receipt_id)
    state.canonicalContainerIds.push(result.canonical_container_id)

    const { rows: legacyRow } = await pgClient.query(
      `select archived_at, superseded_by_container_id from public.fertilizer_containers where id = $1`,
      [legacyId],
    )
    expect(legacyRow[0]?.archived_at).not.toBeNull()
    expect(legacyRow[0]?.superseded_by_container_id).toBe(result.canonical_container_id)

    const { rows: takeover } = await pgClient.query(
      `select movement_type::text, quantity_delta, container_id
       from public.fertilizer_stock_movements where id = $1`,
      [result.takeover_movement_id],
    )
    expect(takeover[0]?.movement_type).toBe('legacy_balance_migration')
    expect(Number(takeover[0]?.quantity_delta)).toBe(7.5)
  })

  it('DB-3 zero balance migration supersedes without takeover movement', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'zero')
    const authClient = await createLegacyMigrationAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const legacyId = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
    })

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    expect(group.classification).toBe('J')
    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)

    const { data, error } = await callMigrateLegacyGroupRpc(authClient, {
      p_saved_product_profile_id: profile.id,
      p_base_unit: 'kg',
      p_idempotency_key: `${labelPrefix()}-zero`,
      p_payload_fingerprint: fingerprint,
      p_migration_cutoff_at: cutoff,
      p_legacy_container_ids: group.legacyContainerIds,
    })

    expect(error).toBeNull()
    const result = mapMigrateLegacyGroupRpcResult(data)
    state.migrationReceiptIds.push(result.receipt_id)
    state.canonicalContainerIds.push(result.canonical_container_id)
    expect(result.takeover_movement_id).toBeNull()

    const { rows: legacyRow } = await pgClient.query(
      `select archived_at, superseded_by_container_id from public.fertilizer_containers where id = $1`,
      [legacyId],
    )
    expect(legacyRow[0]?.archived_at).not.toBeNull()
  })

  it('DB-4 negative balance blocks migration', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'negative')
    const authClient = await createLegacyMigrationAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const legacyId = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: legacyId,
      userId: user.id,
      quantityDelta: -2,
      unit: 'kg',
      movementAt: '2026-08-01T10:00:00.000Z',
    })

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    expect(group.autoMigratable).toBe(false)

    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)
    const { error } = await callMigrateLegacyGroupRpc(authClient, {
      p_saved_product_profile_id: profile.id,
      p_base_unit: 'kg',
      p_idempotency_key: `${labelPrefix()}-negative`,
      p_payload_fingerprint: fingerprint,
      p_migration_cutoff_at: cutoff,
    })
    expect(error?.message).toContain('PRODUCT_STOCK_LEGACY_MIGRATION_GROUP_BLOCKED')
  })

  it('DB-5 idempotent replay returns same result without second takeover', async () => {
    const { authClient, profile } = await preparePositiveLegacyGroup('idempotent')
    const key = `${labelPrefix()}-replay`

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)

    const first = mapMigrateLegacyGroupRpcResult(
      (await callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: key,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      })).data,
    )
    state.migrationReceiptIds.push(first.receipt_id)
    state.canonicalContainerIds.push(first.canonical_container_id)

    const second = mapMigrateLegacyGroupRpcResult(
      (await callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: key,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      })).data,
    )

    expect(second.idempotency_replay).toBe(true)
    expect(second.takeover_movement_id).toBe(first.takeover_movement_id)

    const { rows: takeoverCount } = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_stock_movements
       where movement_type = 'legacy_balance_migration'`,
    )
    expect(takeoverCount[0]?.count).toBe(1)
  })

  it('DB-6 append rejects superseded legacy item', async () => {
    const { user, authClient, profile } = await preparePositiveLegacyGroup('write-protect')
    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)

    const migrated = mapMigrateLegacyGroupRpcResult(
      (await callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: `${labelPrefix()}-write-protect`,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      })).data,
    )
    state.migrationReceiptIds.push(migrated.receipt_id)
    state.canonicalContainerIds.push(migrated.canonical_container_id)

    const append = await appendMovementViaRpc(authClient, {
      containerId: group.legacyContainerIds[0]!,
      userId: user.id,
      quantityDelta: 1,
      unit: 'kg',
      movementType: 'purchase',
    })
    expect(append.error?.message).toContain('INVENTORY_ITEM_SUPERSEDED')
  })

  it('DB-7 class D reuses existing canonical item', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'class-d')
    const authClient = await createLegacyMigrationAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const canonicalId = await insertCanonicalProductStockFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
    })
    const legacyId = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: legacyId,
      userId: user.id,
      quantityDelta: 3,
      unit: 'kg',
    })

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    expect(group.classification).toBe('D')
    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)

    const result = mapMigrateLegacyGroupRpcResult(
      (await callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: `${labelPrefix()}-class-d`,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      })).data,
    )
    state.migrationReceiptIds.push(result.receipt_id)
    state.canonicalContainerIds.push(result.canonical_container_id)
    expect(result.canonical_container_id).toBe(canonicalId)
  })

  it('DB-8 parallel migration attempts serialize to one takeover', async () => {
    const { authClient, profile } = await preparePositiveLegacyGroup('parallel')
    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)
    const key = `${labelPrefix()}-parallel`

    const [first, second] = await Promise.all([
      callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: key,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      }),
      callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: key,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      }),
    ])

    expect(first.error === null || second.error === null).toBe(true)

    const success = first.error === null ? first.data : second.data
    if (success) {
      const parsed = mapMigrateLegacyGroupRpcResult(success)
      state.migrationReceiptIds.push(parsed.receipt_id)
      state.canonicalContainerIds.push(parsed.canonical_container_id)
    }

    const { rows: takeoverCount } = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_stock_movements
       where movement_type = 'legacy_balance_migration'
         and container_id = any($1::uuid[])`,
      [state.canonicalContainerIds],
    )
    expect(takeoverCount[0]?.count).toBe(1)
  })

  it('DB-8b parallel migration attempts serialize to one takeover (second run)', async () => {
    const { authClient, profile } = await preparePositiveLegacyGroup('parallel-2')
    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)
    const key = `${labelPrefix()}-parallel-2`

    const [first, second] = await Promise.all([
      callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: key,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      }),
      callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: key,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      }),
    ])

    expect(first.error === null || second.error === null).toBe(true)

    const success = first.error === null ? first.data : second.data
    if (success) {
      const parsed = mapMigrateLegacyGroupRpcResult(success)
      state.migrationReceiptIds.push(parsed.receipt_id)
      state.canonicalContainerIds.push(parsed.canonical_container_id)
    }

    const { rows: takeoverCount } = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_stock_movements
       where movement_type = 'legacy_balance_migration'
         and container_id = any($1::uuid[])`,
      [state.canonicalContainerIds],
    )
    expect(takeoverCount[0]?.count).toBe(1)
  })

  it('DB-9 schema guards reject self-supersede and direct receipt writes', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'schema-guards')
    const id = crypto.randomUUID()

    await expect(
      pgClient.query(
        `insert into public.fertilizer_containers (
          id, user_id, access_kind, base_unit, package_size_value, package_size_unit,
          superseded_by_container_id
        ) values ($1, $2, 'authenticated_user', 'kg', 10, 'kg', $1)`,
        [id, user.id],
      ),
    ).rejects.toThrow(/superseded_by_container_id_self_reference|check constraint/i)

    await expect(
      pgClient.query(
        `insert into public.fertilizer_product_stock_migration_receipts (
          user_id, idempotency_key, migration_group_key, payload_fingerprint,
          saved_product_profile_id, base_unit, legacy_container_ids, effective_balance,
          migration_cutoff_at, movement_checksum, status
        ) values (
          $1, 'direct-write', 'group', 'fp', $2, 'kg', '{}'::uuid[], 0,
          now(), 'checksum', 'pending'
        )`,
        [user.id, crypto.randomUUID()],
      ),
    ).rejects.toThrow()
  })

  it('DB-10 intake RPC rejects legacy_balance_migration reason', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'intake-reject')
    const authClient = await createLegacyMigrationAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })

    const { error } = await callProductStockIntakeRpc(authClient, {
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      quantity: 1,
      reason: 'legacy_balance_migration' as 'purchase',
      idempotencyKey: `${labelPrefix()}-intake-reject`,
    })

    expect(error?.message).toMatch(/INVENTORY_INTAKE|legacy_balance_migration|not allowed/i)
  })

  it('DB-11 class A canonical-only group is not auto migratable', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'class-a')
    const authClient = await createLegacyMigrationAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    await insertCanonicalProductStockFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
    })

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    expect(group.classification).toBe('A')
    expect(group.autoMigratable).toBe(false)
  })

  it('DB-12 class C groups multiple legacy items with same profile', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'class-c')
    const authClient = await createLegacyMigrationAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const legacyA = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      packageSizeValue: 5,
    })
    const legacyB = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      packageSizeValue: 25,
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: legacyA,
      userId: user.id,
      quantityDelta: 2,
      unit: 'kg',
      movementAt: '2026-08-01T10:00:00.000Z',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: legacyB,
      userId: user.id,
      quantityDelta: 3,
      unit: 'kg',
      movementAt: '2026-08-01T11:00:00.000Z',
    })

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    expect(group.classification).toBe('C')
    expect(group.autoMigratable).toBe(true)
    expect(group.legacyContainerIds).toHaveLength(2)
  })

  it('DB-13 class G blocks form and unit mismatch', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'class-g')
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })

    const { rows } = await pgClient.query(
      `select public._product_stock_legacy_migration_analyze_group(
        $1::uuid, $2::uuid, 'ml', $3::timestamptz
      ) as result`,
      [user.id, profile.id, cutoff],
    )
    const group = rows[0]?.result as Record<string, unknown>
    expect(group.classification).toBe('G')
    expect(group.autoMigratable).toBe(false)
  })

  it('DB-14 class I blocks archived legacy without supersede mapping', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'class-i')
    const authClient = await createLegacyMigrationAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      archivedAt: '2026-07-01T10:00:00.000Z',
    })

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    expect(group.classification).toBe('I')
    expect(group.autoMigratable).toBe(false)
  })

  it('DB-15 different saved product profiles remain separate groups', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'separate-profiles')
    const authClient = await createLegacyMigrationAuthClient(user)
    const profileA = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const profileB = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profileA.id,
      baseUnit: 'kg',
    })
    await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profileB.id,
      baseUnit: 'kg',
    })

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const groups = dryRun.groups.filter(
      (entry) => entry.savedProductProfileId === profileA.id || entry.savedProductProfileId === profileB.id,
    )
    expect(groups).toHaveLength(2)
    expect(new Set(groups.map((entry) => entry.migrationGroupKey)).size).toBe(2)
  })

  it('DB-16 fingerprint mismatch rejects migration write', async () => {
    const { authClient, profile } = await preparePositiveLegacyGroup('fingerprint-mismatch')

    const { error } = await callMigrateLegacyGroupRpc(authClient, {
      p_saved_product_profile_id: profile.id,
      p_base_unit: 'kg',
      p_idempotency_key: `${labelPrefix()}-fp-mismatch`,
      p_payload_fingerprint: 'deadbeef',
      p_migration_cutoff_at: cutoff,
    })

    expect(error?.message).toContain('PRODUCT_STOCK_LEGACY_MIGRATION_FINGERPRINT_MISMATCH')
  })

  it('DB-17 changed source after dry run rejects stale fingerprint', async () => {
    const { authClient, profile, legacyId } = await preparePositiveLegacyGroup('changed-source')
    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    const staleFingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)

    await insertLegacyMovementFixture(pgClient, state, {
      containerId: legacyId,
      userId: group.userId,
      quantityDelta: 1,
      unit: 'kg',
      movementAt: '2026-08-01T12:00:00.000Z',
    })

    const { error } = await callMigrateLegacyGroupRpc(authClient, {
      p_saved_product_profile_id: profile.id,
      p_base_unit: 'kg',
      p_idempotency_key: `${labelPrefix()}-changed-source`,
      p_payload_fingerprint: staleFingerprint,
      p_migration_cutoff_at: cutoff,
    })

    expect(error?.message).toContain('PRODUCT_STOCK_LEGACY_MIGRATION_FINGERPRINT_MISMATCH')
  })

  it('DB-18 same group with different key after completion is rejected', async () => {
    const { authClient, profile } = await preparePositiveLegacyGroup('group-completed')
    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)

    const first = mapMigrateLegacyGroupRpcResult(
      (await callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: `${labelPrefix()}-group-first`,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      })).data,
    )
    state.migrationReceiptIds.push(first.receipt_id)
    state.canonicalContainerIds.push(first.canonical_container_id)

    const { error } = await callMigrateLegacyGroupRpc(authClient, {
      p_saved_product_profile_id: profile.id,
      p_base_unit: 'kg',
      p_idempotency_key: `${labelPrefix()}-group-second`,
      p_payload_fingerprint: fingerprint,
      p_migration_cutoff_at: cutoff,
    })

    expect(error?.message).toContain('PRODUCT_STOCK_LEGACY_MIGRATION_GROUP_ALREADY_COMPLETED')
  })

  it('DB-19 historical movements remain unchanged after migration', async () => {
    const { authClient, profile, legacyId } = await preparePositiveLegacyGroup('history')
    const before = await pgClient.query(
      `select id, quantity_delta, movement_type::text, movement_at
       from public.fertilizer_stock_movements where container_id = $1 order by id`,
      [legacyId],
    )

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)
    const result = mapMigrateLegacyGroupRpcResult(
      (await callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: `${labelPrefix()}-history`,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      })).data,
    )
    state.migrationReceiptIds.push(result.receipt_id)
    state.canonicalContainerIds.push(result.canonical_container_id)

    const after = await pgClient.query(
      `select id, quantity_delta, movement_type::text, movement_at
       from public.fertilizer_stock_movements where container_id = $1 order by id`,
      [legacyId],
    )
    expect(after.rows).toEqual(before.rows)
  })

  it('DB-20 security rejects unauthenticated analyze and foreign profile migration', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const owner = await createLegacyMigrationTestUser(state, 'owner')
    const other = await createLegacyMigrationTestUser(state, 'other')
    const ownerClient = await createLegacyMigrationAuthClient(owner)
    const otherClient = await createLegacyMigrationAuthClient(other)
    const ownerProfile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: owner.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    await insertLegacyContainerFixture(pgClient, state, {
      userId: owner.id,
      savedProductProfileId: ownerProfile.id,
      baseUnit: 'kg',
    })

    const unauth = await pgClient.query(
      `select public.analyze_fertilizer_product_stock_legacy_migration($1::timestamptz) as result`,
      [cutoff],
    ).catch((error: Error) => ({ error }))

    expect('error' in unauth).toBe(true)

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(ownerClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, ownerProfile.id, 'kg')
    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)

    const foreignAttempt = await callMigrateLegacyGroupRpc(otherClient, {
      p_saved_product_profile_id: ownerProfile.id,
      p_base_unit: 'kg',
      p_idempotency_key: `${labelPrefix()}-foreign`,
      p_payload_fingerprint: fingerprint,
      p_migration_cutoff_at: cutoff,
    })

    expect(foreignAttempt.error?.message).toMatch(
      /PRODUCT_STOCK_LEGACY_MIGRATION_GROUP_BLOCKED|missing_or_invalid_saved_profile|ACCESS_DENIED/i,
    )
  })

  it('DB-21 unmigrated legacy items remain writable', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'legacy-compat')
    const authClient = await createLegacyMigrationAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const legacyId = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
    })

    const append = await appendMovementViaRpc(authClient, {
      containerId: legacyId,
      userId: user.id,
      quantityDelta: 2,
      unit: 'kg',
      movementType: 'purchase',
    })
    expect(append.error).toBeNull()
  })

  it('DB-22 dry run class E blocks draft saved product profile anchor', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'class-e')
    const authClient = await createLegacyMigrationAuthClient(user)
    const draftProfileId = await insertDraftProductProfileForLegacyMigration(pgClient, state, user.id)
    const legacyId = await insertLegacyContainerBypassingProfileValidation(pgClient, state, {
      userId: user.id,
      savedProductProfileId: draftProfileId,
      baseUnit: 'kg',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: legacyId,
      userId: user.id,
      quantityDelta: 4,
      unit: 'kg',
      movementAt: '2026-08-01T10:00:00.000Z',
    })

    const beforeReceipts = await countLegacyMigrationReceipts(pgClient)
    const beforeTakeovers = await countLegacyBalanceMigrationMovements(pgClient)
    const beforeMovements = await pgClient.query(
      `select id, quantity_delta, movement_type::text from public.fertilizer_stock_movements where container_id = $1 order by id`,
      [legacyId],
    )

    const { data, error } = await callAnalyzeLegacyMigrationRpc(authClient, cutoff)
    expect(error).toBeNull()
    const dryRun = mapLegacyMigrationDryRunResult(data)
    const group = await findGroupAnalysis(dryRun, draftProfileId, 'kg')

    expect(group.classification).toBe('E')
    expect(group.autoMigratable).toBe(false)
    expect(group.blockingReasons).toContain('missing_or_invalid_saved_profile')
    expect(group.expectedTakeoverMovement).toBe(false)
    expect(group.canonicalContainerId).toBeNull()

    const afterReceipts = await countLegacyMigrationReceipts(pgClient)
    const afterTakeovers = await countLegacyBalanceMigrationMovements(pgClient)
    const afterMovements = await pgClient.query(
      `select id, quantity_delta, movement_type::text from public.fertilizer_stock_movements where container_id = $1 order by id`,
      [legacyId],
    )
    const { rows: legacyRow } = await pgClient.query(
      `select archived_at, superseded_by_container_id from public.fertilizer_containers where id = $1`,
      [legacyId],
    )

    expect(afterReceipts).toBe(beforeReceipts)
    expect(afterTakeovers).toBe(beforeTakeovers)
    expect(afterMovements.rows).toEqual(beforeMovements.rows)
    expect(legacyRow[0]?.archived_at).toBeNull()
    expect(legacyRow[0]?.superseded_by_container_id).toBeNull()
  })

  it('DB-23 public dry run never returns class F from persistable legacy data and keeps kg/ml separate', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'class-f-public')
    const authClient = await createLegacyMigrationAuthClient(user)
    const granularProfile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const liquidProfile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'liquid',
    })

    const granularLegacyId = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: granularProfile.id,
      baseUnit: 'kg',
    })
    const liquidLegacyId = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: liquidProfile.id,
      baseUnit: 'ml',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: granularLegacyId,
      userId: user.id,
      quantityDelta: 3,
      unit: 'kg',
      movementAt: '2026-08-01T10:00:00.000Z',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: liquidLegacyId,
      userId: user.id,
      quantityDelta: 250,
      unit: 'ml',
      movementAt: '2026-08-01T10:00:00.000Z',
    })

    await expect(
      insertLegacyContainerFixture(pgClient, state, {
        userId: user.id,
        savedProductProfileId: granularProfile.id,
        baseUnit: 'ml',
      }),
    ).rejects.toThrow(/INVENTORY_BASE_UNIT_PRODUCT_FORM_MISMATCH|base_unit_check|check constraint/i)

    await expect(
      pgClient.query(
        `insert into public.fertilizer_containers (
          id, user_id, saved_product_profile_id, access_kind, base_unit,
          package_size_value, package_size_unit
        ) values ($1, $2, $3, 'authenticated_user', 'lb', 10, 'lb')`,
        [crypto.randomUUID(), user.id, granularProfile.id],
      ),
    ).rejects.toThrow(/INVENTORY_BASE_UNIT_PRODUCT_FORM_MISMATCH|base_unit_check|check constraint/i)

    const beforeReceipts = await countLegacyMigrationReceipts(pgClient)
    const beforeTakeovers = await countLegacyBalanceMigrationMovements(pgClient)

    const { data, error } = await callAnalyzeLegacyMigrationRpc(authClient, cutoff)
    expect(error).toBeNull()
    const dryRun = mapLegacyMigrationDryRunResult(data)

    const granularGroup = await findGroupAnalysis(dryRun, granularProfile.id, 'kg')
    const liquidGroup = await findGroupAnalysis(dryRun, liquidProfile.id, 'ml')

    expect(granularGroup.classification).not.toBe('F')
    expect(liquidGroup.classification).not.toBe('F')
    expect(granularGroup.migrationGroupKey).not.toBe(liquidGroup.migrationGroupKey)
    expect(dryRun.groups.every((group) => group.classification !== 'F')).toBe(true)

    expect(await countLegacyMigrationReceipts(pgClient)).toBe(beforeReceipts)
    expect(await countLegacyBalanceMigrationMovements(pgClient)).toBe(beforeTakeovers)

    for (const legacyId of [granularLegacyId, liquidLegacyId]) {
      const { rows: legacyRow } = await pgClient.query(
        `select archived_at, superseded_by_container_id, base_unit
         from public.fertilizer_containers where id = $1`,
        [legacyId],
      )
      expect(legacyRow[0]?.archived_at).toBeNull()
      expect(legacyRow[0]?.superseded_by_container_id).toBeNull()
      expect(['kg', 'ml']).toContain(legacyRow[0]?.base_unit)
    }
  })

  it('DB-23b internal analyze helper defensively classifies invalid base unit as class F', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'class-f-defensive')
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })

    const nullUnitGroup = await analyzeLegacyMigrationGroupDirect(pgClient, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: null,
      migrationCutoffAt: cutoff,
    })
    expect(nullUnitGroup.classification).toBe('F')
    expect(nullUnitGroup.autoMigratable).toBe(false)
    expect(nullUnitGroup.blockingReasons).toContain('missing_or_invalid_base_unit')

    const invalidUnitGroup = await analyzeLegacyMigrationGroupDirect(pgClient, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'lb',
      migrationCutoffAt: cutoff,
    })
    expect(invalidUnitGroup.classification).toBe('F')
    expect(invalidUnitGroup.autoMigratable).toBe(false)
    expect(invalidUnitGroup.blockingReasons).toContain('missing_or_invalid_base_unit')
  })

  it('DB-24 dry run class H blocks negative balance and write migration rejects partial writes', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationTestUser(state, 'class-h')
    const authClient = await createLegacyMigrationAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const legacyId = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: legacyId,
      userId: user.id,
      quantityDelta: -3.5,
      unit: 'kg',
      movementAt: '2026-08-01T10:00:00.000Z',
    })

    const beforeReceipts = await countLegacyMigrationReceipts(pgClient)
    const beforeTakeovers = await countLegacyBalanceMigrationMovements(pgClient)
    const beforeMovements = await pgClient.query(
      `select id, quantity_delta, movement_type::text, movement_at from public.fertilizer_stock_movements where container_id = $1 order by id`,
      [legacyId],
    )
    const beforeCanonicalCount = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_containers
       where saved_product_profile_id = $1 and stock_kind = 'product_stock'`,
      [profile.id],
    )

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')

    expect(group.classification).toBe('H')
    expect(group.autoMigratable).toBe(false)
    expect(group.blockingReasons).toContain('negative_balance')
    expect(group.effectiveBalance).toBe(-3.5)
    expect(group.expectedTakeoverMovement).toBe(false)

    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)
    const { error } = await callMigrateLegacyGroupRpc(authClient, {
      p_saved_product_profile_id: profile.id,
      p_base_unit: 'kg',
      p_idempotency_key: `${labelPrefix()}-class-h`,
      p_payload_fingerprint: fingerprint,
      p_migration_cutoff_at: cutoff,
    })
    expect(error?.message).toContain('PRODUCT_STOCK_LEGACY_MIGRATION_GROUP_BLOCKED')

    const afterReceipts = await countLegacyMigrationReceipts(pgClient)
    const afterTakeovers = await countLegacyBalanceMigrationMovements(pgClient)
    const afterMovements = await pgClient.query(
      `select id, quantity_delta, movement_type::text, movement_at from public.fertilizer_stock_movements where container_id = $1 order by id`,
      [legacyId],
    )
    const afterCanonicalCount = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_containers
       where saved_product_profile_id = $1 and stock_kind = 'product_stock'`,
      [profile.id],
    )
    const { rows: completedReceipts } = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_product_stock_migration_receipts
       where status = 'completed' and saved_product_profile_id = $1`,
      [profile.id],
    )
    const { rows: legacyRow } = await pgClient.query(
      `select archived_at, superseded_by_container_id from public.fertilizer_containers where id = $1`,
      [legacyId],
    )

    expect(afterReceipts).toBe(beforeReceipts)
    expect(afterTakeovers).toBe(beforeTakeovers)
    expect(afterMovements.rows).toEqual(beforeMovements.rows)
    expect(afterCanonicalCount.rows[0]?.count).toBe(beforeCanonicalCount.rows[0]?.count)
    expect(completedReceipts[0]?.count).toBe(0)
    expect(legacyRow[0]?.archived_at).toBeNull()
    expect(legacyRow[0]?.superseded_by_container_id).toBeNull()
  })

  it('DB-25 apply_fertilizer_inventory_item_to_areas rejects superseded legacy without partial write', async () => {
    const { user, authClient, profile, legacyId } = await preparePositiveLegacyGroup('apply-block', 10)
    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = await findGroupAnalysis(dryRun, profile.id, 'kg')
    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group, cutoff)
    const migrated = mapMigrateLegacyGroupRpcResult(
      (await callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: `${labelPrefix()}-apply-block`,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      })).data,
    )
    state.migrationReceiptIds.push(migrated.receipt_id)
    state.canonicalContainerIds.push(migrated.canonical_container_id)

    const { rows: legacyRow } = await pgClient.query(
      `select archived_at, superseded_by_container_id from public.fertilizer_containers where id = $1`,
      [legacyId],
    )
    expect(legacyRow[0]?.archived_at).not.toBeNull()
    expect(legacyRow[0]?.superseded_by_container_id).toBe(migrated.canonical_container_id)

    const areaId = await insertLegacyMigrationTestArea(pgClient, state, user.id, 'apply-block', 25)
    const legacyBalanceBefore = await computeLegacyContainerBalance(pgClient, legacyId)
    const canonicalBalanceBefore = await computeLegacyContainerBalance(
      pgClient,
      migrated.canonical_container_id,
    )
    const idempotencyKey = `${labelPrefix()}-apply-superseded`
    state.applicationIdempotencyKeys.push(idempotencyKey)

    const apply = await callApplyInventoryToAreasViaRpc(authClient, {
      inventoryItemId: legacyId,
      savedProductProfileId: profile.id,
      userId: user.id,
      idempotencyKey,
      totalApplicationAmount: 0.5,
      applicationUnit: 'kg',
      appliedAt: '2026-08-01T14:00:00.000Z',
      areas: [
        {
          areaId,
          areaNameSnapshot: `${LEGACY_MIGRATION_DB_TEST_PREFIX}-area-apply-block`,
          areaSizeSqmSnapshot: 25,
          applicationAmount: 0.5,
          applicationUnit: 'kg',
          ratePerSqm: 20,
          rateUnit: 'g_per_sqm',
          sortOrder: 0,
        },
      ],
    })

    expect(apply.error?.message).toContain('INVENTORY_ITEM_SUPERSEDED')

    const artifacts = await countLegacyMigrationApplicationArtifacts(pgClient, {
      userId: user.id,
      idempotencyKey,
      inventoryItemId: legacyId,
    })
    expect(artifacts.batches).toBe(0)
    expect(artifacts.activities).toBe(0)
    expect(artifacts.fertilizationDetails).toBe(0)
    expect(artifacts.movements).toBe(0)
    expect(await computeLegacyContainerBalance(pgClient, legacyId)).toBe(legacyBalanceBefore)
    expect(await computeLegacyContainerBalance(pgClient, migrated.canonical_container_id)).toBe(
      canonicalBalanceBefore,
    )

    const canonicalAppend = await appendMovementViaRpc(authClient, {
      containerId: migrated.canonical_container_id,
      userId: user.id,
      quantityDelta: 1,
      unit: 'kg',
      movementType: 'purchase',
      idempotencyKey: `${labelPrefix()}-canonical-append`,
    })
    expect(canonicalAppend.error).toBeNull()
  })
})

function labelPrefix(): string {
  return `gk-ps-legacy-mig-${Date.now()}`
}
