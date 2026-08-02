import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import {
  evaluateLegacyContainerMigration,
  type LegacyContainerMigrationUpgradePlan,
} from './fertilizerInventoryLegacyMigrationCore'
import {
  buildUpgradeRpcParams,
  callLegacyUpgradeRpc,
  computeLegacyMigrationPayloadFingerprint,
  connectLegacyMigrationTestPg,
  countLegacyMigrationArtifacts,
  createAdminSupabaseClient,
  createAuthenticatedSupabaseClient,
  createEmptyLegacyMigrationDatabaseTestState,
  createLegacyMigrationDatabaseTestUser,
  ensureLegacyMigrationApplied,
  extractLegacyMigrationErrorCode,
  fetchContainerBalance,
  fetchContainerRow,
  fetchMovementsForContainer,
  insertLegacyCatalogProductFixture,
  insertLegacyContainerFixture,
  insertSavedProductProfileFixture,
  LEGACY_MIGRATION_DB_TEST_PREFIX,
  loadLegacyMigrationDatabaseTestConfig,
  purgeLegacyMigrationDatabaseTestData,
  reloadPostgrestSchema,
  type LegacyContainerFixture,
  type LegacyMigrationDatabaseTestState,
} from './fertilizerInventoryLegacyMigrationDatabaseTestHarness'
import type { CreationDatabaseTestConfig } from './fertilizerInventoryCreationDatabaseTestHarness'

const config = loadLegacyMigrationDatabaseTestConfig()
const describeDb = config ? describe : describe.skip

function buildUpgradePlan(
  fixture: LegacyContainerFixture,
  profileId: string,
  userId: string,
  overrides: {
    movements?: LegacyContainerFixture['movements']
    captureMetadata?: { packageCount?: number; distinctCaptureIdempotencyKeys?: string[] }
  } = {},
): LegacyContainerMigrationUpgradePlan {
  const movements = overrides.movements ?? fixture.movements
  const evaluation = evaluateLegacyContainerMigration({
    container: {
      containerId: fixture.containerId,
      userId,
      createdAt: '2026-07-31T10:00:00.000Z',
      productId: fixture.productId,
      recognitionCandidateId: fixture.candidateId,
      packageSizeValue: fixture.packageSizeValue,
      packageSizeUnit: fixture.packageSizeUnit,
      productForm: 'granular',
      label: `${LEGACY_MIGRATION_DB_TEST_PREFIX}-label`,
    },
    movements: movements.map((movement) => ({
      movementId: movement.movementId,
      movementType: movement.movementType as 'purchase',
      quantityDelta: movement.quantityDelta,
      unit: movement.unit,
      movementDate: movement.movementDate ?? '2026-07-31',
      createdAt: '2026-07-31T10:00:00.000Z',
      captureIdempotencyKey: movement.captureIdempotencyKey ?? `${LEGACY_MIGRATION_DB_TEST_PREFIX}-capture`,
    })),
    savedProfiles: [
      {
        id: profileId,
        profileStatus: 'saved',
        source: 'enrichment',
        productForm: 'granular',
      },
    ],
    catalogProduct: fixture.productId
      ? {
          productId: fixture.productId,
          productForm: 'granular',
          linkedSavedProfileId: profileId,
        }
      : null,
    captureMetadata: overrides.captureMetadata ?? null,
  })

  if (evaluation.status !== 'ready' || !evaluation.upgradePlan) {
    throw new Error(`Expected ready upgrade plan, got ${evaluation.status}: ${evaluation.reasons.join(',')}`)
  }

  return evaluation.upgradePlan
}

describeDb('fertilizerInventoryLegacyMigrationDatabase', () => {
  let pgClient: Client
  let admin: ReturnType<typeof createAdminSupabaseClient>
  let state: LegacyMigrationDatabaseTestState
  const testConfig = config as CreationDatabaseTestConfig

  beforeAll(async () => {
    pgClient = await connectLegacyMigrationTestPg(testConfig)
    await ensureLegacyMigrationApplied(pgClient)
    await reloadPostgrestSchema(pgClient)
    admin = createAdminSupabaseClient(testConfig)
  }, 120_000)

  afterAll(async () => {
    await pgClient.end()
  })

  afterEach(async () => {
    if (state) {
      await purgeLegacyMigrationDatabaseTestData(pgClient, state, admin)
    }
  })

  it('DB-0 applies legacy upgrade migration on the dev database', async () => {
    const { rows: receiptTable } = await pgClient.query(
      `select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'fertilizer_inventory_migration_receipts'`,
    )
    const { rows: rpc } = await pgClient.query(
      `select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'upgrade_fertilizer_legacy_container_to_inventory_core'`,
    )
    expect(receiptTable.length).toBe(1)
    expect(rpc.length).toBe(1)
  })

  it('DB-1 migrates legacy user container in-place', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationDatabaseTestUser(admin, state, 'success-in-place')
    const authClient = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const productId = await insertLegacyCatalogProductFixture(pgClient, state)
    const fixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      movements: [{ movementType: 'purchase', quantityDelta: 25, unit: 'kg' }],
    })
    const balanceBefore = await fetchContainerBalance(pgClient, fixture.containerId)
    const plan = buildUpgradePlan(fixture, profile.id, user.id)
    state.migrationKeys.push(plan.migrationIdempotencyKey)

    const result = await callLegacyUpgradeRpc(authClient, plan)
    expect(result.error).toBeNull()

    const container = await fetchContainerRow(pgClient, fixture.containerId)
    expect(container?.saved_product_profile_id).toBe(profile.id)
    expect(container?.product_id).toBeNull()
    expect(container?.recognition_candidate_id).toBeNull()
    expect(container?.access_kind).toBe('authenticated_user')
    expect(container?.base_unit).toBe('kg')
    expect(Number(container?.package_size_value)).toBe(25)

    const movements = await fetchMovementsForContainer(pgClient, fixture.containerId)
    expect(movements).toHaveLength(1)
    expect(movements[0]?.id).toBe(fixture.movements[0]?.movementId)
    expect(Number(movements[0]?.quantity_delta)).toBe(25)
    expect(movements[0]?.movement_at).toBeTruthy()
    expect(movements[0]?.inventory_idempotency_key).toBeTruthy()

    const balanceAfter = await fetchContainerBalance(pgClient, fixture.containerId)
    expect(balanceAfter).toBe(balanceBefore)

    const counts = await countLegacyMigrationArtifacts(pgClient, {
      containerId: fixture.containerId,
      migrationKey: plan.migrationIdempotencyKey,
    })
    expect(counts.receipts).toBe(1)
    expect(counts.containers).toBe(1)
    expect(counts.movements).toBe(1)
  })

  it('DB-2 identical second call is idempotent', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationDatabaseTestUser(admin, state, 'idempotent')
    const authClient = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const productId = await insertLegacyCatalogProductFixture(pgClient, state)
    const fixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 10,
      packageSizeUnit: 'kg',
      movements: [{ movementType: 'initial_stock', quantityDelta: 10, unit: 'kg' }],
    })
    const plan = buildUpgradePlan(fixture, profile.id, user.id)
    state.migrationKeys.push(plan.migrationIdempotencyKey)

    const first = await callLegacyUpgradeRpc(authClient, plan)
    const second = await callLegacyUpgradeRpc(authClient, plan)
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()

    const counts = await countLegacyMigrationArtifacts(pgClient, {
      containerId: fixture.containerId,
      migrationKey: plan.migrationIdempotencyKey,
    })
    expect(counts.receipts).toBe(1)
    expect(counts.containers).toBe(1)
    expect(counts.movements).toBe(1)
  })

  it('DB-3 partial consumption keeps balance and movement quantities', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationDatabaseTestUser(admin, state, 'partial')
    const authClient = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const productId = await insertLegacyCatalogProductFixture(pgClient, state)
    const fixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      movements: [
        { movementType: 'purchase', quantityDelta: 25, unit: 'kg' },
        { movementType: 'fertilization', quantityDelta: -8, unit: 'kg' },
      ],
    })
    const balanceBefore = await fetchContainerBalance(pgClient, fixture.containerId)
    const plan = buildUpgradePlan(fixture, profile.id, user.id)
    state.migrationKeys.push(plan.migrationIdempotencyKey)

    const result = await callLegacyUpgradeRpc(authClient, plan)
    expect(result.error).toBeNull()
    expect(await fetchContainerBalance(pgClient, fixture.containerId)).toBe(balanceBefore)
  })

  it('DB-4 rejects mismatched payload fingerprint', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationDatabaseTestUser(admin, state, 'fingerprint')
    const authClient = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const productId = await insertLegacyCatalogProductFixture(pgClient, state)
    const fixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      movements: [{ movementType: 'purchase', quantityDelta: 25, unit: 'kg' }],
    })
    const plan = buildUpgradePlan(fixture, profile.id, user.id)
    const params = buildUpgradeRpcParams(plan)
    params.p_payload_fingerprint = 'deadbeef'.repeat(8)

    const result = await authClient.rpc(
      'upgrade_fertilizer_legacy_container_to_inventory_core',
      params,
    )
    expect(result.error).not.toBeNull()
    expect(extractLegacyMigrationErrorCode(result.error?.message ?? '')).toBe(
      'MIGRATION_RECEIPT_FINGERPRINT_MISMATCH',
    )

    const container = await fetchContainerRow(pgClient, fixture.containerId)
    expect(container?.saved_product_profile_id).toBeNull()
    const counts = await countLegacyMigrationArtifacts(pgClient, { containerId: fixture.containerId })
    expect(counts.receipts).toBe(0)
  })

  it('DB-5 rejects unsupported unit g at domain boundary', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationDatabaseTestUser(admin, state, 'unit-g')
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const productId = await insertLegacyCatalogProductFixture(pgClient, state)
    const fixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 25,
      packageSizeUnit: 'g',
      movements: [{ movementType: 'purchase', quantityDelta: 25000, unit: 'g' }],
    })

    const evaluation = evaluateLegacyContainerMigration({
      container: {
        containerId: fixture.containerId,
        userId: user.id,
        createdAt: '2026-07-31T10:00:00.000Z',
        productId,
        packageSizeValue: 25,
        packageSizeUnit: 'g',
        productForm: 'granular',
      },
      movements: fixture.movements.map((movement) => ({
        movementId: movement.movementId,
        movementType: 'purchase',
        quantityDelta: movement.quantityDelta,
        unit: movement.unit,
        movementDate: '2026-07-31',
        createdAt: '2026-07-31T10:00:00.000Z',
      })),
      savedProfiles: [
        { id: profile.id, profileStatus: 'saved', source: 'enrichment', productForm: 'granular' },
      ],
      catalogProduct: { productId, productForm: 'granular', linkedSavedProfileId: profile.id },
    })

    expect(evaluation.status).toBe('needs_manual_review')
    expect(evaluation.upgradePlan).toBeNull()
  })

  it('DB-6 rejects aggregation signal via multiple capture keys', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationDatabaseTestUser(admin, state, 'aggregate')
    const authClient = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const productId = await insertLegacyCatalogProductFixture(pgClient, state)
    const fixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      movements: [
        {
          movementType: 'purchase',
          quantityDelta: 25,
          unit: 'kg',
          captureIdempotencyKey: `${LEGACY_MIGRATION_DB_TEST_PREFIX}-cap-1`,
        },
        {
          movementType: 'purchase',
          quantityDelta: 10,
          unit: 'kg',
          captureIdempotencyKey: `${LEGACY_MIGRATION_DB_TEST_PREFIX}-cap-2`,
        },
      ],
    })

    const singleCaptureFixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      movements: [
        {
          movementType: 'purchase',
          quantityDelta: 25,
          unit: 'kg',
          captureIdempotencyKey: `${LEGACY_MIGRATION_DB_TEST_PREFIX}-plan-cap-1`,
        },
      ],
    })
    const plan = buildUpgradePlan(singleCaptureFixture, profile.id, user.id)
    const params = buildUpgradeRpcParams(plan)
    params.p_container_id = fixture.containerId
    params.p_movement_upgrades = fixture.movements.map((movement) => ({
      movement_id: movement.movementId,
      movement_at: '2026-07-31T12:00:00.000Z',
      inventory_idempotency_key: `migration:movement:${movement.movementId}`,
      source_event_ref: `legacy:movement:${movement.movementId}`,
      movement_origin: 'migration',
    }))
    params.p_canonical_payload = plan.canonicalFingerprintInput
    params.p_payload_fingerprint = computeLegacyMigrationPayloadFingerprint(
      String(params.p_canonical_payload),
    )

    const result = await authClient.rpc(
      'upgrade_fertilizer_legacy_container_to_inventory_core',
      params,
    )
    expect(result.error).not.toBeNull()
    expect(extractLegacyMigrationErrorCode(result.error?.message ?? '')).toBe(
      'AGGREGATED_LEGACY_CONTAINER',
    )
  })

  it('DB-7 rejects invalid creation reason inventory_correction', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationDatabaseTestUser(admin, state, 'creation-reason')
    const authClient = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const productId = await insertLegacyCatalogProductFixture(pgClient, state)
    const fixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      movements: [{ movementType: 'purchase', quantityDelta: 25, unit: 'kg' }],
    })
    const plan = buildUpgradePlan(fixture, profile.id, user.id)
    const params = buildUpgradeRpcParams({ ...plan, creationReason: 'inventory_correction' as never })
    params.p_payload_fingerprint = computeLegacyMigrationPayloadFingerprint(
      String(params.p_canonical_payload),
    )

    const result = await authClient.rpc(
      'upgrade_fertilizer_legacy_container_to_inventory_core',
      params,
    )
    expect(result.error).not.toBeNull()
    expect(extractLegacyMigrationErrorCode(result.error?.message ?? '')).toBe(
      'AMBIGUOUS_CREATION_REASON',
    )
  })

  it('DB-8 parallel identical calls create one receipt', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationDatabaseTestUser(admin, state, 'parallel')
    const authClient = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const productId = await insertLegacyCatalogProductFixture(pgClient, state)
    const fixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      movements: [{ movementType: 'gift_received', quantityDelta: 12, unit: 'kg' }],
    })
    const plan = buildUpgradePlan(fixture, profile.id, user.id)
    state.migrationKeys.push(plan.migrationIdempotencyKey)

    const results = await Promise.all([
      callLegacyUpgradeRpc(authClient, plan),
      callLegacyUpgradeRpc(authClient, plan),
      callLegacyUpgradeRpc(authClient, plan),
    ])

    for (const result of results) {
      expect(result.error).toBeNull()
    }

    const counts = await countLegacyMigrationArtifacts(pgClient, {
      containerId: fixture.containerId,
      migrationKey: plan.migrationIdempotencyKey,
    })
    expect(counts.receipts).toBe(1)
    expect(counts.containers).toBe(1)
  })

  it('DB-S1 preserves movement business fields and supplements metadata only', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationDatabaseTestUser(admin, state, 'security-fields')
    const authClient = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const productId = await insertLegacyCatalogProductFixture(pgClient, state)
    const fixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      movements: [{ movementType: 'purchase', quantityDelta: 25, unit: 'kg' }],
    })
    const before = (await fetchMovementsForContainer(pgClient, fixture.containerId))[0]!
    const plan = buildUpgradePlan(fixture, profile.id, user.id)
    state.migrationKeys.push(plan.migrationIdempotencyKey)

    const result = await callLegacyUpgradeRpc(authClient, plan)
    expect(result.error).toBeNull()

    const after = (await fetchMovementsForContainer(pgClient, fixture.containerId))[0]!
    expect(after.id).toBe(before.id)
    expect(Number(after.quantity_delta)).toBe(Number(before.quantity_delta))
    expect(after.unit).toBe(before.unit)
    expect(after.movement_type).toBe(before.movement_type)
    expect(after.movement_origin).toBe(before.movement_origin)
    expect(after.movement_at).toBeTruthy()
    expect(after.inventory_idempotency_key).toBeTruthy()
    expect(after.source_event_ref).toBeTruthy()
    expect(after.access_kind).toBe('authenticated_user')
  })

  it('DB-S2 blocks direct quantity change even with upgrade context', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationDatabaseTestUser(admin, state, 'security-context')
    const productId = await insertLegacyCatalogProductFixture(pgClient, state)
    const fixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      movements: [{ movementType: 'purchase', quantityDelta: 25, unit: 'kg' }],
    })
    const movementId = fixture.movements[0]!.movementId

    await pgClient.query('begin')
    try {
      await pgClient.query(`select set_config('greenkeeper.fertilizer_legacy_upgrade', '1', true)`)
      await expect(
        pgClient.query(
          `update public.fertilizer_stock_movements
           set quantity_delta = 999
           where id = $1`,
          [movementId],
        ),
      ).rejects.toThrow(/INVENTORY_MOVEMENT_IMMUTABLE/)
    } finally {
      await pgClient.query('rollback')
    }

    const movement = (await fetchMovementsForContainer(pgClient, fixture.containerId))[0]!
    expect(Number(movement.quantity_delta)).toBe(25)
  })

  it('DB-S3 rejects conflicting existing core metadata with rollback', async () => {
    state = createEmptyLegacyMigrationDatabaseTestState()
    const user = await createLegacyMigrationDatabaseTestUser(admin, state, 'security-conflict')
    const authClient = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const productId = await insertLegacyCatalogProductFixture(pgClient, state)
    const fixture = await insertLegacyContainerFixture(pgClient, state, {
      userId: user.id,
      productId,
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      movements: [{ movementType: 'purchase', quantityDelta: 25, unit: 'kg' }],
    })
    const movementId = fixture.movements[0]!.movementId
    const conflictingKey = `${LEGACY_MIGRATION_DB_TEST_PREFIX}-existing-key`
    const conflictingRef = `${LEGACY_MIGRATION_DB_TEST_PREFIX}-existing-ref`

    await pgClient.query('begin')
    try {
      await pgClient.query(`select set_config('greenkeeper.fertilizer_legacy_upgrade', '1', true)`)
      await pgClient.query(
        `update public.fertilizer_stock_movements
         set movement_at = timezone('utc', now()),
             access_kind = 'authenticated_user',
             inventory_idempotency_key = $2,
             source_event_ref = $3
         where id = $1`,
        [movementId, conflictingKey, conflictingRef],
      )
      await pgClient.query('commit')
    } catch (error) {
      await pgClient.query('rollback').catch(() => undefined)
      throw error
    }

    const plan = buildUpgradePlan(fixture, profile.id, user.id)
    const result = await callLegacyUpgradeRpc(authClient, plan)
    expect(result.error).not.toBeNull()
    expect(extractLegacyMigrationErrorCode(result.error?.message ?? '')).toBe('INVALID_MOVEMENT')

    const container = await fetchContainerRow(pgClient, fixture.containerId)
    expect(container?.saved_product_profile_id).toBeNull()
    const counts = await countLegacyMigrationArtifacts(pgClient, { containerId: fixture.containerId })
    expect(counts.receipts).toBe(0)
  })

  it('DB-S4 upgrade context is not active outside the RPC transaction', async () => {
    await pgClient.query('begin')
    try {
      await pgClient.query(`select set_config('greenkeeper.fertilizer_legacy_upgrade', '1', true)`)
      const { rows } = await pgClient.query(
        `select current_setting('greenkeeper.fertilizer_legacy_upgrade', true) as value`,
      )
      expect(rows[0]?.value).toBe('1')
    } finally {
      await pgClient.query('rollback')
    }

    const { rows: afterRollback } = await pgClient.query(
      `select current_setting('greenkeeper.fertilizer_legacy_upgrade', true) as value`,
    )
    expect(afterRollback[0]?.value).toBe('')
  })
})

describe('fertilizerInventoryLegacyMigrationDatabase (skipped without opt-in)', () => {
  it('skips when RUN_FERTILIZER_LEGACY_MIGRATION_DB_TESTS is unset', () => {
    if (config) {
      expect(process.env.RUN_FERTILIZER_LEGACY_MIGRATION_DB_TESTS).toBe('1')
      return
    }

    expect(loadLegacyMigrationDatabaseTestConfig()).toBeNull()
  })
})
