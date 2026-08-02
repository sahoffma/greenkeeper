import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import {
  APPLICATION_DB_TEST_PREFIX,
  callApplicationRpc,
  computeContainerBalance,
  connectApplicationTestPg,
  countApplicationFailureArtifacts,
  createAdminSupabaseClient,
  createAuthenticatedSupabaseClient,
  createCreationDatabaseTestUser,
  createEmptyApplicationDatabaseTestState,
  createInventoryItemForApplication,
  ensureApplicationMigrationsApplied,
  extractApplicationErrorCode,
  insertApplicationTestArea,
  insertNonInventoryCoupledActivity,
  loadApplicationDatabaseTestConfig,
  parseApplicationRpcSuccess,
  purgeApplicationDatabaseTestData,
  reloadPostgrestSchema,
  type ApplicationDatabaseTestState,
} from './fertilizerApplicationDatabaseTestHarness'
import type { CreationDatabaseTestConfig } from './fertilizerInventoryCreationDatabaseTestHarness'

const config = loadApplicationDatabaseTestConfig()
const describeDb = config ? describe : describe.skip

function uniqueKey(label: string): string {
  return `${APPLICATION_DB_TEST_PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

describeDb('fertilizerApplicationDatabase', () => {
  let pgClient: Client
  let admin: ReturnType<typeof createAdminSupabaseClient>
  let state: ApplicationDatabaseTestState
  const testConfig = config as CreationDatabaseTestConfig

  beforeAll(async () => {
    pgClient = await connectApplicationTestPg(testConfig)
    await ensureApplicationMigrationsApplied(pgClient)
    await reloadPostgrestSchema(pgClient)
    admin = createAdminSupabaseClient(testConfig)
  }, 120_000)

  afterAll(async () => {
    await pgClient.end()
  })

  afterEach(async () => {
    if (state) {
      await purgeApplicationDatabaseTestData(pgClient, state, admin)
    }
  })

  it('DB-1 successful application creates one activity and one negative movement', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'apply-success')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'success')
    const idempotencyKey = uniqueKey('success')
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 5, unit: 'kg', idempotencyKey: uniqueKey('create-success') },
    )

    const { data, error } = await callApplicationRpc(auth, {
      inventoryItemId: itemId,
      savedProductProfileId: profileId,
      areaId,
      applicationAmount: 2,
      applicationUnit: 'kg',
      appliedAt: '2026-08-02T10:00:00.000Z',
      idempotencyKey,
      userId: user.id,
      note: 'Test application',
    })

    expect(error).toBeNull()
    const result = parseApplicationRpcSuccess(data)
    state.activityIds.push(result.activityId)
    state.movementIds.push(result.movementId)
    state.applicationIdempotencyKeys.push(idempotencyKey)

    const { rows: activities } = await pgClient.query(
      `select count(*)::int as count from public.activities where id = $1`,
      [result.activityId],
    )
    const { rows: movements } = await pgClient.query(
      `select count(*)::int as count, min(quantity_delta)::numeric as delta
       from public.fertilizer_stock_movements where activity_id = $1`,
      [result.activityId],
    )

    expect(Number(activities[0]?.count)).toBe(1)
    expect(Number(movements[0]?.count)).toBe(1)
    expect(Number(movements[0]?.delta)).toBe(-2)
    expect(result.resultingBalance).toBe(3)
  })

  it('DB-2 balance decreases exactly and zero balance remains item', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'zero-balance')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'zero')
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 1, unit: 'kg', idempotencyKey: uniqueKey('create-zero') },
    )

    const { data } = await callApplicationRpc(auth, {
      inventoryItemId: itemId,
      savedProductProfileId: profileId,
      areaId,
      applicationAmount: 1,
      applicationUnit: 'kg',
      appliedAt: '2026-08-02T11:00:00.000Z',
      idempotencyKey: uniqueKey('apply-zero'),
      userId: user.id,
    })

    const result = parseApplicationRpcSuccess(data)
    state.activityIds.push(result.activityId)
    state.movementIds.push(result.movementId)

    const balance = await computeContainerBalance(pgClient, itemId)
    expect(balance).toBe(0)
    const { rows } = await pgClient.query(`select id from public.fertilizer_containers where id = $1`, [
      itemId,
    ])
    expect(rows).toHaveLength(1)
  })

  it('DB-3 rejects over-application', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'over-apply')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'over')
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 1, unit: 'kg', idempotencyKey: uniqueKey('create-over') },
    )

    const { error } = await callApplicationRpc(auth, {
      inventoryItemId: itemId,
      savedProductProfileId: profileId,
      areaId,
      applicationAmount: 2,
      applicationUnit: 'kg',
      appliedAt: '2026-08-02T12:00:00.000Z',
      idempotencyKey: uniqueKey('apply-over'),
      userId: user.id,
    })

    expect(error).not.toBeNull()
    expect(extractApplicationErrorCode(error!.message)).toBe('FERTILIZER_APPLICATION_INSUFFICIENT_STOCK')

    const { rows: activities } = await pgClient.query(
      `select count(*)::int as count from public.activities where user_id = $1 and notes is null`,
      [user.id],
    )
    expect(Number(activities[0]?.count)).toBe(0)
  })

  it('DB-4 rejects unit mismatch', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'unit-mismatch')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'unit')
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 5, unit: 'kg', idempotencyKey: uniqueKey('create-unit') },
    )

    const { error } = await callApplicationRpc(auth, {
      inventoryItemId: itemId,
      savedProductProfileId: profileId,
      areaId,
      applicationAmount: 1,
      applicationUnit: 'ml',
      appliedAt: '2026-08-02T13:00:00.000Z',
      idempotencyKey: uniqueKey('apply-unit'),
      userId: user.id,
    })

    expect(extractApplicationErrorCode(error!.message)).toBe('FERTILIZER_APPLICATION_UNIT_MISMATCH')
  })

  it('DB-5 identical retry is idempotent', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'idempotent')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'idem')
    const idempotencyKey = uniqueKey('idem')
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 5, unit: 'kg', idempotencyKey: uniqueKey('create-idem') },
    )

    const params = {
      inventoryItemId: itemId,
      savedProductProfileId: profileId,
      areaId,
      applicationAmount: 1.5,
      applicationUnit: 'kg' as const,
      appliedAt: '2026-08-02T14:00:00.000Z',
      idempotencyKey,
      userId: user.id,
    }

    const first = parseApplicationRpcSuccess((await callApplicationRpc(auth, params)).data)
    const second = parseApplicationRpcSuccess((await callApplicationRpc(auth, params)).data)

    state.activityIds.push(first.activityId)
    state.movementIds.push(first.movementId)

    expect(second.idempotentReplay).toBe(true)
    expect(second.activityId).toBe(first.activityId)
    expect(second.movementId).toBe(first.movementId)

    const { rows } = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_stock_movements where activity_id = $1`,
      [first.activityId],
    )
    expect(Number(rows[0]?.count)).toBe(1)
  })

  it('DB-6 same key with different payload conflicts', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'conflict')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'conflict')
    const idempotencyKey = uniqueKey('conflict')
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 5, unit: 'kg', idempotencyKey: uniqueKey('create-conflict') },
    )

    const first = await callApplicationRpc(auth, {
      inventoryItemId: itemId,
      savedProductProfileId: profileId,
      areaId,
      applicationAmount: 1,
      applicationUnit: 'kg',
      appliedAt: '2026-08-02T15:00:00.000Z',
      idempotencyKey,
      userId: user.id,
    })
    const parsed = parseApplicationRpcSuccess(first.data)
    state.activityIds.push(parsed.activityId)
    state.movementIds.push(parsed.movementId)

    const second = await callApplicationRpc(auth, {
      inventoryItemId: itemId,
      savedProductProfileId: profileId,
      areaId,
      applicationAmount: 2,
      applicationUnit: 'kg',
      appliedAt: '2026-08-02T15:00:00.000Z',
      idempotencyKey,
      userId: user.id,
    })

    expect(extractApplicationErrorCode(second.error!.message)).toBe(
      'FERTILIZER_APPLICATION_IDEMPOTENCY_CONFLICT',
    )
  })

  it('DB-7 invalid area rolls back without artifacts', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'bad-area')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 5, unit: 'kg', idempotencyKey: uniqueKey('create-bad-area') },
    )
    const idempotencyKey = uniqueKey('bad-area')
    const balanceBefore = await computeContainerBalance(pgClient, itemId)
    const { rows: movementsBefore } = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_stock_movements where container_id = $1`,
      [itemId],
    )
    const movementCountBefore = Number(movementsBefore[0]?.count ?? 0)

    const { error } = await callApplicationRpc(auth, {
      inventoryItemId: itemId,
      savedProductProfileId: profileId,
      areaId: crypto.randomUUID(),
      applicationAmount: 1,
      applicationUnit: 'kg',
      appliedAt: '2026-08-02T16:00:00.000Z',
      idempotencyKey,
      userId: user.id,
    })

    expect(extractApplicationErrorCode(error!.message)).toBe(
      'FERTILIZER_APPLICATION_APPLICATION_TARGET_NOT_FOUND',
    )

    const artifacts = await countApplicationFailureArtifacts(pgClient, {
      userId: user.id,
      idempotencyKey,
      inventoryItemId: itemId,
    })
    expect(artifacts.receipts).toBe(0)
    expect(artifacts.activities).toBe(0)
    expect(artifacts.fertilizationDetails).toBe(0)
    expect(artifacts.movements).toBe(movementCountBefore)
    expect(await computeContainerBalance(pgClient, itemId)).toBe(balanceBefore)
  })

  it('DB-8 invalid profile rolls back', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'bad-profile')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'bad-profile')
    const { itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 5, unit: 'kg', idempotencyKey: uniqueKey('create-bad-profile') },
    )
    const idempotencyKey = uniqueKey('bad-profile')
    const balanceBefore = await computeContainerBalance(pgClient, itemId)
    const { rows: movementsBefore } = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_stock_movements where container_id = $1`,
      [itemId],
    )
    const movementCountBefore = Number(movementsBefore[0]?.count ?? 0)

    const { error } = await callApplicationRpc(auth, {
      inventoryItemId: itemId,
      savedProductProfileId: crypto.randomUUID(),
      areaId,
      applicationAmount: 1,
      applicationUnit: 'kg',
      appliedAt: '2026-08-02T17:00:00.000Z',
      idempotencyKey,
      userId: user.id,
    })

    expect(extractApplicationErrorCode(error!.message)).toBe(
      'FERTILIZER_APPLICATION_PRODUCT_PROFILE_MISMATCH',
    )

    const artifacts = await countApplicationFailureArtifacts(pgClient, {
      userId: user.id,
      idempotencyKey,
      inventoryItemId: itemId,
    })
    expect(artifacts.receipts).toBe(0)
    expect(artifacts.activities).toBe(0)
    expect(artifacts.fertilizationDetails).toBe(0)
    expect(artifacts.movements).toBe(movementCountBefore)
    expect(await computeContainerBalance(pgClient, itemId)).toBe(balanceBefore)
  })

  it('DB-9 blocks direct movement update and delete', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'movement-immutable')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'immutable')
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 5, unit: 'kg', idempotencyKey: uniqueKey('create-immutable') },
    )

    const result = parseApplicationRpcSuccess(
      (
        await callApplicationRpc(auth, {
          inventoryItemId: itemId,
          savedProductProfileId: profileId,
          areaId,
          applicationAmount: 1,
          applicationUnit: 'kg',
          appliedAt: '2026-08-02T18:00:00.000Z',
          idempotencyKey: uniqueKey('apply-immutable'),
          userId: user.id,
        })
      ).data,
    )
    state.activityIds.push(result.activityId)
    state.movementIds.push(result.movementId)

    await expect(
      pgClient.query(`update public.fertilizer_stock_movements set quantity_delta = -99 where id = $1`, [
        result.movementId,
      ]),
    ).rejects.toThrow(/INVENTORY_MOVEMENT_IMMUTABLE/)

    await expect(
      pgClient.query(`delete from public.fertilizer_stock_movements where id = $1`, [result.movementId]),
    ).rejects.toThrow(/INVENTORY_MOVEMENT_IMMUTABLE/)
  })

  it('DB-10 blocks direct inventory-coupled activity update and delete', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'activity-immutable')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'activity-immutable')
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 5, unit: 'kg', idempotencyKey: uniqueKey('create-act-immutable') },
    )

    const result = parseApplicationRpcSuccess(
      (
        await callApplicationRpc(auth, {
          inventoryItemId: itemId,
          savedProductProfileId: profileId,
          areaId,
          applicationAmount: 1,
          applicationUnit: 'kg',
          appliedAt: '2026-08-02T19:00:00.000Z',
          idempotencyKey: uniqueKey('apply-act-immutable'),
          userId: user.id,
        })
      ).data,
    )
    state.activityIds.push(result.activityId)
    state.movementIds.push(result.movementId)

    await expect(
      pgClient.query(`update public.activities set title = 'changed' where id = $1`, [result.activityId]),
    ).rejects.toThrow(/FERTILIZER_APPLICATION_ACTIVITY_IMMUTABLE/)

    await expect(
      pgClient.query(`delete from public.activities where id = $1`, [result.activityId]),
    ).rejects.toThrow(/FERTILIZER_APPLICATION_ACTIVITY_IMMUTABLE/)
  })

  it('DB-13 blocks direct inventory-coupled fertilization_details update and delete', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'details-immutable')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'details-immutable')
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 5, unit: 'kg', idempotencyKey: uniqueKey('create-details-immutable') },
    )

    const result = parseApplicationRpcSuccess(
      (
        await callApplicationRpc(auth, {
          inventoryItemId: itemId,
          savedProductProfileId: profileId,
          areaId,
          applicationAmount: 1,
          applicationUnit: 'kg',
          appliedAt: '2026-08-02T19:30:00.000Z',
          idempotencyKey: uniqueKey('apply-details-immutable'),
          userId: user.id,
        })
      ).data,
    )
    state.activityIds.push(result.activityId)
    state.movementIds.push(result.movementId)

    await expect(
      pgClient.query(
        `update public.fertilization_details set amount_applied = 99 where activity_id = $1`,
        [result.activityId],
      ),
    ).rejects.toThrow(/FERTILIZER_APPLICATION_FERTILIZATION_IMMUTABLE/)

    await expect(
      pgClient.query(`delete from public.fertilization_details where activity_id = $1`, [
        result.activityId,
      ]),
    ).rejects.toThrow(/FERTILIZER_APPLICATION_FERTILIZATION_IMMUTABLE/)
  })

  it('DB-14 non-inventory-coupled activity remains editable', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'manual-activity')
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'manual')
    const activityId = await insertNonInventoryCoupledActivity(pgClient, state, user.id, areaId)

    await pgClient.query(`update public.activities set title = $2 where id = $1`, [
      activityId,
      `${APPLICATION_DB_TEST_PREFIX}-manual-updated`,
    ])

    const { rows } = await pgClient.query(`select title from public.activities where id = $1`, [
      activityId,
    ])
    expect(rows[0]?.title).toBe(`${APPLICATION_DB_TEST_PREFIX}-manual-updated`)
  })

  it('DB-11 parallel identical calls produce one result', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'parallel-idem')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'parallel-idem')
    const idempotencyKey = uniqueKey('parallel-idem')
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 5, unit: 'kg', idempotencyKey: uniqueKey('create-parallel-idem') },
    )

    const params = {
      inventoryItemId: itemId,
      savedProductProfileId: profileId,
      areaId,
      applicationAmount: 1,
      applicationUnit: 'kg' as const,
      appliedAt: '2026-08-02T20:00:00.000Z',
      idempotencyKey,
      userId: user.id,
    }

    const [first, second] = await Promise.all([
      callApplicationRpc(auth, params),
      callApplicationRpc(auth, params),
    ])

    expect(first.error).toBeNull()
    expect(second.error).toBeNull()

    const parsedFirst = parseApplicationRpcSuccess(first.data)
    const parsedSecond = parseApplicationRpcSuccess(second.data)
    state.activityIds.push(parsedFirst.activityId)
    state.movementIds.push(parsedFirst.movementId)

    expect(parsedFirst.activityId).toBe(parsedSecond.activityId)
    expect(parsedFirst.movementId).toBe(parsedSecond.movementId)

    const { rows } = await pgClient.query(
      `select count(*)::int as count from public.fertilizer_stock_movements where activity_id = $1`,
      [parsedFirst.activityId],
    )
    expect(Number(rows[0]?.count)).toBe(1)
  })

  it('DB-12 parallel competing calls prevent double spend', async () => {
    state = createEmptyApplicationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'parallel-compete')
    const auth = await createAuthenticatedSupabaseClient(testConfig, user.email, user.password)
    const areaId = await insertApplicationTestArea(pgClient, state, user.id, 'parallel-compete')
    const { profileId, itemId } = await createInventoryItemForApplication(
      testConfig,
      pgClient,
      state,
      user,
      { initialQuantity: 1, unit: 'kg', idempotencyKey: uniqueKey('create-parallel-compete') },
    )

    const base = {
      inventoryItemId: itemId,
      savedProductProfileId: profileId,
      areaId,
      applicationAmount: 1,
      applicationUnit: 'kg' as const,
      appliedAt: '2026-08-02T21:00:00.000Z',
      userId: user.id,
    }

    const [first, second] = await Promise.all([
      callApplicationRpc(auth, { ...base, idempotencyKey: uniqueKey('compete-a') }),
      callApplicationRpc(auth, { ...base, idempotencyKey: uniqueKey('compete-b') }),
    ])

    const successes = [first, second].filter((entry) => entry.error == null)
    const failures = [first, second].filter((entry) => entry.error != null)

    expect(successes).toHaveLength(1)
    expect(failures).toHaveLength(1)
    expect(extractApplicationErrorCode(failures[0]!.error!.message)).toBe(
      'FERTILIZER_APPLICATION_INSUFFICIENT_STOCK',
    )

    const parsed = parseApplicationRpcSuccess(successes[0]!.data)
    state.activityIds.push(parsed.activityId)
    state.movementIds.push(parsed.movementId)
    expect(await computeContainerBalance(pgClient, itemId)).toBe(0)
  })
})
