import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { validateFertilizerProductStockIntake } from './fertilizerProductStockCore'
import {
  buildProductStockIntakeMovementIdempotencyKey,
  mapRecordFertilizerProductStockIntakeRpcResult,
} from './fertilizerProductStockIntakeRpcCore'
import {
  callProductStockIntakeRpc,
  connectProductStockIntakeTestPg,
  countProductStockArtifacts,
  createAdminSupabaseClient,
  createAuthenticatedSupabaseClient,
  createCreationDatabaseTestUser,
  createEmptyProductStockIntakeDatabaseTestState,
  ensureProductStockIntakeMigrationsApplied,
  extractProductStockIntakeErrorCode,
  insertSavedProductProfileFixture,
  loadProductStockIntakeDatabaseTestConfig,
  parseProductStockIntakeRpcSuccess,
  PRODUCT_STOCK_DB_TEST_PREFIX,
  purgeProductStockIntakeDatabaseTestData,
  reloadPostgrestSchema,
  trackProductStockIntakeResult,
  withTestReplicationRole,
  type ProductStockIntakeDatabaseTestState,
} from './fertilizerProductStockIntakeDatabaseTestHarness'
import type { CreationDatabaseTestConfig } from './fertilizerInventoryCreationDatabaseTestHarness'

const config = loadProductStockIntakeDatabaseTestConfig()
const describeDb = config ? describe : describe.skip

describeDb('fertilizerProductStockIntakeDatabase', () => {
  let pgClient: Client
  let admin: ReturnType<typeof createAdminSupabaseClient>
  let state: ProductStockIntakeDatabaseTestState
  const testConfig = config as CreationDatabaseTestConfig

  beforeAll(async () => {
    pgClient = await connectProductStockIntakeTestPg(testConfig)
    await ensureProductStockIntakeMigrationsApplied(pgClient)
    await reloadPostgrestSchema(pgClient)
    admin = createAdminSupabaseClient(testConfig)
  }, 120_000)

  afterAll(async () => {
    await pgClient.end()
  })

  afterEach(async () => {
    if (state) {
      await purgeProductStockIntakeDatabaseTestData(pgClient, state, admin)
    }
  })

  it('DB-0 applies product stock intake migration', async () => {
    const { rows: stockKind } = await pgClient.query(
      `select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name = 'fertilizer_containers'
         and column_name = 'stock_kind'`,
    )
    const { rows: receiptTable } = await pgClient.query(
      `select 1 from information_schema.tables
       where table_schema = 'public'
         and table_name = 'fertilizer_product_stock_intake_receipts'`,
    )
    const { rows: uniqueIndex } = await pgClient.query(
      `select 1 from pg_indexes
       where schemaname = 'public'
         and indexname = 'fertilizer_containers_product_stock_active_unique_idx'`,
    )
    const { rows: rpc } = await pgClient.query(
      `select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'record_fertilizer_product_stock_intake'`,
    )

    expect(stockKind.length).toBe(1)
    expect(receiptTable.length).toBe(1)
    expect(uniqueIndex.length).toBe(1)
    expect(rpc.length).toBe(1)
  })

  it('DB-1 first intake creates one product_stock item and one movement', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'first-intake')
    const authClient = await createAuthenticatedSupabaseClient(
      testConfig,
      user.email,
      user.password,
    )
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })

    const { data, error } = await callProductStockIntakeRpc(authClient, {
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      quantity: 12.5,
      reason: 'purchase',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-first`,
    })

    expect(error).toBeNull()
    const parsed = parseProductStockIntakeRpcSuccess(data)
    trackProductStockIntakeResult(state, parsed)

    expect(parsed.itemCreated).toBe(true)
    expect(parsed.idempotencyReplay).toBe(false)
    expect(parsed.quantityDelta).toBe(12.5)

    const counts = await countProductStockArtifacts(pgClient, {
      userId: user.id,
      profileId: profile.id,
    })
    expect(counts.productStockContainers).toBe(1)
    expect(counts.movements).toBe(1)
    expect(counts.receipts).toBe(1)

    const { rows: itemRows } = await pgClient.query(
      `select stock_kind, package_size_value, package_size_unit
       from public.fertilizer_containers where id = $1`,
      [parsed.inventoryItemId],
    )
    expect(itemRows[0]?.stock_kind).toBe('product_stock')
    expect(itemRows[0]?.package_size_value).toBeNull()
  })

  it('DB-2 second intake reuses the same item and adds another movement', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'second-intake')
    const authClient = await createAuthenticatedSupabaseClient(
      testConfig,
      user.email,
      user.password,
    )
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })

    const first = await callProductStockIntakeRpc(authClient, {
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      quantity: 5,
      reason: 'initial_stock',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-second-a`,
    })
    expect(first.error).toBeNull()
    const firstParsed = parseProductStockIntakeRpcSuccess(first.data)
    trackProductStockIntakeResult(state, firstParsed)

    const second = await callProductStockIntakeRpc(authClient, {
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      quantity: 3,
      reason: 'purchase',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-second-b`,
    })
    expect(second.error).toBeNull()
    const secondParsed = parseProductStockIntakeRpcSuccess(second.data)
    trackProductStockIntakeResult(state, secondParsed)

    expect(secondParsed.inventoryItemId).toBe(firstParsed.inventoryItemId)
    expect(secondParsed.itemCreated).toBe(false)

    const counts = await countProductStockArtifacts(pgClient, {
      userId: user.id,
      profileId: profile.id,
    })
    expect(counts.productStockContainers).toBe(1)
    expect(counts.movements).toBe(2)
  })

  it('DB-3 idempotent replay returns same ids without duplicate movement', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'idempotent-replay')
    const authClient = await createAuthenticatedSupabaseClient(
      testConfig,
      user.email,
      user.password,
    )
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'liquid',
    })
    const idempotencyKey = `${PRODUCT_STOCK_DB_TEST_PREFIX}-replay`
    const params = {
      savedProductProfileId: profile.id,
      baseUnit: 'ml' as const,
      quantity: 1.5,
      reason: 'gift_received' as const,
      idempotencyKey,
    }

    const first = await callProductStockIntakeRpc(authClient, params)
    expect(first.error).toBeNull()
    const firstParsed = parseProductStockIntakeRpcSuccess(first.data)
    trackProductStockIntakeResult(state, firstParsed)

    const second = await callProductStockIntakeRpc(authClient, params)
    expect(second.error).toBeNull()
    const secondParsed = parseProductStockIntakeRpcSuccess(second.data)

    expect(secondParsed.idempotencyReplay).toBe(true)
    expect(secondParsed.inventoryItemId).toBe(firstParsed.inventoryItemId)
    expect(secondParsed.movementId).toBe(firstParsed.movementId)

    const counts = await countProductStockArtifacts(pgClient, {
      userId: user.id,
      profileId: profile.id,
      idempotencyKey,
    })
    expect(counts.receipts).toBe(1)
    expect(counts.movements).toBe(1)
  })

  it('DB-4 same idempotency key with different payload conflicts', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'idempotent-conflict')
    const authClient = await createAuthenticatedSupabaseClient(
      testConfig,
      user.email,
      user.password,
    )
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const idempotencyKey = `${PRODUCT_STOCK_DB_TEST_PREFIX}-conflict`

    const first = await callProductStockIntakeRpc(authClient, {
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      quantity: 2,
      reason: 'purchase',
      idempotencyKey,
    })
    expect(first.error).toBeNull()
    trackProductStockIntakeResult(state, parseProductStockIntakeRpcSuccess(first.data))

    const second = await callProductStockIntakeRpc(authClient, {
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      quantity: 3,
      reason: 'purchase',
      idempotencyKey,
    })

    expect(second.error).not.toBeNull()
    expect(extractProductStockIntakeErrorCode(second.error?.message ?? '')).toBe(
      'INVENTORY_INTAKE_IDEMPOTENCY_CONFLICT',
    )
  })

  it('DB-5 rejects invalid quantity and reason', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'invalid-inputs')
    const authClient = await createAuthenticatedSupabaseClient(
      testConfig,
      user.email,
      user.password,
    )
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })

    const zero = await callProductStockIntakeRpc(authClient, {
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      quantity: 0,
      reason: 'purchase',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-zero`,
    })
    expect(extractProductStockIntakeErrorCode(zero.error?.message ?? '')).toBe(
      'INVENTORY_INTAKE_QUANTITY_INVALID',
    )

    const badReason = await callProductStockIntakeRpc(authClient, {
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      quantity: 1,
      reason: 'fertilization' as 'purchase',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-bad-reason`,
    })
    expect(extractProductStockIntakeErrorCode(badReason.error?.message ?? '')).toBe(
      'INVENTORY_INTAKE_REASON_INVALID',
    )

    const unitMismatch = await callProductStockIntakeRpc(authClient, {
      savedProductProfileId: profile.id,
      baseUnit: 'ml',
      quantity: 1,
      reason: 'purchase',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-unit-mismatch`,
    })
    expect(extractProductStockIntakeErrorCode(unitMismatch.error?.message ?? '')).toBe(
      'INVENTORY_INTAKE_UNIT_MISMATCH',
    )
  })

  it('DB-6 parallel first intakes with different keys create one item and two movements', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'parallel-first')
    const authClient = await createAuthenticatedSupabaseClient(
      testConfig,
      user.email,
      user.password,
    )
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })

    const base = {
      savedProductProfileId: profile.id,
      baseUnit: 'kg' as const,
      quantity: 4,
      reason: 'purchase' as const,
    }

    const results = await Promise.all([
      callProductStockIntakeRpc(authClient, {
        ...base,
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-parallel-a`,
      }),
      callProductStockIntakeRpc(authClient, {
        ...base,
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-parallel-b`,
      }),
    ])

    for (const result of results) {
      expect(result.error).toBeNull()
      trackProductStockIntakeResult(state, parseProductStockIntakeRpcSuccess(result.data))
    }

    const itemIds = results.map((result) =>
      parseProductStockIntakeRpcSuccess(result.data).inventoryItemId,
    )
    expect(new Set(itemIds).size).toBe(1)

    const counts = await countProductStockArtifacts(pgClient, {
      userId: user.id,
      profileId: profile.id,
    })
    expect(counts.productStockContainers).toBe(1)
    expect(counts.movements).toBe(2)
  })

  it('DB-7 rejects foreign saved product profile', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const owner = await createCreationDatabaseTestUser(admin, state, 'owner')
    const other = await createCreationDatabaseTestUser(admin, state, 'other')
    const otherClient = await createAuthenticatedSupabaseClient(
      testConfig,
      other.email,
      other.password,
    )
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: owner.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })

    const result = await callProductStockIntakeRpc(otherClient, {
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      quantity: 1,
      reason: 'purchase',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-foreign-profile`,
    })

    expect(extractProductStockIntakeErrorCode(result.error?.message ?? '')).toBe(
      'INVENTORY_INTAKE_ACCESS_DENIED',
    )
  })

  it('DB-8 legacy creation path can coexist with product_stock intake', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'legacy-coexist')
    const authClient = await createAuthenticatedSupabaseClient(
      testConfig,
      user.email,
      user.password,
    )
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })

    await withTestReplicationRole(pgClient, async () => {
      await pgClient.query(
        `insert into public.fertilizer_containers (
           user_id, saved_product_profile_id, access_kind, base_unit,
           package_size_value, package_size_unit, stock_kind
         ) values ($1, $2, 'authenticated_user', 'kg', 25, 'kg', null)`,
        [user.id, profile.id],
      )
    })

    const intake = await callProductStockIntakeRpc(authClient, {
      savedProductProfileId: profile.id,
      baseUnit: 'kg',
      quantity: 2,
      reason: 'purchase',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-legacy-coexist`,
    })
    expect(intake.error).toBeNull()
    trackProductStockIntakeResult(state, parseProductStockIntakeRpcSuccess(intake.data))

    const { rows } = await pgClient.query(
      `select count(*)::int as count
       from public.fertilizer_containers
       where user_id = $1 and saved_product_profile_id = $2 and archived_at is null`,
      [user.id, profile.id],
    )
    expect(rows[0]?.count).toBeGreaterThanOrEqual(2)
  })
})

describe('fertilizerProductStockIntake domain adapter', () => {
  it('maps RPC result through domain validation contract', () => {
    const validated = validateFertilizerProductStockIntake({
      userId: 'user-1',
      savedProductProfileId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      baseUnit: 'kg',
      quantity: 2,
      reason: 'purchase',
    })

    const mapped = mapRecordFertilizerProductStockIntakeRpcResult({
      operation_id: '11111111-2222-4333-8444-555555555555',
      idempotency_key: 'product-stock-intake:test',
      inventory_item_id: '22222222-3333-4444-8555-666666666666',
      movement_id: '33333333-4444-4555-8666-777777777777',
      saved_product_profile_id: validated.stockIdentity.savedProductProfileId,
      base_unit: validated.baseUnit,
      quantity_delta: validated.quantityDelta,
      reason: validated.reason,
      movement_at: '2026-08-02T12:00:00.000Z',
      item_created: false,
      idempotency_replay: false,
    })

    expect(mapped.quantityDelta).toBe(validated.quantityDelta)
    expect(buildProductStockIntakeMovementIdempotencyKey(mapped.operationId)).toContain(
      mapped.operationId,
    )
  })
})
