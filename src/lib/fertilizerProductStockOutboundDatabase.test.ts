import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import {
  buildProductStockOutboundMovementIdempotencyKey,
} from './fertilizerProductStockOutboundRpcCore'
import {
  callProductStockIntakeRpc,
  callProductStockOutboundRpc,
  connectProductStockIntakeTestPg,
  createAdminSupabaseClient,
  createCreationDatabaseTestUser,
  createEmptyProductStockIntakeDatabaseTestState,
  createProductStockIntakeAuthenticatedClient,
  ensureProductStockIntakeMigrationsApplied,
  extractProductStockOutboundErrorCode,
  insertSavedProductProfileFixture,
  loadProductStockIntakeDatabaseTestConfig,
  parseProductStockIntakeRpcSuccess,
  parseProductStockOutboundRpcSuccess,
  PRODUCT_STOCK_DB_TEST_PREFIX,
  purgeProductStockIntakeDatabaseTestData,
  reloadPostgrestSchema,
  stopProductStockIntakeDatabaseTestEnvironment,
  trackProductStockIntakeResult,
  trackProductStockOutboundResult,
  withTestReplicationRole,
  type ProductStockIntakeDatabaseTestConfig,
  type ProductStockIntakeDatabaseTestState,
} from './fertilizerProductStockIntakeDatabaseTestHarness'

const config = loadProductStockIntakeDatabaseTestConfig()
const describeDb = config ? describe : describe.skip

async function seedCanonicalItem(input: {
  pgClient: Client
  authClient: Awaited<ReturnType<typeof createProductStockIntakeAuthenticatedClient>>
  state: ProductStockIntakeDatabaseTestState
  userId: string
  profileId: string
  quantity: number
  keySuffix: string
}) {
  const intake = await callProductStockIntakeRpc(input.authClient, {
    savedProductProfileId: input.profileId,
    baseUnit: 'kg',
    quantity: input.quantity,
    reason: 'initial_stock',
    idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-${input.keySuffix}-seed`,
  })

  expect(intake.error).toBeNull()
  const parsed = parseProductStockIntakeRpcSuccess(intake.data)
  trackProductStockIntakeResult(input.state, parsed)
  return parsed.inventoryItemId
}

describeDb('fertilizerProductStockOutboundDatabase', () => {
  let pgClient: Client
  let admin: ReturnType<typeof createAdminSupabaseClient>
  let state: ProductStockIntakeDatabaseTestState
  const testConfig = config as ProductStockIntakeDatabaseTestConfig

  beforeAll(async () => {
    pgClient = await connectProductStockIntakeTestPg(testConfig)
    await ensureProductStockIntakeMigrationsApplied(pgClient, testConfig)
    await reloadPostgrestSchema(pgClient, testConfig)
    admin = createAdminSupabaseClient(testConfig)
  }, 120_000)

  afterAll(async () => {
    await pgClient.end()
    await stopProductStockIntakeDatabaseTestEnvironment(testConfig)
  })

  afterEach(async () => {
    if (state) {
      await purgeProductStockIntakeDatabaseTestData(pgClient, state, admin)
    }
  })

  it('DB-O0 applies outbound migration', async () => {
    const { rows } = await pgClient.query(
      `select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'record_fertilizer_product_stock_outbound'`,
    )
    expect(rows.length).toBe(1)
  })

  it('DB-O1 gift_given creates one negative gifted_away movement', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'outbound-gift')
    const authClient = await createProductStockIntakeAuthenticatedClient(testConfig, user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const itemId = await seedCanonicalItem({
      pgClient,
      authClient,
      state,
      userId: user.id,
      profileId: profile.id,
      quantity: 5,
      keySuffix: 'gift',
    })

    const { data, error } = await callProductStockOutboundRpc(authClient, {
      inventoryItemId: itemId,
      quantity: 2,
      reason: 'gift_given',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-gift`,
    })

    expect(error).toBeNull()
    const parsed = parseProductStockOutboundRpcSuccess(data)
    trackProductStockOutboundResult(state, parsed)
    expect(parsed.quantityDelta).toBe(-2)
    expect(parsed.movementType).toBe('gifted_away')

    const { rows } = await pgClient.query(
      `select movement_type, quantity_delta
       from public.fertilizer_stock_movements
       where id = $1`,
      [parsed.movementId],
    )
    expect(rows[0]?.movement_type).toBe('gifted_away')
    expect(Number(rows[0]?.quantity_delta)).toBe(-2)
  })

  it('DB-O2 disposed and inventory_correction persist signed deltas', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'outbound-mix')
    const authClient = await createProductStockIntakeAuthenticatedClient(testConfig, user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const itemId = await seedCanonicalItem({
      pgClient,
      authClient,
      state,
      userId: user.id,
      profileId: profile.id,
      quantity: 10,
      keySuffix: 'mix',
    })

    const disposed = await callProductStockOutboundRpc(authClient, {
      inventoryItemId: itemId,
      quantity: 1,
      reason: 'disposed',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-disposed`,
    })
    expect(disposed.error).toBeNull()
    const disposedParsed = parseProductStockOutboundRpcSuccess(disposed.data)
    trackProductStockOutboundResult(state, disposedParsed)
    expect(disposedParsed.movementType).toBe('disposal')

    const correction = await callProductStockOutboundRpc(authClient, {
      inventoryItemId: itemId,
      quantity: -2,
      reason: 'inventory_correction',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-correction`,
    })
    expect(correction.error).toBeNull()
    const correctionParsed = parseProductStockOutboundRpcSuccess(correction.data)
    trackProductStockOutboundResult(state, correctionParsed)
    expect(correctionParsed.quantityDelta).toBe(-2)
  })

  it('DB-O3 rejects invalid reason, zero quantity and insufficient stock', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'outbound-reject')
    const authClient = await createProductStockIntakeAuthenticatedClient(testConfig, user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const itemId = await seedCanonicalItem({
      pgClient,
      authClient,
      state,
      userId: user.id,
      profileId: profile.id,
      quantity: 1,
      keySuffix: 'reject',
    })

    const invalidReason = await callProductStockOutboundRpc(authClient, {
      inventoryItemId: itemId,
      quantity: 1,
      reason: 'purchase' as never,
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-bad-reason`,
    })
    expect(extractProductStockOutboundErrorCode(invalidReason.error?.message ?? '')).toBe(
      'INVENTORY_OUTBOUND_REASON_INVALID',
    )

    const zero = await callProductStockOutboundRpc(authClient, {
      inventoryItemId: itemId,
      quantity: 0,
      reason: 'inventory_correction',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-zero`,
    })
    expect(extractProductStockOutboundErrorCode(zero.error?.message ?? '')).toBe(
      'INVENTORY_OUTBOUND_QUANTITY_INVALID',
    )

    const insufficient = await callProductStockOutboundRpc(authClient, {
      inventoryItemId: itemId,
      quantity: 5,
      reason: 'disposed',
      idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-insufficient`,
    })
    expect(extractProductStockOutboundErrorCode(insufficient.error?.message ?? '')).toBe(
      'INVENTORY_OUTBOUND_INSUFFICIENT_STOCK',
    )
  })

  it('DB-O4 supports replay, conflict and deterministic movement key', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'outbound-idem')
    const authClient = await createProductStockIntakeAuthenticatedClient(testConfig, user)
    const profile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const itemId = await seedCanonicalItem({
      pgClient,
      authClient,
      state,
      userId: user.id,
      profileId: profile.id,
      quantity: 8,
      keySuffix: 'idem',
    })

    const key = `${PRODUCT_STOCK_DB_TEST_PREFIX}-idem-key`
    const first = await callProductStockOutboundRpc(authClient, {
      inventoryItemId: itemId,
      quantity: 1,
      reason: 'gift_given',
      idempotencyKey: key,
    })
    expect(first.error).toBeNull()
    const firstParsed = parseProductStockOutboundRpcSuccess(first.data)
    trackProductStockOutboundResult(state, firstParsed)

    const replay = await callProductStockOutboundRpc(authClient, {
      inventoryItemId: itemId,
      quantity: 1,
      reason: 'gift_given',
      idempotencyKey: key,
    })
    expect(replay.error).toBeNull()
    const replayParsed = parseProductStockOutboundRpcSuccess(replay.data)
    expect(replayParsed.idempotencyReplay).toBe(true)
    expect(replayParsed.movementId).toBe(firstParsed.movementId)

    const conflict = await callProductStockOutboundRpc(authClient, {
      inventoryItemId: itemId,
      quantity: 2,
      reason: 'gift_given',
      idempotencyKey: key,
    })
    expect(extractProductStockOutboundErrorCode(conflict.error?.message ?? '')).toBe(
      'INVENTORY_OUTBOUND_IDEMPOTENCY_CONFLICT',
    )

    const { rows: movementRows } = await pgClient.query(
      `select inventory_idempotency_key
       from public.fertilizer_stock_movements
       where id = $1`,
      [firstParsed.movementId],
    )
    expect(movementRows[0]?.inventory_idempotency_key).toBe(
      buildProductStockOutboundMovementIdempotencyKey(firstParsed.operationId),
    )
  })

  it('DB-O5 rejects direct client writes to outbound receipts', async () => {
    state = createEmptyProductStockIntakeDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'outbound-rls')

    await expect(
      withTestReplicationRole(pgClient, async () => {
        await pgClient.query(
          `insert into public.fertilizer_product_stock_outbound_receipts (
            user_id, idempotency_key, payload_fingerprint, inventory_item_id, outbound_reason, quantity_delta
          ) values ($1, $2, $3, $4, $5, $6)`,
          [user.id, 'blocked-key', 'fp', user.id, 'gift_given', -1],
        )
      }),
    ).rejects.toThrow()
  })
})
