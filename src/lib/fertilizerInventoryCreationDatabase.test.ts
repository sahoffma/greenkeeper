import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import { createInMemoryFertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryCore'
import { createPersistentFertilizerInventoryRepository } from './fertilizerInventoryRepositoryPersistentCore'
import {
  buildCreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams,
  mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult,
} from './fertilizerInventoryCreationRpcCore'
import {
  CREATION_DB_FAKE_SESSION_HASH,
  CREATION_DB_FAKE_SESSION_HASH_B,
  CREATION_DB_TEST_PREFIX,
  callCreationRpc,
  callCreationRpcWithPackagesJson,
  connectCreationTestPg,
  countCreationArtifacts,
  createAdminSupabaseClient,
  createAuthenticatedSupabaseClient,
  createCreationDatabaseTestUser,
  createEmptyCreationDatabaseTestState,
  ensureCreationMigrationsApplied,
  reloadPostgrestSchema,
  expectedMovementKey,
  extractErrorCode,
  insertDraftProductProfileFixture,
  insertSavedProductProfileFixture,
  installSecondContainerRollbackTrigger,
  loadCreationDatabaseTestConfig,
  parseCreationRpcSuccess,
  purgeCreationDatabaseTestData,
  removeSecondContainerRollbackTrigger,
  trackCreationResult,
  type CreationDatabaseTestConfig,
  type CreationDatabaseTestState,
} from './fertilizerInventoryCreationDatabaseTestHarness'

const config = loadCreationDatabaseTestConfig()
const describeDb = config ? describe : describe.skip

function defaultPackages(
  unit: 'kg' | 'ml',
  sizes: Array<{ size: number; initial: number }>,
) {
  return sizes.map((entry) => ({
    packageSizeValue: entry.size,
    packageSizeUnit: unit,
    initialQuantityValue: entry.initial,
  }))
}

describeDb('fertilizerInventoryCreationDatabase', () => {
  let pgClient: Client
  let admin: ReturnType<typeof createAdminSupabaseClient>
  let state: CreationDatabaseTestState
  const testConfig = config as CreationDatabaseTestConfig

  beforeAll(async () => {
    pgClient = await connectCreationTestPg(testConfig)
    await ensureCreationMigrationsApplied(pgClient)
    await reloadPostgrestSchema(pgClient)
    admin = createAdminSupabaseClient(testConfig)
  }, 120_000)

  afterAll(async () => {
    await pgClient.end()
  })

  afterEach(async () => {
    if (state) {
      await removeSecondContainerRollbackTrigger(pgClient).catch(() => undefined)
      await purgeCreationDatabaseTestData(pgClient, state, admin)
    }
  })

  it('DB-0 applies creation migrations on the dev database', async () => {
    const { rows: receiptTable } = await pgClient.query(
      `select 1 from information_schema.tables
       where table_schema = 'public' and table_name = 'fertilizer_inventory_creation_receipts'`,
    )
    const { rows: rpc } = await pgClient.query(
      `select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = 'create_fertilizer_inventory_core_from_confirmed_packages'`,
    )
    expect(receiptTable.length).toBe(1)
    expect(rpc.length).toBe(1)
  })

  it('DB-1 parallel identical replay creates one receipt and stable IDs', async () => {
    state = createEmptyCreationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'parallel-identical')
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
    const idempotencyKey = `${CREATION_DB_TEST_PREFIX}-parallel-identical`
    const params = {
      savedProductProfileId: profile.id,
      accessKind: 'authenticated_user' as const,
      userId: user.id,
      sessionAccessHash: null,
      creationReason: 'initial_stock' as const,
      idempotencyKey,
      sourceEventRef: `${CREATION_DB_TEST_PREFIX}:parallel-identical`,
      packages: defaultPackages('kg', [
        { size: 25, initial: 25 },
        { size: 10, initial: 8 },
      ]),
    }

    const results = await Promise.all([
      callCreationRpc(authClient, params),
      callCreationRpc(authClient, params),
      callCreationRpc(authClient, params),
    ])

    for (const result of results) {
      expect(result.error).toBeNull()
    }

    const parsed = results.map((result) => parseCreationRpcSuccess(result.data))
    const operationIds = new Set(parsed.map((entry) => entry.operationId))
    expect(operationIds.size).toBe(1)

    const itemIds = parsed[0]?.packages.map((entry) => entry.itemId)
    for (const entry of parsed) {
      expect(entry.packages.map((pkg) => pkg.itemId)).toEqual(itemIds)
      expect(entry.packages.map((pkg) => pkg.movementId)).toEqual(
        parsed[0]?.packages.map((pkg) => pkg.movementId),
      )
    }

    trackCreationResult(state, parsed[0]!)

    const counts = await countCreationArtifacts(pgClient, {
      idempotencyKey,
      userId: user.id,
    })
    expect(counts.receipts).toBe(1)
    expect(counts.containers).toBe(2)
    expect(counts.movements).toBe(2)

    for (const pkg of parsed[0]!.packages) {
      expect(pkg.movementKey).toBe(
        expectedMovementKey(parsed[0]!.operationId, pkg.sequenceIndex),
      )
    }
  }, 60_000)

  it('DB-2 parallel payload conflict yields one success and one conflict', async () => {
    state = createEmptyCreationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'parallel-conflict')
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
    const idempotencyKey = `${CREATION_DB_TEST_PREFIX}-parallel-conflict`
    const base = {
      savedProductProfileId: profile.id,
      accessKind: 'authenticated_user' as const,
      userId: user.id,
      sessionAccessHash: null,
      creationReason: 'purchase' as const,
      idempotencyKey,
      sourceEventRef: `${CREATION_DB_TEST_PREFIX}:parallel-conflict`,
    }

    const [winner, loser] = await Promise.all([
      callCreationRpc(authClient, {
        ...base,
        packages: defaultPackages('kg', [{ size: 25, initial: 20 }]),
      }),
      callCreationRpc(authClient, {
        ...base,
        packages: defaultPackages('kg', [{ size: 10, initial: 8 }]),
      }),
    ])

    const outcomes = [winner, loser]
    const successes = outcomes.filter((entry) => !entry.error)
    const conflicts = outcomes.filter(
      (entry) => extractErrorCode(entry.error?.message ?? '') === 'INVENTORY_CREATION_IDEMPOTENCY_CONFLICT',
    )

    expect(successes).toHaveLength(1)
    expect(conflicts).toHaveLength(1)

    const parsed = parseCreationRpcSuccess(successes[0]!.data)
    trackCreationResult(state, parsed)

    const winnerSize = parsed.packages[0]?.packageSizeValue
    expect([10, 25]).toContain(winnerSize)

    const counts = await countCreationArtifacts(pgClient, {
      idempotencyKey,
      userId: user.id,
      profileId: profile.id,
    })
    expect(counts.receipts).toBe(1)
    expect(counts.containers).toBe(1)
    expect(counts.movements).toBe(1)
    expect(parsed.packages[0]?.packageSizeValue).toBe(winnerSize)
  }, 60_000)

  it('DB-3 long shared request-key prefixes create separate movement namespaces', async () => {
    state = createEmptyCreationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'long-prefix')
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
    const sharedPrefix = 'x'.repeat(240)

    const first = await callCreationRpc(authClient, {
      savedProductProfileId: profile.id,
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      creationReason: 'gift_received',
      idempotencyKey: `${sharedPrefix}-a`,
      packages: defaultPackages('kg', [{ size: 25, initial: 25 }]),
    })
    const second = await callCreationRpc(authClient, {
      savedProductProfileId: profile.id,
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      creationReason: 'gift_received',
      idempotencyKey: `${sharedPrefix}-b`,
      packages: defaultPackages('kg', [{ size: 25, initial: 25 }]),
    })

    expect(first.error).toBeNull()
    expect(second.error).toBeNull()

    const parsedFirst = parseCreationRpcSuccess(first.data)
    const parsedSecond = parseCreationRpcSuccess(second.data)
    trackCreationResult(state, parsedFirst)
    trackCreationResult(state, parsedSecond)

    expect(parsedFirst.operationId).not.toBe(parsedSecond.operationId)
    expect(parsedFirst.packages[0]?.movementKey).not.toBe(parsedSecond.packages[0]?.movementKey)
    expect(parsedFirst.packages[0]?.movementKey).not.toContain(sharedPrefix)
    expect(parsedSecond.packages[0]?.movementKey).not.toContain(sharedPrefix)
  }, 60_000)

  it('DB-4 deterministic replay returns the same stored IDs', async () => {
    state = createEmptyCreationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'replay')
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
    const params = {
      savedProductProfileId: profile.id,
      accessKind: 'authenticated_user' as const,
      userId: user.id,
      sessionAccessHash: null,
      creationReason: 'initial_stock' as const,
      idempotencyKey: `${CREATION_DB_TEST_PREFIX}-replay`,
      packages: defaultPackages('kg', [{ size: 25, initial: 18 }]),
    }

    const first = await callCreationRpc(authClient, params)
    const replay = await callCreationRpc(authClient, params)
    expect(first.error).toBeNull()
    expect(replay.error).toBeNull()

    const parsedFirst = parseCreationRpcSuccess(first.data)
    const parsedReplay = parseCreationRpcSuccess(replay.data)
    trackCreationResult(state, parsedFirst)

    expect(parsedReplay.operationId).toBe(parsedFirst.operationId)
    expect(parsedReplay.packages[0]?.itemId).toBe(parsedFirst.packages[0]?.itemId)
    expect(parsedReplay.packages[0]?.movementId).toBe(parsedFirst.packages[0]?.movementId)
    expect(parsedReplay.packages[0]?.movementKey).toBe(parsedFirst.packages[0]?.movementKey)

    const counts = await countCreationArtifacts(pgClient, {
      idempotencyKey: params.idempotencyKey,
      userId: user.id,
    })
    expect(counts.receipts).toBe(1)
    expect(counts.containers).toBe(1)
    expect(counts.movements).toBe(1)
  }, 60_000)

  it('DB-5 same idempotency key in different scopes creates separate receipts', async () => {
    state = createEmptyCreationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'scope-split')
    const authClient = await createAuthenticatedSupabaseClient(
      testConfig,
      user.email,
      user.password,
    )
    const authProfile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const sessionProfile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'session',
      userId: null,
      sessionAccessHash: CREATION_DB_FAKE_SESSION_HASH,
      productForm: 'granular',
    })
    const sharedKey = `${CREATION_DB_TEST_PREFIX}-shared-key`

    const authResult = await callCreationRpc(authClient, {
      savedProductProfileId: authProfile.id,
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      creationReason: 'initial_stock',
      idempotencyKey: sharedKey,
      packages: defaultPackages('kg', [{ size: 25, initial: 25 }]),
    })
    const sessionResult = await callCreationRpc(admin, {
      savedProductProfileId: sessionProfile.id,
      accessKind: 'session',
      userId: null,
      sessionAccessHash: CREATION_DB_FAKE_SESSION_HASH,
      creationReason: 'initial_stock',
      idempotencyKey: sharedKey,
      packages: defaultPackages('kg', [{ size: 25, initial: 25 }]),
    })

    expect(authResult.error).toBeNull()
    expect(sessionResult.error).toBeNull()

    const parsedAuth = parseCreationRpcSuccess(authResult.data)
    const parsedSession = parseCreationRpcSuccess(sessionResult.data)
    trackCreationResult(state, parsedAuth)
    trackCreationResult(state, parsedSession)

    expect(parsedAuth.operationId).not.toBe(parsedSession.operationId)
    expect(parsedAuth.packages[0]?.movementKey).not.toBe(parsedSession.packages[0]?.movementKey)
  }, 60_000)

  it('DB-6 rollback after first container insert leaves no orphaned rows', async () => {
    state = createEmptyCreationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'rollback')
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
    const idempotencyKey = `${CREATION_DB_TEST_PREFIX}-rollback`

    await installSecondContainerRollbackTrigger(pgClient, profile.id)

    const failed = await callCreationRpc(authClient, {
      savedProductProfileId: profile.id,
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      creationReason: 'initial_stock',
      idempotencyKey,
      packages: defaultPackages('kg', [
        { size: 25, initial: 25 },
        { size: 10, initial: 10 },
      ]),
    })

    expect(failed.error).not.toBeNull()
    expect(extractErrorCode(failed.error?.message ?? '')).toBe('INVENTORY_CREATION_FAILED')

    const counts = await countCreationArtifacts(pgClient, {
      idempotencyKey,
      userId: user.id,
      profileId: profile.id,
    })
    expect(counts.receipts).toBe(0)
    expect(counts.containers).toBe(0)
    expect(counts.movements).toBe(0)

    await removeSecondContainerRollbackTrigger(pgClient)

    const retry = await callCreationRpc(authClient, {
      savedProductProfileId: profile.id,
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      creationReason: 'initial_stock',
      idempotencyKey,
      packages: defaultPackages('kg', [{ size: 25, initial: 25 }]),
    })
    expect(retry.error).toBeNull()
    trackCreationResult(state, parseCreationRpcSuccess(retry.data))
  }, 60_000)

  it('DB-7 persists receipt, item and movement consistency in PostgreSQL', async () => {
    state = createEmptyCreationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'consistency')
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

    const result = await callCreationRpc(authClient, {
      savedProductProfileId: profile.id,
      accessKind: 'authenticated_user',
      userId: user.id,
      sessionAccessHash: null,
      creationReason: 'purchase',
      idempotencyKey: `${CREATION_DB_TEST_PREFIX}-consistency`,
      sourceEventRef: `${CREATION_DB_TEST_PREFIX}:consistency`,
      packages: defaultPackages('kg', [
        { size: 25, initial: 20 },
        { size: 25, initial: 25 },
      ]),
    })
    expect(result.error).toBeNull()
    const parsed = parseCreationRpcSuccess(result.data)
    trackCreationResult(state, parsed)

    const { rows: receiptRows } = await pgClient.query(
      `select result_jsonb, payload_fingerprint, saved_product_profile_id
       from public.fertilizer_inventory_creation_receipts
       where id = $1`,
      [parsed.operationId],
    )
    expect(receiptRows).toHaveLength(1)
    expect(receiptRows[0]?.saved_product_profile_id).toBe(profile.id)
    expect(
      (receiptRows[0]?.result_jsonb as { operation_id?: string } | null)?.operation_id,
    ).toBe(parsed.operationId)

    for (const pkg of parsed.packages) {
      const { rows: itemRows } = await pgClient.query(
        `select saved_product_profile_id, package_size_value, package_size_unit, base_unit,
                access_kind, user_id, session_access_hash
         from public.fertilizer_containers where id = $1`,
        [pkg.itemId],
      )
      expect(Number(itemRows[0]?.package_size_value)).toBe(pkg.packageSizeValue)
      expect(itemRows[0]?.package_size_unit).toBe('kg')
      expect(itemRows[0]?.base_unit).toBe('kg')
      expect(itemRows[0]?.access_kind).toBe('authenticated_user')
      expect(itemRows[0]?.user_id).toBe(user.id)

      const { rows: movementRows } = await pgClient.query(
        `select container_id, quantity_delta, unit, movement_type, movement_origin,
                inventory_idempotency_key, access_kind, user_id
         from public.fertilizer_stock_movements where id = $1`,
        [pkg.movementId],
      )
      expect(movementRows[0]?.container_id).toBe(pkg.itemId)
      expect(Number(movementRows[0]?.quantity_delta)).toBe(pkg.initialQuantityValue)
      expect(movementRows[0]?.movement_type).toBe('purchase')
      expect(movementRows[0]?.movement_origin).toBe('manual')
      expect(movementRows[0]?.inventory_idempotency_key).toBe(
        expectedMovementKey(parsed.operationId, pkg.sequenceIndex),
      )
    }
  }, 60_000)

  it('DB-8 rejects negative and invalid creation requests against PostgreSQL', async () => {
    state = createEmptyCreationDatabaseTestState()
    const owner = await createCreationDatabaseTestUser(admin, state, 'neg-owner')
    const other = await createCreationDatabaseTestUser(admin, state, 'neg-other')
    const ownerClient = await createAuthenticatedSupabaseClient(
      testConfig,
      owner.email,
      owner.password,
    )
    const otherClient = await createAuthenticatedSupabaseClient(
      testConfig,
      other.email,
      other.password,
    )
    const granularProfile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'authenticated_user',
      userId: owner.id,
      sessionAccessHash: null,
      productForm: 'granular',
    })
    const liquidProfile = await insertSavedProductProfileFixture(pgClient, state, {
      accessKind: 'session',
      userId: null,
      sessionAccessHash: CREATION_DB_FAKE_SESSION_HASH_B,
      productForm: 'liquid',
    })
    const draftProfileId = await insertDraftProductProfileFixture(pgClient, state, owner.id)

    const cases = [
      {
        label: 'profile-not-found',
        client: ownerClient,
        params: {
          savedProductProfileId: '00000000-0000-4000-8000-000000000099',
          accessKind: 'authenticated_user' as const,
          userId: owner.id,
          sessionAccessHash: null,
          creationReason: 'initial_stock' as const,
          idempotencyKey: `${CREATION_DB_TEST_PREFIX}-neg-not-found`,
          packages: defaultPackages('kg', [{ size: 25, initial: 25 }]),
        },
        code: 'INVENTORY_CREATION_PRODUCT_PROFILE_NOT_FOUND',
      },
      {
        label: 'profile-not-ready',
        client: ownerClient,
        params: {
          savedProductProfileId: draftProfileId,
          accessKind: 'authenticated_user' as const,
          userId: owner.id,
          sessionAccessHash: null,
          creationReason: 'initial_stock' as const,
          idempotencyKey: `${CREATION_DB_TEST_PREFIX}-neg-not-ready`,
          packages: defaultPackages('kg', [{ size: 25, initial: 25 }]),
        },
        code: 'INVENTORY_CREATION_PRODUCT_PROFILE_NOT_READY',
      },
      {
        label: 'access-denied',
        client: otherClient,
        params: {
          savedProductProfileId: granularProfile.id,
          accessKind: 'authenticated_user' as const,
          userId: other.id,
          sessionAccessHash: null,
          creationReason: 'initial_stock' as const,
          idempotencyKey: `${CREATION_DB_TEST_PREFIX}-neg-access`,
          packages: defaultPackages('kg', [{ size: 25, initial: 25 }]),
        },
        code: 'INVENTORY_CREATION_ACCESS_DENIED',
      },
      {
        label: 'unit-mismatch',
        client: ownerClient,
        params: {
          savedProductProfileId: granularProfile.id,
          accessKind: 'authenticated_user' as const,
          userId: owner.id,
          sessionAccessHash: null,
          creationReason: 'initial_stock' as const,
          idempotencyKey: `${CREATION_DB_TEST_PREFIX}-neg-unit`,
          packages: defaultPackages('ml', [{ size: 25, initial: 25 }]),
        },
        code: 'INVENTORY_CREATION_UNIT_MISMATCH',
      },
      {
        label: 'invalid-reason',
        client: ownerClient,
        params: {
          savedProductProfileId: granularProfile.id,
          accessKind: 'authenticated_user' as const,
          userId: owner.id,
          sessionAccessHash: null,
          creationReason: 'inventory_correction' as unknown as 'initial_stock',
          idempotencyKey: `${CREATION_DB_TEST_PREFIX}-neg-reason`,
          packages: defaultPackages('kg', [{ size: 25, initial: 25 }]),
        },
        code: 'INVENTORY_CREATION_REASON_INVALID',
      },
      {
        label: 'empty-packages',
        client: ownerClient,
        params: {
          savedProductProfileId: granularProfile.id,
          accessKind: 'authenticated_user' as const,
          userId: owner.id,
          sessionAccessHash: null,
          creationReason: 'initial_stock' as const,
          idempotencyKey: `${CREATION_DB_TEST_PREFIX}-neg-empty`,
          packages: [],
        },
        code: 'INVENTORY_CREATION_PACKAGE_LIST_EMPTY',
      },
      {
        label: 'initial-exceeds-size',
        client: ownerClient,
        params: {
          savedProductProfileId: granularProfile.id,
          accessKind: 'authenticated_user' as const,
          userId: owner.id,
          sessionAccessHash: null,
          creationReason: 'initial_stock' as const,
          idempotencyKey: `${CREATION_DB_TEST_PREFIX}-neg-initial`,
          packages: defaultPackages('kg', [{ size: 10, initial: 11 }]),
        },
        code: 'INVENTORY_CREATION_INITIAL_QUANTITY_EXCEEDS_PACKAGE_SIZE',
      },
      {
        label: 'wrong-session-hash',
        client: admin,
        params: {
          savedProductProfileId: liquidProfile.id,
          accessKind: 'session' as const,
          userId: null,
          sessionAccessHash: CREATION_DB_FAKE_SESSION_HASH,
          creationReason: 'initial_stock' as const,
          idempotencyKey: `${CREATION_DB_TEST_PREFIX}-neg-session`,
          packages: defaultPackages('ml', [{ size: 1, initial: 1 }]),
        },
        code: 'INVENTORY_CREATION_ACCESS_DENIED',
      },
      {
        label: 'package-count-exceeded',
        client: ownerClient,
        params: {
          savedProductProfileId: granularProfile.id,
          accessKind: 'authenticated_user' as const,
          userId: owner.id,
          sessionAccessHash: null,
          creationReason: 'initial_stock' as const,
          idempotencyKey: `${CREATION_DB_TEST_PREFIX}-neg-count`,
          packages: Array.from({ length: 21 }, (_, index) => ({
            packageSizeValue: 1,
            packageSizeUnit: 'kg' as const,
            initialQuantityValue: 1,
            clientCorrelationId: `${CREATION_DB_TEST_PREFIX}-pkg-${index}`,
          })),
        },
        code: 'INVENTORY_CREATION_PACKAGE_COUNT_EXCEEDED',
      },
      {
        label: 'decimal-precision',
        client: ownerClient,
        params: {
          savedProductProfileId: granularProfile.id,
          accessKind: 'authenticated_user' as const,
          userId: owner.id,
          sessionAccessHash: null,
          creationReason: 'initial_stock' as const,
          idempotencyKey: `${CREATION_DB_TEST_PREFIX}-neg-decimals`,
          packages: defaultPackages('kg', [{ size: 10, initial: 1.12345 }]),
        },
        code: 'INVENTORY_CREATION_INITIAL_QUANTITY_INVALID',
      },
    ] as const

    for (const testCase of cases) {
      const response = await callCreationRpc(testCase.client, testCase.params)
      expect(response.error, testCase.label).not.toBeNull()
      expect(extractErrorCode(response.error?.message ?? ''), testCase.label).toBe(testCase.code)
    }

    const invalidSequence = await callCreationRpcWithPackagesJson(
      ownerClient,
      {
        savedProductProfileId: granularProfile.id,
        accessKind: 'authenticated_user',
        userId: owner.id,
        sessionAccessHash: null,
        creationReason: 'initial_stock',
        idempotencyKey: `${CREATION_DB_TEST_PREFIX}-neg-sequence`,
      },
      [
        {
          sequence_index: 1,
          package_size_value: 25,
          package_size_unit: 'kg',
          initial_quantity_value: 25,
          initial_quantity_unit: 'kg',
          client_correlation_id: null,
        },
      ],
    )
    expect(invalidSequence.error).not.toBeNull()
    expect(extractErrorCode(invalidSequence.error?.message ?? '')).toBe(
      'INVENTORY_CREATION_PACKAGE_INVALID',
    )

    const sequentialConflictKey = `${CREATION_DB_TEST_PREFIX}-neg-seq-conflict`
    const firstSuccess = await callCreationRpc(ownerClient, {
      savedProductProfileId: granularProfile.id,
      accessKind: 'authenticated_user',
      userId: owner.id,
      sessionAccessHash: null,
      creationReason: 'initial_stock',
      idempotencyKey: sequentialConflictKey,
      packages: defaultPackages('kg', [{ size: 25, initial: 25 }]),
    })
    expect(firstSuccess.error).toBeNull()
    trackCreationResult(state, parseCreationRpcSuccess(firstSuccess.data))

    const sequentialConflict = await callCreationRpc(ownerClient, {
      savedProductProfileId: granularProfile.id,
      accessKind: 'authenticated_user',
      userId: owner.id,
      sessionAccessHash: null,
      creationReason: 'initial_stock',
      idempotencyKey: sequentialConflictKey,
      packages: defaultPackages('kg', [{ size: 10, initial: 8 }]),
    })
    expect(sequentialConflict.error).not.toBeNull()
    expect(extractErrorCode(sequentialConflict.error?.message ?? '')).toBe(
      'INVENTORY_CREATION_IDEMPOTENCY_CONFLICT',
    )

    const conflictCounts = await countCreationArtifacts(pgClient, {
      idempotencyKey: sequentialConflictKey,
      userId: owner.id,
      profileId: granularProfile.id,
    })
    expect(conflictCounts.receipts).toBe(1)
    expect(conflictCounts.containers).toBe(1)
    expect(conflictCounts.movements).toBe(1)
  }, 90_000)

  it('DB-9 persistent repository uses the creation RPC against PostgreSQL', async () => {
    state = createEmptyCreationDatabaseTestState()
    const user = await createCreationDatabaseTestUser(admin, state, 'persistent')
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

    const repository = createPersistentFertilizerInventoryRepository({
      supabase: authClient,
      deriveSessionAccessHash: () => CREATION_DB_FAKE_SESSION_HASH,
      productProfileRepository: createInMemoryFertilizerProductProfileRepository(),
    })

    const result = await repository.createInventoryItemsWithInitialMovements(
      {
        savedProductProfileId: profile.id,
        creationReason: 'initial_stock',
        idempotencyKey: `${CREATION_DB_TEST_PREFIX}-persistent`,
        packages: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            sequenceIndex: 0,
          },
        ],
      },
      { kind: 'authenticated_user', userId: user.id },
    )

    expect(result.packages).toHaveLength(1)
    expect(result.packages[0]?.initialMovement.idempotencyKey).toBe(
      expectedMovementKey(result.operationId, 0),
    )

    const rpcParams = buildCreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams(
      {
        savedProductProfileId: profile.id,
        creationReason: 'initial_stock',
        idempotencyKey: `${CREATION_DB_TEST_PREFIX}-persistent`,
        packages: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            sequenceIndex: 0,
          },
        ],
      },
      { kind: 'authenticated_user', userId: user.id },
      () => CREATION_DB_FAKE_SESSION_HASH,
    )
    expect(rpcParams).not.toHaveProperty('p_payload_fingerprint')

    const mapped = mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult({
      operation_id: result.operationId,
      idempotency_key: result.idempotencyKey,
      packages: result.packages.map((entry) => ({
        sequence_index: entry.sequenceIndex,
        client_correlation_id: entry.clientCorrelationId ?? null,
        item: {
          id: entry.item.id,
          saved_product_profile_id: entry.item.savedProductProfileId,
          access_kind: entry.item.accessKind,
          user_id: entry.item.userId,
          session_access_hash: entry.item.sessionAccessHash,
          base_unit: entry.item.baseUnit,
          package_size_value: entry.item.packageSizeValue,
          package_size_unit: entry.item.packageSizeUnit,
          label: entry.item.label,
          archived_at: entry.item.archivedAt,
          created_at: entry.item.createdAt,
        },
        initial_movement: {
          id: entry.initialMovement.id,
          container_id: entry.initialMovement.inventoryItemId,
          access_kind: entry.initialMovement.accessKind,
          user_id: entry.initialMovement.userId,
          session_access_hash: entry.initialMovement.sessionAccessHash,
          quantity_delta: entry.initialMovement.quantityDelta,
          unit: entry.initialMovement.unit,
          movement_type: entry.initialMovement.movementType,
          movement_origin: entry.initialMovement.movementOrigin,
          movement_at: entry.initialMovement.movementAt,
          inventory_idempotency_key: entry.initialMovement.idempotencyKey,
          source_event_ref: entry.initialMovement.sourceEventRef,
          note: entry.initialMovement.note,
          created_at: entry.initialMovement.createdAt,
        },
      })),
    })
    expect(mapped.operationId).toBe(result.operationId)

    state.receiptIds.push(result.operationId)
    state.containerIds.push(result.packages[0]!.item.id)
  }, 60_000)
})
