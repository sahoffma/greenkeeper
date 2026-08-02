import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import {
  buildProductStockOutboundMovementIdempotencyKey,
} from './fertilizerProductStockOutboundRpcCore'
import {
  insertCanonicalProductStockFixture,
  insertLegacyContainerFixture,
  insertLegacyMovementFixture,
} from './fertilizerProductStockLegacyMigrationDatabaseTestHarness'
import {
  callGetActiveProductStockItemViaRpc,
  callListActiveProductStockViaRpc,
  computeEffectiveBalanceDirect,
  parseActiveProductStockItemPayload,
  parseActiveProductStockListPayload,
} from './fertilizerProductStockReadDatabaseTestHarness'
import { insertDraftProductProfileFixture } from './fertilizerInventoryCreationDatabaseTestHarness'
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
import type { LocalProductStockIntakeAuthClient } from './fertilizerProductStockIntakeLocalPostgresHarness'
import type { LegacyMigrationDatabaseTestState } from './fertilizerProductStockLegacyMigrationDatabaseTestHarness'

const config = loadProductStockIntakeDatabaseTestConfig()
const describeDb = config ? describe : describe.skip

function asLegacyMigrationState(
  state: ProductStockIntakeDatabaseTestState,
): LegacyMigrationDatabaseTestState {
  const legacyState = state as ProductStockIntakeDatabaseTestState & LegacyMigrationDatabaseTestState
  legacyState.migrationReceiptIds ??= []
  legacyState.legacyContainerIds ??= []
  legacyState.canonicalContainerIds ??= []
  legacyState.movementIds ??= []
  legacyState.areaIds ??= []
  legacyState.applicationIdempotencyKeys ??= []
  return legacyState
}

const REJECTED_OUTBOUND_REASONS = [
  'initial_stock',
  'purchase',
  'gift_received',
  'application',
  'legacy_balance_migration',
  'unknown_reason',
  '',
] as const

type OutboundArtifactCounts = {
  receipts: number
  movements: number
  balance: number
}

async function cleanupOutboundReceiptsBeforePurge(
  pgClient: Client,
  state: ProductStockIntakeDatabaseTestState,
): Promise<void> {
  const receiptIds = [...new Set(state.intakeReceiptIds)]
  if (receiptIds.length === 0) {
    return
  }

  await pgClient.query('begin')
  try {
    await pgClient.query(`set local session_replication_role = replica`)
    await pgClient.query(
      `delete from public.fertilizer_product_stock_outbound_receipts where id = any($1::uuid[])`,
      [receiptIds],
    )
    await pgClient.query('commit')
  } catch (error) {
    await pgClient.query('rollback').catch(() => undefined)
    throw error
  }
}

async function withAuthenticatedClientSession(
  authClient: LocalProductStockIntakeAuthClient,
  run: (client: Client) => Promise<void>,
): Promise<void> {
  const client = await authClient.pool.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authClient.userId])
    await client.query('set local role authenticated')
    await run(client)
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

function expectInsufficientStockError(message: string | undefined): void {
  expect(message ?? '').toMatch(
    /INVENTORY_OUTBOUND_INSUFFICIENT_STOCK|INVENTORY_NEGATIVE_BALANCE|deadlock detected/i,
  )
}

async function rejectDirectAuthenticatedWrite(run: Promise<unknown>): Promise<void> {
  await expect(run).rejects.toThrow(/permission denied|42501|insufficient_privilege/i)
}

async function callProductStockOutboundRpcRaw(
  authClient: LocalProductStockIntakeAuthClient,
  params: {
    inventoryItemId: string
    quantity: number | string
    reason: string | null
    idempotencyKey: string
    note?: string | null
    movementAt?: string | null
  },
): Promise<{ data: unknown; error: { message: string } | null }> {
  const client = await authClient.pool.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authClient.userId])
    const { rows } = await client.query(
      `select public.record_fertilizer_product_stock_outbound(
        $1::uuid, $2::numeric, $3::text, $4::text, $5::timestamptz, $6::text
      ) as result`,
      [
        params.inventoryItemId,
        params.quantity,
        params.reason,
        params.idempotencyKey,
        params.movementAt ?? null,
        params.note ?? null,
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

async function callProductStockOutboundRpcParallel(
  authClient: LocalProductStockIntakeAuthClient,
  params: {
    inventoryItemId: string
    quantity: number
    reason: 'gift_given' | 'disposed' | 'inventory_correction'
    idempotencyKey: string
    note?: string | null
  },
): Promise<{ data: unknown; error: { message: string } | null }> {
  const client = await authClient.pool.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authClient.userId])
    const pending = client.query(
      `select public.record_fertilizer_product_stock_outbound(
        $1::uuid, $2::numeric, $3::text, $4::text, $5::timestamptz, $6::text
      ) as result`,
      [
        params.inventoryItemId,
        params.quantity,
        params.reason,
        params.idempotencyKey,
        null,
        params.note ?? null,
      ],
    )
    const { rows } = await pending
    await client.query('commit')
    return { data: rows[0]?.result ?? null, error: null }
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    return { data: null, error: { message: (error as Error).message } }
  } finally {
    client.release()
  }
}

async function countOutboundArtifacts(
  pgClient: Client,
  userId: string,
  itemId: string,
): Promise<OutboundArtifactCounts> {
  const [{ rows: receiptRows }, { rows: movementRows }, balance] = await Promise.all([
    pgClient.query(
      `select count(*)::int as count
       from public.fertilizer_product_stock_outbound_receipts
       where user_id = $1 and inventory_item_id = $2`,
      [userId, itemId],
    ),
    pgClient.query(
      `select count(*)::int as count
       from public.fertilizer_stock_movements
       where user_id = $1 and container_id = $2`,
      [userId, itemId],
    ),
    computeEffectiveBalanceDirect(pgClient, itemId, userId),
  ])

  return {
    receipts: Number(receiptRows[0]?.count ?? 0),
    movements: Number(movementRows[0]?.count ?? 0),
    balance,
  }
}

async function expectOutboundRejected(input: {
  pgClient: Client
  userId: string
  itemId: string
  result: { data: unknown; error: { message: string } | null }
  expectedCode: string
  balanceBefore: number
  movementCountBefore: number
  outboundReceiptCountBefore?: number
  ownerUserId?: string
}): Promise<void> {
  expect(extractProductStockOutboundErrorCode(input.result.error?.message ?? '')).toBe(
    input.expectedCode,
  )
  expect(input.result.data).toBeNull()

  const ownerUserId = input.ownerUserId ?? input.userId
  const artifacts = await countOutboundArtifacts(input.pgClient, ownerUserId, input.itemId)
  expect(artifacts.receipts).toBe(input.outboundReceiptCountBefore ?? 0)
  expect(artifacts.movements).toBe(input.movementCountBefore)
  expect(artifacts.balance).toBe(input.balanceBefore)
}

async function seedCanonicalItem(input: {
  authClient: LocalProductStockIntakeAuthClient
  state: ProductStockIntakeDatabaseTestState
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

async function insertInactiveContainerFixture(
  pgClient: Client,
  state: ProductStockIntakeDatabaseTestState,
  options: {
    userId: string
    savedProductProfileId: string | null
    baseUnit: 'kg' | 'ml' | null
    stockKind?: 'product_stock' | 'legacy_container' | null
    archivedAt?: string | null
    supersededByContainerId?: string | null
  },
): Promise<string> {
  const id = crypto.randomUUID()

  await withTestReplicationRole(pgClient, async () => {
    await pgClient.query(
      `insert into public.fertilizer_containers (
        id, user_id, saved_product_profile_id, access_kind, base_unit, stock_kind,
        archived_at, superseded_by_container_id, package_size_value, package_size_unit
      ) values (
        $1, $2, $3, 'authenticated_user', $4::text, $5, $6, $7,
        case when $4::text is null then null else 10 end,
        $4::text
      )`,
      [
        id,
        options.userId,
        options.savedProductProfileId,
        options.baseUnit,
        options.stockKind ?? null,
        options.archivedAt ?? null,
        options.supersededByContainerId ?? null,
      ],
    )
  })

  state.containerIds.push(id)
  return id
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
      await cleanupOutboundReceiptsBeforePurge(pgClient, state)
      await purgeProductStockIntakeDatabaseTestData(pgClient, state, admin)
    }
  })

  describe('Migration and Schema', () => {
    it('DB-O0 applies outbound migration with RLS, grants and secure RPC', async () => {
      const { rows: rpcRows } = await pgClient.query(
        `select p.prosecdef, p.proconfig
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'record_fertilizer_product_stock_outbound'`,
      )
      expect(rpcRows.length).toBe(1)
      expect(rpcRows[0]?.prosecdef).toBe(true)
      expect((rpcRows[0]?.proconfig as string[] | null ?? []).join(' ')).toMatch(/search_path=public/)

      const { rows: sourceRows } = await pgClient.query(
        `select pg_get_functiondef(p.oid) as definition
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public'
           and p.proname = 'record_fertilizer_product_stock_outbound'`,
      )
      expect(sourceRows[0]?.definition).toMatch(/INVENTORY_OUTBOUND_PROFILE_MISSING/)
      expect(sourceRows[0]?.definition).toMatch(/INVENTORY_OUTBOUND_PROFILE_INVALID/)
      expect(sourceRows[0]?.definition).toMatch(/INVENTORY_OUTBOUND_PROFILE_ACCESS_DENIED/)
      expect(sourceRows[0]?.definition).toMatch(/profile_status <> 'saved'/)
      expect(sourceRows[0]?.definition).toMatch(/source <> 'enrichment'/)

      const { rows: rlsRows } = await pgClient.query(
        `select c.relrowsecurity
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public'
           and c.relname = 'fertilizer_product_stock_outbound_receipts'`,
      )
      expect(rlsRows[0]?.relrowsecurity).toBe(true)

      const { rows: grantRows } = await pgClient.query(
        `select grantee, privilege_type
         from information_schema.role_table_grants
         where table_schema = 'public'
           and table_name = 'fertilizer_product_stock_outbound_receipts'
           and grantee in ('authenticated', 'anon', 'PUBLIC')
         order by grantee, privilege_type`,
      )
      expect(grantRows).toEqual([])

      const { rows: executeRows } = await pgClient.query(
        `select grantee
         from information_schema.routine_privileges
         where routine_schema = 'public'
           and routine_name = 'record_fertilizer_product_stock_outbound'
           and privilege_type = 'EXECUTE'
         order by grantee`,
      )
      expect(executeRows.map((row) => row.grantee)).toEqual(['authenticated', 'postgres', 'service_role'])
    })
  })

  describe('Allowed real outflows', () => {
    it('DB-O1 gift_given creates one negative gifted_away movement', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const user = await createCreationDatabaseTestUser(admin, state, 'outbound-gift')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemId = await seedCanonicalItem({
        authClient,
        state,
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

      const artifacts = await countOutboundArtifacts(pgClient, user.id, itemId)
      expect(artifacts.receipts).toBe(1)
      expect(artifacts.movements).toBe(2)
      expect(artifacts.balance).toBe(3)
    })

    it('DB-O2 disposed creates one negative disposal movement', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const user = await createCreationDatabaseTestUser(admin, state, 'outbound-disposed')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemId = await seedCanonicalItem({
        authClient,
        state,
        profileId: profile.id,
        quantity: 5,
        keySuffix: 'disposed',
      })

      const disposed = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: 5,
        reason: 'disposed',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-disposed`,
      })
      expect(disposed.error).toBeNull()
      const disposedParsed = parseProductStockOutboundRpcSuccess(disposed.data)
      trackProductStockOutboundResult(state, disposedParsed)
      expect(disposedParsed.movementType).toBe('disposal')
      expect(disposedParsed.quantityDelta).toBe(-5)

      const artifacts = await countOutboundArtifacts(pgClient, user.id, itemId)
      expect(artifacts.receipts).toBe(1)
      expect(artifacts.balance).toBe(0)
    })
  })

  describe('Inventory correction', () => {
    it('DB-O3a positive inventory_correction increases balance with one receipt and movement', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const user = await createCreationDatabaseTestUser(admin, state, 'corr-pos')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemId = await seedCanonicalItem({
        authClient,
        state,
        profileId: profile.id,
        quantity: 8,
        keySuffix: 'corr-pos',
      })

      const key = `${PRODUCT_STOCK_DB_TEST_PREFIX}-corr-pos`
      const correction = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: 2,
        reason: 'inventory_correction',
        idempotencyKey: key,
      })
      expect(correction.error).toBeNull()
      const parsed = parseProductStockOutboundRpcSuccess(correction.data)
      trackProductStockOutboundResult(state, parsed)
      expect(parsed.quantityDelta).toBe(2)
      expect(parsed.reason).toBe('inventory_correction')

      const { rows } = await pgClient.query(
        `select movement_type, quantity_delta
         from public.fertilizer_stock_movements
         where id = $1`,
        [parsed.movementId],
      )
      expect(rows[0]?.movement_type).toBe('inventory_correction')
      expect(Number(rows[0]?.quantity_delta)).toBe(2)

      const artifacts = await countOutboundArtifacts(pgClient, user.id, itemId)
      expect(artifacts.receipts).toBe(1)
      expect(artifacts.movements).toBe(2)
      expect(artifacts.balance).toBe(10)

      const replay = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: 2,
        reason: 'inventory_correction',
        idempotencyKey: key,
      })
      expect(replay.error).toBeNull()
      expect(parseProductStockOutboundRpcSuccess(replay.data).idempotencyReplay).toBe(true)

      const afterReplay = await countOutboundArtifacts(pgClient, user.id, itemId)
      expect(afterReplay.receipts).toBe(1)
      expect(afterReplay.movements).toBe(2)
      expect(afterReplay.balance).toBe(10)
    })

    it('DB-O3b negative inventory_correction reduces balance and rejects insufficient stock', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const user = await createCreationDatabaseTestUser(admin, state, 'corr-neg')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemId = await seedCanonicalItem({
        authClient,
        state,
        profileId: profile.id,
        quantity: 10,
        keySuffix: 'corr-neg',
      })

      const { rows: historicalBefore } = await pgClient.query(
        `select id, quantity_delta
         from public.fertilizer_stock_movements
         where container_id = $1
         order by movement_at, id`,
        [itemId],
      )

      const correction = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: -2,
        reason: 'inventory_correction',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-corr-neg`,
      })
      expect(correction.error).toBeNull()
      const parsed = parseProductStockOutboundRpcSuccess(correction.data)
      trackProductStockOutboundResult(state, parsed)
      expect(parsed.quantityDelta).toBe(-2)

      const { rows: historicalAfterCorrection } = await pgClient.query(
        `select id, quantity_delta
         from public.fertilizer_stock_movements
         where container_id = $1
         order by movement_at, id`,
        [itemId],
      )
      const beforeById = new Map(
        historicalBefore.map((row) => [String(row.id), String(row.quantity_delta)]),
      )
      for (const row of historicalAfterCorrection) {
        const previous = beforeById.get(String(row.id))
        if (previous !== undefined) {
          expect(String(row.quantity_delta)).toBe(previous)
        }
      }

      const insufficient = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: -20,
        reason: 'inventory_correction',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-corr-insufficient`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId,
        result: insufficient,
        expectedCode: 'INVENTORY_OUTBOUND_INSUFFICIENT_STOCK',
        balanceBefore: 8,
        movementCountBefore: 2,
        outboundReceiptCountBefore: 1,
      })
    })
  })

  describe('Reason and quantity validation', () => {
    it('DB-O4 rejects every disallowed reason without persistence', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const user = await createCreationDatabaseTestUser(admin, state, 'reasons')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemId = await seedCanonicalItem({
        authClient,
        state,
        profileId: profile.id,
        quantity: 5,
        keySuffix: 'reasons',
      })
      const balanceBefore = await computeEffectiveBalanceDirect(pgClient, itemId, user.id)
      const movementCountBefore = 1

      for (const reason of REJECTED_OUTBOUND_REASONS) {
        const result = await callProductStockOutboundRpcRaw(authClient, {
          inventoryItemId: itemId,
          quantity: 1,
          reason,
          idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-reason-${reason || 'empty'}`,
        })
        await expectOutboundRejected({
          pgClient,
          userId: user.id,
          itemId,
          result,
          expectedCode: 'INVENTORY_OUTBOUND_REASON_INVALID',
          balanceBefore,
          movementCountBefore,
        })
      }

      const nullReason = await callProductStockOutboundRpcRaw(authClient, {
        inventoryItemId: itemId,
        quantity: 1,
        reason: null,
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-reason-null`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId,
        result: nullReason,
        expectedCode: 'INVENTORY_OUTBOUND_REASON_INVALID',
        balanceBefore,
        movementCountBefore,
      })
    })

    it('DB-O5 rejects zero quantity, wrong signs and invalid numeric input', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const user = await createCreationDatabaseTestUser(admin, state, 'quantity')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemId = await seedCanonicalItem({
        authClient,
        state,
        profileId: profile.id,
        quantity: 5,
        keySuffix: 'quantity',
      })
      const balanceBefore = await computeEffectiveBalanceDirect(pgClient, itemId, user.id)
      const movementCountBefore = 1

      const zero = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: 0,
        reason: 'inventory_correction',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-zero`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId,
        result: zero,
        expectedCode: 'INVENTORY_OUTBOUND_QUANTITY_INVALID',
        balanceBefore,
        movementCountBefore,
      })

      const giftNegative = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: -1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-gift-negative`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId,
        result: giftNegative,
        expectedCode: 'INVENTORY_OUTBOUND_QUANTITY_INVALID',
        balanceBefore,
        movementCountBefore,
      })

      const disposedNegative = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: -1,
        reason: 'disposed',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-disposed-negative`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId,
        result: disposedNegative,
        expectedCode: 'INVENTORY_OUTBOUND_QUANTITY_INVALID',
        balanceBefore,
        movementCountBefore,
      })

      const nanQuantity = await callProductStockOutboundRpcRaw(authClient, {
        inventoryItemId: itemId,
        quantity: 'NaN',
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-nan`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId,
        result: nanQuantity,
        expectedCode: 'INVENTORY_OUTBOUND_QUANTITY_INVALID',
        balanceBefore,
        movementCountBefore,
      })

      const insufficient = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: 10,
        reason: 'disposed',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-insufficient`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId,
        result: insufficient,
        expectedCode: 'INVENTORY_OUTBOUND_INSUFFICIENT_STOCK',
        balanceBefore,
        movementCountBefore,
      })
    })
  })

  describe('Item and profile eligibility', () => {
    it('DB-O6 rejects archived, superseded, legacy, null stock_kind and foreign items', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const legacyState = asLegacyMigrationState(state)
      const user = await createCreationDatabaseTestUser(admin, state, 'eligibility-owner')
      const other = await createCreationDatabaseTestUser(admin, state, 'eligibility-other')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const otherAuthClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        other,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const otherProfile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: other.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })

      const archivedId = await insertInactiveContainerFixture(pgClient, state, {
        userId: user.id,
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
        stockKind: 'product_stock',
      })
      await insertLegacyMovementFixture(pgClient, legacyState, {
        containerId: archivedId,
        userId: user.id,
        quantityDelta: 4,
        unit: 'kg',
      })
      await pgClient.query(
        `update public.fertilizer_containers
         set archived_at = $2
         where id = $1`,
        [archivedId, '2026-08-01T12:00:00.000Z'],
      )

      let result = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: archivedId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-archived`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId: archivedId,
        result,
        expectedCode: 'INVENTORY_OUTBOUND_ITEM_INACTIVE',
        balanceBefore: 4,
        movementCountBefore: 1,
      })

      const canonicalId = await insertCanonicalProductStockFixture(pgClient, legacyState, {
        userId: user.id,
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
      })
      await insertLegacyMovementFixture(pgClient, legacyState, {
        containerId: canonicalId,
        userId: user.id,
        quantityDelta: 4,
        unit: 'kg',
      })
      const supersededId = await insertLegacyContainerFixture(pgClient, legacyState, {
        userId: user.id,
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
        supersededByContainerId: canonicalId,
      })

      result = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: supersededId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-superseded`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId: supersededId,
        result,
        expectedCode: 'INVENTORY_OUTBOUND_ITEM_INACTIVE',
        balanceBefore: 0,
        movementCountBefore: 0,
      })

      const legacyId = await insertLegacyContainerFixture(pgClient, legacyState, {
        userId: user.id,
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
        stockKind: 'legacy_container',
      })
      await insertLegacyMovementFixture(pgClient, legacyState, {
        containerId: legacyId,
        userId: user.id,
        quantityDelta: 3,
        unit: 'kg',
      })
      result = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: legacyId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-legacy`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId: legacyId,
        result,
        expectedCode: 'INVENTORY_OUTBOUND_ITEM_INACTIVE',
        balanceBefore: 3,
        movementCountBefore: 1,
      })

      const nullStockKindId = await insertInactiveContainerFixture(pgClient, state, {
        userId: user.id,
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
        stockKind: null,
      })
      await insertLegacyMovementFixture(pgClient, legacyState, {
        containerId: nullStockKindId,
        userId: user.id,
        quantityDelta: 1,
        unit: 'kg',
      })
      result = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: nullStockKindId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-null-stock-kind`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId: nullStockKindId,
        result,
        expectedCode: 'INVENTORY_OUTBOUND_ITEM_INACTIVE',
        balanceBefore: 1,
        movementCountBefore: 1,
      })

      const foreignItemId = await seedCanonicalItem({
        authClient: otherAuthClient,
        state,
        profileId: otherProfile.id,
        quantity: 5,
        keySuffix: 'foreign-item',
      })
      result = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: foreignItemId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-foreign-item`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId: foreignItemId,
        result,
        expectedCode: 'INVENTORY_OUTBOUND_ACCESS_DENIED',
        balanceBefore: 5,
        movementCountBefore: 1,
        ownerUserId: other.id,
      })
    })

    it('DB-O7 rejects missing, foreign, invalid and cross-user profiles before persistence', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const legacyState = asLegacyMigrationState(state)
      const user = await createCreationDatabaseTestUser(admin, state, 'profile-eligibility')
      const other = await createCreationDatabaseTestUser(admin, state, 'profile-other')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const otherProfile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: other.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })

      let result: { data: unknown; error: { message: string } | null }
      const missingProfileItemId = crypto.randomUUID()
      await pgClient.query(
        `alter table public.fertilizer_containers
         drop constraint if exists fertilizer_containers_product_binding_check`,
      )
      try {
        await pgClient.query(
          `insert into public.fertilizer_containers (
            id, user_id, saved_product_profile_id, access_kind, base_unit, stock_kind,
            package_size_value, package_size_unit
          ) values ($1, $2, null, 'authenticated_user', 'kg', 'product_stock', 10, 'kg')`,
          [missingProfileItemId, user.id],
        )
        state.containerIds.push(missingProfileItemId)
        await insertLegacyMovementFixture(pgClient, legacyState, {
          containerId: missingProfileItemId,
          userId: user.id,
          quantityDelta: 2,
          unit: 'kg',
        })
        result = await callProductStockOutboundRpc(authClient, {
          inventoryItemId: missingProfileItemId,
          quantity: 1,
          reason: 'gift_given',
          idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-missing-profile`,
        })
        await expectOutboundRejected({
          pgClient,
          userId: user.id,
          itemId: missingProfileItemId,
          result,
          expectedCode: 'INVENTORY_OUTBOUND_PROFILE_MISSING',
          balanceBefore: 2,
          movementCountBefore: 1,
        })
      } finally {
        await withTestReplicationRole(pgClient, async () => {
          await pgClient.query(
            `delete from public.fertilizer_stock_movements where container_id = $1`,
            [missingProfileItemId],
          )
          await pgClient.query(
            `delete from public.fertilizer_containers where id = $1`,
            [missingProfileItemId],
          )
        })
        state.containerIds = state.containerIds.filter((id) => id !== missingProfileItemId)
        await pgClient.query(
          `alter table public.fertilizer_containers
           add constraint fertilizer_containers_product_binding_check
           check (
             (
               saved_product_profile_id is null
               and access_kind is null
               and user_id is not null
               and (
                 (product_id is not null and recognition_candidate_id is null)
                 or (product_id is null and recognition_candidate_id is not null)
               )
             )
             or (
               saved_product_profile_id is not null
               and product_id is null
               and recognition_candidate_id is null
               and access_kind is not null
               and base_unit is not null
             )
           )`,
        )
      }

      const missingProfileRowId = crypto.randomUUID()
      await withTestReplicationRole(pgClient, async () => {
        await pgClient.query(
          `insert into public.fertilizer_containers (
            id, user_id, saved_product_profile_id, access_kind, base_unit, stock_kind,
            package_size_value, package_size_unit
          ) values ($1, $2, $3, 'authenticated_user', 'kg', 'product_stock', 10, 'kg')`,
          [missingProfileRowId, user.id, crypto.randomUUID()],
        )
      })
      state.containerIds.push(missingProfileRowId)
      await insertLegacyMovementFixture(pgClient, legacyState, {
        containerId: missingProfileRowId,
        userId: user.id,
        quantityDelta: 2,
        unit: 'kg',
      })
      result = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: missingProfileRowId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-missing-profile-row`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId: missingProfileRowId,
        result,
        expectedCode: 'INVENTORY_OUTBOUND_PROFILE_INVALID',
        balanceBefore: 2,
        movementCountBefore: 1,
      })

      const foreignProfileItemId = crypto.randomUUID()
      await withTestReplicationRole(pgClient, async () => {
        await pgClient.query(
          `insert into public.fertilizer_containers (
            id, user_id, saved_product_profile_id, access_kind, base_unit, stock_kind,
            package_size_value, package_size_unit
          ) values ($1, $2, $3, 'authenticated_user', 'kg', 'product_stock', 10, 'kg')`,
          [foreignProfileItemId, user.id, otherProfile.id],
        )
      })
      state.containerIds.push(foreignProfileItemId)
      await insertLegacyMovementFixture(pgClient, legacyState, {
        containerId: foreignProfileItemId,
        userId: user.id,
        quantityDelta: 4,
        unit: 'kg',
      })
      result = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: foreignProfileItemId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-foreign-profile`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId: foreignProfileItemId,
        result,
        expectedCode: 'INVENTORY_OUTBOUND_PROFILE_ACCESS_DENIED',
        balanceBefore: 4,
        movementCountBefore: 1,
      })

      const draftProfileId = await insertDraftProductProfileFixture(pgClient, state, user.id)
      const invalidProfileItemId = crypto.randomUUID()
      await withTestReplicationRole(pgClient, async () => {
        await pgClient.query(
          `insert into public.fertilizer_containers (
            id, user_id, saved_product_profile_id, access_kind, base_unit, stock_kind,
            package_size_value, package_size_unit
          ) values ($1, $2, $3, 'authenticated_user', 'kg', 'product_stock', 10, 'kg')`,
          [invalidProfileItemId, user.id, draftProfileId],
        )
      })
      state.containerIds.push(invalidProfileItemId)
      await insertLegacyMovementFixture(pgClient, legacyState, {
        containerId: invalidProfileItemId,
        userId: user.id,
        quantityDelta: 2,
        unit: 'kg',
      })
      result = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: invalidProfileItemId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-invalid-profile`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId: invalidProfileItemId,
        result,
        expectedCode: 'INVENTORY_OUTBOUND_PROFILE_INVALID',
        balanceBefore: 2,
        movementCountBefore: 1,
      })

      const crossUserItemId = crypto.randomUUID()
      await withTestReplicationRole(pgClient, async () => {
        await pgClient.query(
          `insert into public.fertilizer_containers (
            id, user_id, saved_product_profile_id, access_kind, base_unit, stock_kind,
            package_size_value, package_size_unit
          ) values ($1, $2, $3, 'authenticated_user', 'ml', 'product_stock', 500, 'ml')`,
          [crossUserItemId, user.id, otherProfile.id],
        )
      })
      state.containerIds.push(crossUserItemId)
      await insertLegacyMovementFixture(pgClient, legacyState, {
        containerId: crossUserItemId,
        userId: user.id,
        quantityDelta: 3,
        unit: 'ml',
      })
      result = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: crossUserItemId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-cross-user-profile`,
      })
      await expectOutboundRejected({
        pgClient,
        userId: user.id,
        itemId: crossUserItemId,
        result,
        expectedCode: 'INVENTORY_OUTBOUND_PROFILE_ACCESS_DENIED',
        balanceBefore: 3,
        movementCountBefore: 1,
      })

      const validItemId = await seedCanonicalItem({
        authClient,
        state,
        profileId: profile.id,
        quantity: 5,
        keySuffix: 'valid-profile',
      })
      result = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: validItemId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-valid-profile`,
      })
      expect(result.error).toBeNull()
      trackProductStockOutboundResult(state, parseProductStockOutboundRpcSuccess(result.data))
      expect(await computeEffectiveBalanceDirect(pgClient, validItemId, user.id)).toBe(4)

      await expect(
        withTestReplicationRole(pgClient, async () => {
          await pgClient.query(
            `update public.fertilizer_containers set base_unit = null where id = $1`,
            [validItemId],
          )
        }),
      ).rejects.toThrow(/product_binding_check/i)
    })
  })

  describe('Idempotency', () => {
    it('DB-O8 supports replay, payload conflicts and cross-user shared keys', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const userA = await createCreationDatabaseTestUser(admin, state, 'idem-a')
      const userB = await createCreationDatabaseTestUser(admin, state, 'idem-b')
      const authA = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        userA,
      )) as LocalProductStockIntakeAuthClient
      const authB = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        userB,
      )) as LocalProductStockIntakeAuthClient
      const profileA = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: userA.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const profileB = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: userB.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemA = await seedCanonicalItem({
        authClient: authA,
        state,
        profileId: profileA.id,
        quantity: 8,
        keySuffix: 'idem-a',
      })
      const itemB = await seedCanonicalItem({
        authClient: authB,
        state,
        profileId: profileB.id,
        quantity: 8,
        keySuffix: 'idem-b',
      })

      const sharedKey = `${PRODUCT_STOCK_DB_TEST_PREFIX}-shared-key`
      const firstA = await callProductStockOutboundRpc(authA, {
        inventoryItemId: itemA,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: sharedKey,
      })
      expect(firstA.error).toBeNull()
      const parsedA = parseProductStockOutboundRpcSuccess(firstA.data)
      trackProductStockOutboundResult(state, parsedA)

      const firstB = await callProductStockOutboundRpc(authB, {
        inventoryItemId: itemB,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: sharedKey,
      })
      expect(firstB.error).toBeNull()
      const parsedB = parseProductStockOutboundRpcSuccess(firstB.data)
      trackProductStockOutboundResult(state, parsedB)
      expect(parsedB.movementId).not.toBe(parsedA.movementId)

      const replay = await callProductStockOutboundRpc(authA, {
        inventoryItemId: itemA,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: sharedKey,
      })
      expect(replay.error).toBeNull()
      expect(parseProductStockOutboundRpcSuccess(replay.data).idempotencyReplay).toBe(true)

      const quantityConflict = await callProductStockOutboundRpc(authA, {
        inventoryItemId: itemA,
        quantity: 2,
        reason: 'gift_given',
        idempotencyKey: sharedKey,
      })
      expect(extractProductStockOutboundErrorCode(quantityConflict.error?.message ?? '')).toBe(
        'INVENTORY_OUTBOUND_IDEMPOTENCY_CONFLICT',
      )

      const reasonConflict = await callProductStockOutboundRpc(authA, {
        inventoryItemId: itemA,
        quantity: 1,
        reason: 'disposed',
        idempotencyKey: sharedKey,
      })
      expect(extractProductStockOutboundErrorCode(reasonConflict.error?.message ?? '')).toBe(
        'INVENTORY_OUTBOUND_IDEMPOTENCY_CONFLICT',
      )

      const profileA2 = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: userA.id,
        sessionAccessHash: null,
        productForm: 'liquid',
      })
      const intakeA2 = await callProductStockIntakeRpc(authA, {
        savedProductProfileId: profileA2.id,
        baseUnit: 'ml',
        quantity: 5,
        reason: 'initial_stock',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-idem-a2-seed`,
      })
      expect(intakeA2.error).toBeNull()
      const parsedA2 = parseProductStockIntakeRpcSuccess(intakeA2.data)
      trackProductStockIntakeResult(state, parsedA2)
      const itemA2 = parsedA2.inventoryItemId
      const itemConflict = await callProductStockOutboundRpc(authA, {
        inventoryItemId: itemA2,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: sharedKey,
      })
      expect(extractProductStockOutboundErrorCode(itemConflict.error?.message ?? '')).toBe(
        'INVENTORY_OUTBOUND_IDEMPOTENCY_CONFLICT',
      )

      const noteKey = `${PRODUCT_STOCK_DB_TEST_PREFIX}-note-key`
      const noteFirst = await callProductStockOutboundRpc(authA, {
        inventoryItemId: itemA,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: noteKey,
        note: 'first note',
      })
      expect(noteFirst.error).toBeNull()
      trackProductStockOutboundResult(state, parseProductStockOutboundRpcSuccess(noteFirst.data))

      const noteConflict = await callProductStockOutboundRpc(authA, {
        inventoryItemId: itemA,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: noteKey,
        note: 'different note',
      })
      expect(extractProductStockOutboundErrorCode(noteConflict.error?.message ?? '')).toBe(
        'INVENTORY_OUTBOUND_IDEMPOTENCY_CONFLICT',
      )

      const artifactsA = await countOutboundArtifacts(pgClient, userA.id, itemA)
      const artifactsB = await countOutboundArtifacts(pgClient, userB.id, itemB)
      expect(artifactsA.receipts).toBe(2)
      expect(artifactsB.receipts).toBe(1)
      expect(artifactsA.movements).toBe(3)
      expect(artifactsB.movements).toBe(2)

      const { rows: movementRows } = await pgClient.query(
        `select inventory_idempotency_key
         from public.fertilizer_stock_movements
         where id = $1`,
        [parsedA.movementId],
      )
      expect(movementRows[0]?.inventory_idempotency_key).toBe(
        buildProductStockOutboundMovementIdempotencyKey(parsedA.operationId),
      )
    })
  })

  describe('Parallelism', () => {
    it('DB-O9 parallel identical requests persist exactly once', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const user = await createCreationDatabaseTestUser(admin, state, 'parallel-identical')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemId = await seedCanonicalItem({
        authClient,
        state,
        profileId: profile.id,
        quantity: 10,
        keySuffix: 'parallel-identical',
      })

      const key = `${PRODUCT_STOCK_DB_TEST_PREFIX}-parallel-identical`
      const payload = {
        inventoryItemId: itemId,
        quantity: 2,
        reason: 'gift_given' as const,
        idempotencyKey: key,
      }

      const [first, second] = await Promise.all([
        callProductStockOutboundRpcParallel(authClient, payload),
        callProductStockOutboundRpcParallel(authClient, payload),
      ])

      expect(first.error === null || second.error === null).toBe(true)
      expect(first.error?.message.includes('unique') ?? false).toBe(false)
      expect(second.error?.message.includes('unique') ?? false).toBe(false)

      const successes = [first, second]
        .filter((result) => result.error === null)
        .map((result) => parseProductStockOutboundRpcSuccess(result.data))
      expect(successes.length).toBeGreaterThanOrEqual(1)
      trackProductStockOutboundResult(state, successes[0])

      if (successes.length === 2) {
        expect(successes[0].operationId).toBe(successes[1].operationId)
        expect(successes[0].movementId).toBe(successes[1].movementId)
      }

      const artifacts = await countOutboundArtifacts(pgClient, user.id, itemId)
      expect(artifacts.receipts).toBe(1)
      expect(artifacts.movements).toBe(2)
      expect(artifacts.balance).toBe(8)
    })

    it('DB-O10 parallel overdraw allows at most one success and never negative balance', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const user = await createCreationDatabaseTestUser(admin, state, 'parallel-overdraw')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemId = await seedCanonicalItem({
        authClient,
        state,
        profileId: profile.id,
        quantity: 10,
        keySuffix: 'parallel-overdraw',
      })

      const [first, second] = await Promise.all([
        callProductStockOutboundRpcParallel(authClient, {
          inventoryItemId: itemId,
          quantity: 7,
          reason: 'disposed',
          idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-parallel-over-a`,
        }),
        callProductStockOutboundRpcParallel(authClient, {
          inventoryItemId: itemId,
          quantity: 7,
          reason: 'disposed',
          idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-parallel-over-b`,
        }),
      ])

      const outcomes = [first, second]
      const successes = outcomes.filter((result) => result.error === null)
      const failures = outcomes.filter((result) => result.error !== null)

      expect(successes.length).toBeLessThanOrEqual(1)
      expect(failures.length).toBeGreaterThanOrEqual(1)
      for (const failure of failures) {
        expectInsufficientStockError(failure.error?.message)
      }

      if (successes[0]) {
        trackProductStockOutboundResult(
          state,
          parseProductStockOutboundRpcSuccess(successes[0].data),
        )
      }

      const artifacts = await countOutboundArtifacts(pgClient, user.id, itemId)
      expect(artifacts.receipts).toBeLessThanOrEqual(1)
      expect(artifacts.movements).toBeLessThanOrEqual(2)
      expect(artifacts.balance).toBeGreaterThanOrEqual(0)
      expect(artifacts.balance).toBe(successes.length === 1 ? 3 : 10)
    })
  })

  describe('RLS and direct write prohibitions', () => {
    it('DB-O11 rejects direct authenticated receipt and movement writes while RPC succeeds', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const user = await createCreationDatabaseTestUser(admin, state, 'outbound-rls')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemId = await seedCanonicalItem({
        authClient,
        state,
        profileId: profile.id,
        quantity: 4,
        keySuffix: 'rls',
      })

      await rejectDirectAuthenticatedWrite(
        withAuthenticatedClientSession(authClient, async (client) => {
          await client.query(
            `insert into public.fertilizer_product_stock_outbound_receipts (
              user_id, idempotency_key, payload_fingerprint, inventory_item_id, outbound_reason, quantity_delta
            ) values ($1, $2, $3, $4, $5, $6)`,
            [user.id, 'blocked-key', 'fp', itemId, 'gift_given', -1],
          )
        }),
      )

      const { rows: receiptRows } = await pgClient.query(
        `select id from public.fertilizer_product_stock_outbound_receipts
         where user_id = $1 and idempotency_key = $2`,
        [user.id, 'blocked-key'],
      )
      expect(receiptRows).toHaveLength(0)

      const rpc = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-rls-rpc`,
      })
      expect(rpc.error).toBeNull()
      trackProductStockOutboundResult(state, parseProductStockOutboundRpcSuccess(rpc.data))

      const receiptId = state.intakeReceiptIds[state.intakeReceiptIds.length - 1]
      expect(receiptId).toBeTruthy()

      await rejectDirectAuthenticatedWrite(
        withAuthenticatedClientSession(authClient, async (client) => {
          await client.query(
            `update public.fertilizer_product_stock_outbound_receipts
             set note = 'tampered'
             where id = $1`,
            [receiptId],
          )
        }),
      )

      await rejectDirectAuthenticatedWrite(
        withAuthenticatedClientSession(authClient, async (client) => {
          await client.query(
            `delete from public.fertilizer_product_stock_outbound_receipts where id = $1`,
            [receiptId],
          )
        }),
      )

      const { rows: visibleReceipts } = await pgClient.query(
        `select count(*)::int as count
         from public.fertilizer_product_stock_outbound_receipts
         where id = $1`,
        [receiptId],
      )
      expect(visibleReceipts[0]?.count).toBe(1)

      await rejectDirectAuthenticatedWrite(
        withAuthenticatedClientSession(authClient, async (client) => {
          await client.query(
            `insert into public.fertilizer_stock_movements (
              container_id, user_id, access_kind, quantity_delta, unit,
              movement_type, movement_origin, movement_at
            ) values (
              $1, $2, 'authenticated_user', -1, 'kg',
              'gifted_away', 'manual', timezone('utc', now())
            )`,
            [itemId, user.id],
          )
        }),
      )

      const movementId = state.intakeMovementIds[state.intakeMovementIds.length - 1]
      expect(movementId).toBeTruthy()

      await rejectDirectAuthenticatedWrite(
        withAuthenticatedClientSession(authClient, async (client) => {
          await client.query(
            `update public.fertilizer_stock_movements set quantity_delta = -99 where id = $1`,
            [movementId],
          )
        }),
      )

      await rejectDirectAuthenticatedWrite(
        withAuthenticatedClientSession(authClient, async (client) => {
          await client.query(`delete from public.fertilizer_stock_movements where id = $1`, [
            movementId,
          ])
        }),
      )

      const otherUser = await createCreationDatabaseTestUser(admin, state, 'outbound-rls-other')
      const otherAuthClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        otherUser,
      )) as LocalProductStockIntakeAuthClient

      await rejectDirectAuthenticatedWrite(
        withAuthenticatedClientSession(authClient, async (client) => {
          await client.query(
            `select count(*)::int as count
             from public.fertilizer_product_stock_outbound_receipts
             where user_id = $1`,
            [user.id],
          )
        }),
      )

      await rejectDirectAuthenticatedWrite(
        withAuthenticatedClientSession(otherAuthClient, async (client) => {
          await client.query(
            `select count(*)::int as count
             from public.fertilizer_product_stock_outbound_receipts
             where user_id = $1`,
            [user.id],
          )
        }),
      )
    })
  })

  describe('Read model integration', () => {
    it('DB-O12 updates list and item read RPCs after outbound flows', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const user = await createCreationDatabaseTestUser(admin, state, 'read-model')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemId = await seedCanonicalItem({
        authClient,
        state,
        profileId: profile.id,
        quantity: 20,
        keySuffix: 'read-model',
      })

      const listBefore = parseActiveProductStockListPayload(
        (await callListActiveProductStockViaRpc(authClient)).data,
      )
      expect(listBefore.items).toHaveLength(1)
      expect(listBefore.items[0]?.balance).toBe(20)
      expect(listBefore.items[0]?.inventoryItemId).toBe(itemId)
      expect(listBefore.items[0]?.savedProductProfileId).toBe(profile.id)
      expect(listBefore.items[0]?.baseUnit).toBe('kg')

      const gift = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: 2,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-read-gift`,
      })
      expect(gift.error).toBeNull()
      trackProductStockOutboundResult(state, parseProductStockOutboundRpcSuccess(gift.data))

      const disposed = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: 3,
        reason: 'disposed',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-read-disposed`,
      })
      expect(disposed.error).toBeNull()
      trackProductStockOutboundResult(state, parseProductStockOutboundRpcSuccess(disposed.data))

      const positiveCorrection = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: 1,
        reason: 'inventory_correction',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-read-corr-pos`,
      })
      expect(positiveCorrection.error).toBeNull()
      trackProductStockOutboundResult(
        state,
        parseProductStockOutboundRpcSuccess(positiveCorrection.data),
      )

      const negativeCorrection = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: -2,
        reason: 'inventory_correction',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-read-corr-neg`,
      })
      expect(negativeCorrection.error).toBeNull()
      trackProductStockOutboundResult(
        state,
        parseProductStockOutboundRpcSuccess(negativeCorrection.data),
      )

      const listAfter = parseActiveProductStockListPayload(
        (await callListActiveProductStockViaRpc(authClient)).data,
      )
      expect(listAfter.items).toHaveLength(1)
      expect(listAfter.items[0]?.inventoryItemId).toBe(itemId)
      expect(listAfter.items[0]?.savedProductProfileId).toBe(profile.id)
      expect(listAfter.items[0]?.baseUnit).toBe('kg')
      expect(listAfter.items[0]?.balance).toBe(14)

      const itemPayload = parseActiveProductStockItemPayload(
        (await callGetActiveProductStockItemViaRpc(authClient, itemId)).data,
      )
      expect(itemPayload).not.toBeNull()
      expect(itemPayload!.inventoryItemId).toBe(itemId)
      expect(itemPayload!.balance).toBe(14)

      const replay = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: 2,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-read-gift`,
      })
      expect(replay.error).toBeNull()
      expect(parseActiveProductStockListPayload(
        (await callListActiveProductStockViaRpc(authClient)).data,
      ).items[0]?.balance).toBe(14)

      const { rows: containerCount } = await pgClient.query(
        `select count(*)::int as count
         from public.fertilizer_containers
         where user_id = $1
           and saved_product_profile_id = $2
           and stock_kind = 'product_stock'
           and archived_at is null`,
        [user.id, profile.id],
      )
      expect(containerCount[0]?.count).toBe(1)
    })
  })

  describe('Historical integrity', () => {
    it('DB-O13 preserves historical movements and excludes inactive items from read model', async () => {
      state = createEmptyProductStockIntakeDatabaseTestState()
      const legacyState = asLegacyMigrationState(state)
      const user = await createCreationDatabaseTestUser(admin, state, 'historical')
      const authClient = (await createProductStockIntakeAuthenticatedClient(
        testConfig,
        user,
      )) as LocalProductStockIntakeAuthClient
      const profile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'granular',
      })
      const itemId = await seedCanonicalItem({
        authClient,
        state,
        profileId: profile.id,
        quantity: 6,
        keySuffix: 'historical',
      })

      const { rows: beforeRows } = await pgClient.query(
        `select id, quantity_delta, movement_type
         from public.fertilizer_stock_movements
         where container_id = $1
         order by movement_at, id`,
        [itemId],
      )

      const outbound = await callProductStockOutboundRpc(authClient, {
        inventoryItemId: itemId,
        quantity: 1,
        reason: 'gift_given',
        idempotencyKey: `${PRODUCT_STOCK_DB_TEST_PREFIX}-historical`,
      })
      expect(outbound.error).toBeNull()
      trackProductStockOutboundResult(state, parseProductStockOutboundRpcSuccess(outbound.data))

      const { rows: afterRows } = await pgClient.query(
        `select id, quantity_delta, movement_type
         from public.fertilizer_stock_movements
         where container_id = $1
         order by movement_at, id`,
        [itemId],
      )
      expect(afterRows.slice(0, beforeRows.length)).toEqual(beforeRows)
      expect(afterRows.length).toBe(beforeRows.length + 1)

      const archivedProfile = await insertSavedProductProfileFixture(pgClient, state, {
        accessKind: 'authenticated_user',
        userId: user.id,
        sessionAccessHash: null,
        productForm: 'liquid',
      })
      const archivedId = await insertInactiveContainerFixture(pgClient, state, {
        userId: user.id,
        savedProductProfileId: archivedProfile.id,
        baseUnit: 'ml',
        stockKind: 'product_stock',
      })
      await insertLegacyMovementFixture(pgClient, legacyState, {
        containerId: archivedId,
        userId: user.id,
        quantityDelta: 9,
        unit: 'ml',
      })
      await pgClient.query(
        `update public.fertilizer_containers
         set archived_at = $2
         where id = $1`,
        [archivedId, '2026-08-01T12:00:00.000Z'],
      )
      state.containerIds.push(archivedId)

      const list = parseActiveProductStockListPayload(
        (await callListActiveProductStockViaRpc(authClient)).data,
      )
      expect(list.items.some((item) => item.inventoryItemId === archivedId)).toBe(false)
      expect(list.items.some((item) => item.inventoryItemId === itemId)).toBe(true)
    })
  })
})
