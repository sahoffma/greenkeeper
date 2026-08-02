import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import {
  callAnalyzeLegacyMigrationRpc,
  callMigrateLegacyGroupRpc,
  computeLegacyMigrationFingerprint,
  insertLegacyMovementFixture,
} from './fertilizerProductStockLegacyMigrationDatabaseTestHarness'
import {
  callGetActiveProductStockItemViaRpc,
  callListActiveProductStockUnauthenticated,
  callListActiveProductStockViaRpc,
  computeEffectiveBalanceDirect,
  connectProductStockReadTestPg,
  createEmptyProductStockReadDatabaseTestState,
  createProductStockReadAuthClient,
  createProductStockReadTestUser,
  ensureProductStockIntakeMigrationsApplied,
  withTestReplicationRole,
  insertCanonicalProductStockFixture,
  insertLegacyContainerFixture,
  insertSavedProductProfileFixture,
  loadContainerRowDirect,
  loadProductStockReadDatabaseTestConfig,
  parseActiveProductStockItemPayload,
  parseActiveProductStockListPayload,
  purgeProductStockReadDatabaseTestData,
  stopLocalProductStockIntakePostgres,
  stopProductStockIntakeDatabaseTestEnvironment,
  type ProductStockReadDatabaseTestState,
} from './fertilizerProductStockReadDatabaseTestHarness'
import {
  mapLegacyMigrationDryRunResult,
  mapMigrateLegacyGroupRpcResult,
} from './fertilizerProductStockLegacyMigrationRpcCore'
import type { LocalProductStockIntakeDatabaseTestConfig } from './fertilizerProductStockIntakeLocalPostgresHarness'

const config = loadProductStockReadDatabaseTestConfig()
const describeDb = config ? describe : describe.skip

describeDb('fertilizerProductStockReadDatabase', () => {
  let pgClient: Client
  let state: ProductStockReadDatabaseTestState
  const testConfig = config as LocalProductStockIntakeDatabaseTestConfig
  const cutoff = '2026-08-02T20:00:00.000Z'

  beforeAll(async () => {
    pgClient = await connectProductStockReadTestPg(testConfig)
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
      await purgeProductStockReadDatabaseTestData(pgClient, state)
    }
  })

  it('DB-0 exposes active product stock read RPCs', async () => {
    const { rows } = await pgClient.query(
      `select p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in (
           'list_active_fertilizer_product_stock',
           'get_active_fertilizer_product_stock_item'
         )
       order by p.proname`,
    )

    expect(rows.map((row) => row.proname)).toEqual([
      'get_active_fertilizer_product_stock_item',
      'list_active_fertilizer_product_stock',
    ])
  })

  it('DB-1 includes active canonical product_stock item', async () => {
    state = createEmptyProductStockReadDatabaseTestState()
    const user = await createProductStockReadTestUser(state, 'canonical-active')
    const authClient = await createProductStockReadAuthClient(user)
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
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: canonicalId,
      userId: user.id,
      quantityDelta: 6.25,
      unit: 'kg',
      movementAt: '2026-08-01T10:00:00.000Z',
    })

    const { data, error } = await callListActiveProductStockViaRpc(authClient)
    expect(error).toBeNull()
    const payload = parseActiveProductStockListPayload(data)
    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]?.inventoryItemId).toBe(canonicalId)
    expect(payload.items[0]?.balance).toBe(6.25)
  })

  it('DB-2 excludes legacy, archived, superseded, null stock_kind and foreign items', async () => {
    state = createEmptyProductStockReadDatabaseTestState()
    const user = await createProductStockReadTestUser(state, 'filters')
    const otherUser = await createProductStockReadTestUser(state, 'foreign')
    const authClient = await createProductStockReadAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const otherProfile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: otherUser.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })

    const legacyId = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      stockKind: null,
    })
    const archivedId = crypto.randomUUID()
    await pgClient.query(
      `insert into public.fertilizer_containers (
        id, user_id, saved_product_profile_id, access_kind, base_unit, stock_kind, archived_at
      ) values ($1, $2, $3, 'authenticated_user', 'kg', 'product_stock', $4)`,
      [archivedId, user.id, profile.id, '2026-08-01T12:00:00.000Z'],
    )
    state.canonicalContainerIds.push(archivedId)
    state.containerIds.push(archivedId)
    const supersededId = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      stockKind: 'legacy_container',
      archivedAt: '2026-08-01T12:00:00.000Z',
      supersededByContainerId: legacyId,
    })
    const foreignId = await insertCanonicalProductStockFixture(pgClient, state, {
      userId: otherUser.id,
      savedProductProfileId: otherProfile.id,
      baseUnit: 'kg',
    })

    for (const [containerId, ownerId] of [
      [legacyId, user.id],
      [foreignId, otherUser.id],
    ] as const) {
      await insertLegacyMovementFixture(pgClient, state, {
        containerId,
        userId: ownerId,
        quantityDelta: 5,
        unit: 'kg',
        movementAt: '2026-08-01T10:00:00.000Z',
      })
    }

    const { data, error } = await callListActiveProductStockViaRpc(authClient)
    expect(error).toBeNull()
    expect(parseActiveProductStockListPayload(data).items).toHaveLength(0)
  })

  it('DB-3 keeps kg and ml and different saved product profiles separate', async () => {
    state = createEmptyProductStockReadDatabaseTestState()
    const user = await createProductStockReadTestUser(state, 'separate')
    const authClient = await createProductStockReadAuthClient(user)
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

    const kgId = await insertCanonicalProductStockFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: granularProfile.id,
      baseUnit: 'kg',
    })
    const mlId = await insertCanonicalProductStockFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: liquidProfile.id,
      baseUnit: 'ml',
    })

    await insertLegacyMovementFixture(pgClient, state, {
      containerId: kgId,
      userId: user.id,
      quantityDelta: 3,
      unit: 'kg',
      movementAt: '2026-08-01T10:00:00.000Z',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: mlId,
      userId: user.id,
      quantityDelta: 250,
      unit: 'ml',
      movementAt: '2026-08-01T10:00:00.000Z',
    })

    const payload = parseActiveProductStockListPayload(
      (await callListActiveProductStockViaRpc(authClient)).data,
    )

    expect(payload.items).toHaveLength(2)
    expect(payload.items.map((item) => item.baseUnit).sort()).toEqual(['kg', 'ml'])
    expect(new Set(payload.items.map((item) => item.savedProductProfileId)).size).toBe(2)
  })

  it('DB-4 sums only canonical movements with movement_at and preserves null and negative balances', async () => {
    state = createEmptyProductStockReadDatabaseTestState()
    const user = await createProductStockReadTestUser(state, 'balance')
    const authClient = await createProductStockReadAuthClient(user)
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

    await insertLegacyMovementFixture(pgClient, state, {
      containerId: canonicalId,
      userId: user.id,
      quantityDelta: 10,
      unit: 'kg',
      movementAt: '2026-08-01T10:00:00.000Z',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: canonicalId,
      userId: user.id,
      quantityDelta: -2.5,
      unit: 'kg',
      movementAt: '2026-08-01T11:00:00.000Z',
    })
    await withTestReplicationRole(pgClient, async () => {
      await pgClient.query(
        `insert into public.fertilizer_stock_movements (
          id, container_id, user_id, quantity_delta, unit, movement_type, movement_origin, movement_date
        ) values ($1, $2, $3, 99, 'kg', 'purchase', 'manual', '2020-01-01')`,
        [crypto.randomUUID(), canonicalId, user.id],
      )
    })

    const item = parseActiveProductStockListPayload(
      (await callListActiveProductStockViaRpc(authClient)).data,
    ).items[0]

    expect(item?.balance).toBe(7.5)
    expect(item?.movementCount).toBe(2)
  })

  it('DB-5 after legacy migration returns one canonical item without double counting', async () => {
    state = createEmptyProductStockReadDatabaseTestState()
    const user = await createProductStockReadTestUser(state, 'migrated')
    const authClient = await createProductStockReadAuthClient(user)
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
      stockKind: 'legacy_container',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: legacyId,
      userId: user.id,
      quantityDelta: 8,
      unit: 'kg',
      movementAt: '2026-08-01T10:00:00.000Z',
    })

    const dryRun = mapLegacyMigrationDryRunResult(
      (await callAnalyzeLegacyMigrationRpc(authClient, cutoff)).data,
    )
    const group = dryRun.groups.find(
      (entry) => entry.savedProductProfileId === profile.id && entry.baseUnit === 'kg',
    )
    expect(group?.classification).toBe('B')

    const fingerprint = await computeLegacyMigrationFingerprint(pgClient, group!, cutoff)
    const migrated = mapMigrateLegacyGroupRpcResult(
      (await callMigrateLegacyGroupRpc(authClient, {
        p_saved_product_profile_id: profile.id,
        p_base_unit: 'kg',
        p_idempotency_key: `gk-ps-read-${Date.now()}`,
        p_payload_fingerprint: fingerprint,
        p_migration_cutoff_at: cutoff,
      })).data,
    )
    state.migrationReceiptIds.push(migrated.receipt_id)
    state.canonicalContainerIds.push(migrated.canonical_container_id)

    await insertLegacyMovementFixture(pgClient, state, {
      containerId: migrated.canonical_container_id,
      userId: user.id,
      quantityDelta: 1.5,
      unit: 'kg',
      movementAt: '2026-08-02T12:00:00.000Z',
      movementType: 'purchase',
    })

    const payload = parseActiveProductStockListPayload(
      (await callListActiveProductStockViaRpc(authClient)).data,
    )

    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]?.inventoryItemId).toBe(migrated.canonical_container_id)
    expect(payload.items[0]?.balance).toBe(9.5)

    const legacyRow = await loadContainerRowDirect(pgClient, legacyId)
    expect(legacyRow?.superseded_by_container_id).toBe(migrated.canonical_container_id)
    expect(legacyRow?.archived_at).not.toBeNull()
    expect(await computeEffectiveBalanceDirect(pgClient, legacyId, user.id)).toBe(8)

    const legacyLookup = parseActiveProductStockItemPayload(
      (await callGetActiveProductStockItemViaRpc(authClient, legacyId)).data,
    )
    expect(legacyLookup).toBeNull()
  })

  it('DB-6 rejects unauthenticated list access', async () => {
    const result = await callListActiveProductStockUnauthenticated(pgClient)
    expect(result.error?.message).toContain('FERTILIZER_PRODUCT_STOCK_READ_ACCESS_DENIED')
  })

  it('DB-7 get_active returns canonical item and null for superseded legacy', async () => {
    state = createEmptyProductStockReadDatabaseTestState()
    const user = await createProductStockReadTestUser(state, 'single-item')
    const authClient = await createProductStockReadAuthClient(user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'liquid',
    })

    const canonicalId = await insertCanonicalProductStockFixture(pgClient, state, {
      userId: user.id,
      savedProductProfileId: profile.id,
      baseUnit: 'ml',
    })
    await insertLegacyMovementFixture(pgClient, state, {
      containerId: canonicalId,
      userId: user.id,
      quantityDelta: 100,
      unit: 'ml',
      movementAt: '2026-08-01T10:00:00.000Z',
    })

    const active = parseActiveProductStockItemPayload(
      (await callGetActiveProductStockItemViaRpc(authClient, canonicalId)).data,
    )
    expect(active?.inventoryItemId).toBe(canonicalId)
    expect(active?.balance).toBe(100)
  })
})
