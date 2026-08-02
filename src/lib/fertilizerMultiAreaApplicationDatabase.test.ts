import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Client } from 'pg'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildRpcAreasFromNormalized,
  callMultiAreaRpc,
  computeContainerBalance,
  connectMultiAreaTestPg,
  countMultiAreaFailureArtifacts,
  createAdminSupabaseClient,
  createAuthenticatedSupabaseClient,
  createCreationDatabaseTestUser,
  createEmptyMultiAreaDatabaseTestState,
  createInventoryItemForMultiAreaTest,
  deleteAreaForMultiAreaTest,
  ensureMultiAreaMigrationsApplied,
  extractMultiAreaErrorCode,
  insertMultiAreaTestArea,
  insertMultiAreaTestCareGroup,
  loadMultiAreaDatabaseTestConfig,
  MULTI_AREA_DB_TEST_PREFIX,
  parseMultiAreaRpcSuccess,
  purgeMultiAreaDatabaseTestData,
  reloadPostgrestSchema,
  type MultiAreaDatabaseTestState,
  type MultiAreaRpcCallParams,
  type MultiAreaRpcSuccess,
} from './fertilizerMultiAreaApplicationDatabaseTestHarness'
import { insertNonInventoryCoupledActivity } from './fertilizerApplicationDatabaseTestHarness'
import type { CreationDatabaseTestConfig } from './fertilizerInventoryCreationDatabaseTestHarness'
import {
  normalizeFertilizerMultiAreaApplication,
  type FertilizerMultiAreaApplicationInput,
  type NormalizedFertilizerMultiAreaApplication,
} from './fertilizerMultiAreaApplicationCore'

const config = loadMultiAreaDatabaseTestConfig()
const describeDb = config ? describe : describe.skip

const APPLIED_AT = '2026-08-02T10:00:00.000Z'

function uniqueKey(label: string): string {
  return `${MULTI_AREA_DB_TEST_PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function areaNameForSuffix(suffix: string): string {
  return `${MULTI_AREA_DB_TEST_PREFIX}-area-${suffix}`
}

function confirmedInputUnit(normalized: NormalizedFertilizerMultiAreaApplication): string {
  return normalized.mode === 'rate_per_sqm' ? normalized.effortRateUnit : normalized.baseUnit
}


function compareAreaIdsOrdinal(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase()
  const normalizedRight = right.toLowerCase()
  if (normalizedLeft < normalizedRight) {
    return -1
  }
  if (normalizedLeft > normalizedRight) {
    return 1
  }
  return 0
}

function sortAreaIdsCanonical(areaIds: readonly string[]): string[] {
  return [...areaIds].map((id) => id.toLowerCase()).sort(compareAreaIdsOrdinal)
}

function amountsByAreaId(
  areas: ReadonlyArray<{ areaId: string; applicationAmount: number }>,
): Record<string, number> {
  return Object.fromEntries(areas.map((area) => [area.areaId.toLowerCase(), area.applicationAmount]))
}

function buildRpcParams(
  normalized: NormalizedFertilizerMultiAreaApplication,
  options: {
    inventoryItemId: string
    savedProductProfileId: string
    userId: string
    idempotencyKey: string
    appliedAt?: string
    note?: string | null
    sourceEventRef?: string | null
    areasOverride?: MultiAreaRpcCallParams['areas']
  },
): MultiAreaRpcCallParams {
  return {
    inventoryItemId: options.inventoryItemId,
    savedProductProfileId: options.savedProductProfileId,
    applicationMode: normalized.mode,
    selectionSource: normalized.selectionSource,
    careGroupId: normalized.careGroupId,
    confirmedInputValue: normalized.confirmedInputValue,
    confirmedInputUnit: confirmedInputUnit(normalized),
    totalApplicationAmount: normalized.totalApplicationAmount,
    applicationUnit: normalized.baseUnit,
    appliedAt: options.appliedAt ?? APPLIED_AT,
    idempotencyKey: options.idempotencyKey,
    areas: options.areasOverride ?? buildRpcAreasFromNormalized(normalized),
    sourceEventRef: options.sourceEventRef ?? null,
    note: options.note ?? null,
    userId: options.userId,
  }
}

function trackMultiAreaSuccess(
  state: MultiAreaDatabaseTestState,
  result: MultiAreaRpcSuccess,
  idempotencyKey: string,
): void {
  state.batchIds.push(result.applicationBatchId)
  state.movementIds.push(result.movementId)
  state.applicationIdempotencyKeys.push(idempotencyKey)
  for (const area of result.areas) {
    state.activityIds.push(area.activityId)
  }
}

async function setupUserWithInventory(
  state: MultiAreaDatabaseTestState,
  label: string,
  options: { initialQuantity: number; unit: 'kg' | 'ml' },
): Promise<{
  user: { id: string; email: string; password: string }
  auth: SupabaseClient
  profileId: string
  itemId: string
}> {
  const { profileId, itemId } = await createInventoryItemForMultiAreaTest(
    pgClient,
    state,
    sharedAuth,
    sharedUser,
    {
      initialQuantity: options.initialQuantity,
      unit: options.unit,
      idempotencyKey: uniqueKey(`create-${label}`),
    },
  )
  return { user: sharedUser, auth: sharedAuth, profileId, itemId }
}

async function countActivitiesForAreaIds(areaIds: readonly string[]): Promise<number> {
  if (areaIds.length === 0) {
    return 0
  }
  const { rows } = await pgClient.query(
    `select count(*)::int as count from public.activities where area_id = any($1::uuid[])`,
    [areaIds],
  )
  return Number(rows[0]?.count ?? 0)
}

async function applyNormalized(
  auth: SupabaseClient,
  state: MultiAreaDatabaseTestState,
  normalized: NormalizedFertilizerMultiAreaApplication,
  options: {
    inventoryItemId: string
    savedProductProfileId: string
    userId: string
    idempotencyKey: string
    appliedAt?: string
    areasOverride?: MultiAreaRpcCallParams['areas']
  },
): Promise<{ result: MultiAreaRpcSuccess; error: null } | { result: null; error: { message: string } }> {
  const { data, error } = await callMultiAreaRpc(
    auth,
    buildRpcParams(normalized, {
      inventoryItemId: options.inventoryItemId,
      savedProductProfileId: options.savedProductProfileId,
      userId: options.userId,
      idempotencyKey: options.idempotencyKey,
      appliedAt: options.appliedAt,
      areasOverride: options.areasOverride,
    }),
  )

  if (error) {
    return { result: null, error }
  }

  const result = parseMultiAreaRpcSuccess(data)
  trackMultiAreaSuccess(state, result, options.idempotencyKey)
  return { result, error: null }
}

function normalizeInput(input: FertilizerMultiAreaApplicationInput): NormalizedFertilizerMultiAreaApplication {
  return normalizeFertilizerMultiAreaApplication(input)
}

function buildAreaInputs(
  entries: Array<{ areaId: string; suffix: string; areaSizeSqm: number }>,
): FertilizerMultiAreaApplicationInput['areas'] {
  return entries.map((entry) => ({
    areaId: entry.areaId,
    areaName: areaNameForSuffix(entry.suffix),
    areaSizeSqm: entry.areaSizeSqm,
  }))
}

async function insertTwoAreas(
  state: MultiAreaDatabaseTestState,
  userId: string,
  sizes: [number, number] = [100, 50],
): Promise<{
  area1Id: string
  area2Id: string
  area1Name: string
  area2Name: string
}> {
  const area1Id = await insertMultiAreaTestArea(pgClient, state, userId, 'a', sizes[0])
  const area2Id = await insertMultiAreaTestArea(pgClient, state, userId, 'b', sizes[1])
  return {
    area1Id,
    area2Id,
    area1Name: areaNameForSuffix('a'),
    area2Name: areaNameForSuffix('b'),
  }
}


async function applyTwoAreaRateBaseline(
  state: MultiAreaDatabaseTestState,
  label: string,
): Promise<{
  user: { id: string; email: string; password: string }
  auth: SupabaseClient
  profileId: string
  itemId: string
  area1Id: string
  area2Id: string
  result: MultiAreaRpcSuccess
}> {
  const setup = await setupUserWithInventory(state, label, {
    initialQuantity: 10,
    unit: 'kg',
  })
  const areas = await insertTwoAreas(state, setup.user.id)
  const normalized = normalizeInput({
    baseUnit: 'kg',
    mode: 'rate_per_sqm',
    selectionSource: 'manual',
    areas: buildAreaInputs([
      { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
      { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
    ]),
    rateValue: 25,
  })
  const applied = await applyNormalized(setup.auth, state, normalized, {
    inventoryItemId: setup.itemId,
    savedProductProfileId: setup.profileId,
    userId: setup.user.id,
    idempotencyKey: uniqueKey(`${label}-apply`),
  })
  if (!applied.result) {
    throw new Error(`Expected success for ${label}: ${applied.error?.message}`)
  }
  return { ...setup, ...areas, result: applied.result }
}

let pgClient: Client
let admin: ReturnType<typeof createAdminSupabaseClient>
let sharedUser: { id: string; email: string; password: string }
let sharedAuth: SupabaseClient
let state: MultiAreaDatabaseTestState
const testConfig = config as CreationDatabaseTestConfig

describeDb('fertilizerMultiAreaApplicationDatabase', () => {
  beforeAll(async () => {
    pgClient = await connectMultiAreaTestPg(testConfig)
    await ensureMultiAreaMigrationsApplied(pgClient)
    await reloadPostgrestSchema(pgClient)
    admin = createAdminSupabaseClient(testConfig)
    const bootstrapState = createEmptyMultiAreaDatabaseTestState()
    sharedUser = await createCreationDatabaseTestUser(admin, bootstrapState, 'shared')
    sharedAuth = await createAuthenticatedSupabaseClient(
      testConfig,
      sharedUser.email,
      sharedUser.password,
    )
  }, 120_000)

  afterAll(async () => {
    await pgClient.end()
  })

  afterEach(async () => {
    if (state) {
      await purgeMultiAreaDatabaseTestData(pgClient, state, admin, { deleteUsers: false })
    }
  })

  describe('SUCCESS', () => {
    it('MA-DB-1 single area rate_per_sqm creates batch, activity, movement', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'single-rate', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'single', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('single'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const applied = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('single-rate'),
      })

      expect(applied.error).toBeNull()
      const result = applied.result!
      expect(result.areas).toHaveLength(1)
      expect(result.totalApplicationAmount).toBe(2.5)
      expect(result.resultingBalance).toBe(2.5)

      const { rows: batches } = await pgClient.query(
        `select count(*)::int as count from public.fertilizer_application_batches where id = $1`,
        [result.applicationBatchId],
      )
      const { rows: movements } = await pgClient.query(
        `select count(*)::int as count, min(quantity_delta)::numeric as delta
         from public.fertilizer_stock_movements where application_batch_id = $1`,
        [result.applicationBatchId],
      )
      expect(Number(batches[0]?.count)).toBe(1)
      expect(Number(movements[0]?.count)).toBe(1)
      expect(Number(movements[0]?.delta)).toBe(-2.5)
    })

    it('MA-DB-2 two areas rate_per_sqm distribute 2.5 kg and 1.25 kg', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'two-rate', {
        initialQuantity: 10,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        rateValue: 25,
      })
      const applied = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('two-rate'),
      })

      const result = applied.result!
      expect(result.totalApplicationAmount).toBe(3.75)
      expect(amountsByAreaId(result.areas)).toEqual(
        amountsByAreaId([
          { areaId: areas.area1Id, applicationAmount: 2.5 },
          { areaId: areas.area2Id, applicationAmount: 1.25 },
        ]),
      )
      expect(result.resultingBalance).toBe(6.25)
    })

    it('MA-DB-3 two areas total_amount_proportional distribute 2 kg and 1 kg', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'two-prop', {
        initialQuantity: 10,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'total_amount_proportional',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        totalAmount: 3,
      })
      const applied = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('two-prop'),
      })

      const result = applied.result!
      expect(result.totalApplicationAmount).toBe(3)
      expect(amountsByAreaId(result.areas)).toEqual(
        amountsByAreaId([
          { areaId: areas.area1Id, applicationAmount: 2 },
          { areaId: areas.area2Id, applicationAmount: 1 },
        ]),
      )
    })

    it('MA-DB-4 ml rate_per_sqm uses ml/m² without kg conversion', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'ml-rate', {
        initialQuantity: 1000,
        unit: 'ml',
      })
      const area1Id = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'ml-a', 10)
      const area2Id = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'ml-b', 5)
      const normalized = normalizeInput({
        baseUnit: 'ml',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: area1Id, suffix: 'ml-a', areaSizeSqm: 10 },
          { areaId: area2Id, suffix: 'ml-b', areaSizeSqm: 5 },
        ]),
        rateValue: 50,
      })
      const applied = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('ml-rate'),
      })

      const result = applied.result!
      expect(result.applicationUnit).toBe('ml')
      expect(amountsByAreaId(result.areas)).toEqual(
        amountsByAreaId([
          { areaId: area1Id, applicationAmount: 500 },
          { areaId: area2Id, applicationAmount: 250 },
        ]),
      )
      expect(result.totalApplicationAmount).toBe(750)
    })

    it('MA-DB-5 ml total_amount_proportional distributes in ml', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'ml-prop', {
        initialQuantity: 500,
        unit: 'ml',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const normalized = normalizeInput({
        baseUnit: 'ml',
        mode: 'total_amount_proportional',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        totalAmount: 300,
      })
      const applied = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('ml-prop'),
      })

      const result = applied.result!
      expect(amountsByAreaId(result.areas)).toEqual(
        amountsByAreaId([
          { areaId: areas.area1Id, applicationAmount: 200 },
          { areaId: areas.area2Id, applicationAmount: 100 },
        ]),
      )
    })

    it('MA-DB-6 zero balance remains container with no negative overdraft', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'zero-balance', {
        initialQuantity: 3.75,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        rateValue: 25,
      })
      const applied = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('zero-balance'),
      })

      expect(applied.result!.resultingBalance).toBe(0)
      expect(await computeContainerBalance(pgClient, setup.itemId)).toBe(0)
      const { rows } = await pgClient.query(`select id from public.fertilizer_containers where id = $1`, [
        setup.itemId,
      ])
      expect(rows).toHaveLength(1)
    })

    it('MA-DB-7 stable sort order independent of input order', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'sort-order', {
        initialQuantity: 10,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)

      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
        ]),
        rateValue: 25,
      })
      const applied = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('sort-order'),
      })

      const expectedOrder = sortAreaIdsCanonical([areas.area1Id, areas.area2Id])
      expect(applied.result!.areas.map((area) => area.areaId.toLowerCase())).toEqual(expectedOrder)
      expect(applied.result!.areas.map((area) => area.sortOrder)).toEqual([0, 1])
    })

    it('MA-DB-8 persists area name and size snapshots on batch-area rows', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'snapshots', {
        initialQuantity: 10,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id, [100.25, 50.5])
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100.25 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50.5 },
        ]),
        rateValue: 20,
      })
      const applied = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('snapshots'),
      })

      const { rows } = await pgClient.query(
        `select area_id, area_name_snapshot, area_size_sqm_snapshot
         from public.fertilizer_application_areas
         where application_batch_id = $1
         order by sort_order`,
        [applied.result!.applicationBatchId],
      )
      const canonicalAreaIds = sortAreaIdsCanonical([areas.area1Id, areas.area2Id])
      const snapshotsByAreaId = Object.fromEntries(
        [
          { areaId: areas.area1Id, name: areas.area1Name, size: '100.25' },
          { areaId: areas.area2Id, name: areas.area2Name, size: '50.50' },
        ].map((entry) => [entry.areaId.toLowerCase(), entry]),
      )
      expect(rows[0]).toMatchObject({
        area_id: canonicalAreaIds[0],
        area_name_snapshot: snapshotsByAreaId[canonicalAreaIds[0]!]!.name,
        area_size_sqm_snapshot: snapshotsByAreaId[canonicalAreaIds[0]!]!.size,
      })
      expect(rows[1]).toMatchObject({
        area_id: canonicalAreaIds[1],
        area_name_snapshot: snapshotsByAreaId[canonicalAreaIds[1]!]!.name,
        area_size_sqm_snapshot: snapshotsByAreaId[canonicalAreaIds[1]!]!.size,
      })
    })

    it('MA-DB-9 care_group selection source stores care group snapshot', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'care-group', {
        initialQuantity: 10,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const careGroupId = await insertMultiAreaTestCareGroup(pgClient, state, setup.user.id, [
        areas.area1Id,
        areas.area2Id,
      ])
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'care_group',
        careGroupId,
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        rateValue: 25,
      })
      const applied = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('care-group'),
      })

      expect(applied.result!.selectionSource).toBe('care_group')
      const { rows } = await pgClient.query(
        `select selection_source, care_group_id_snapshot
         from public.fertilizer_application_batches where id = $1`,
        [applied.result!.applicationBatchId],
      )
      expect(rows[0]?.selection_source).toBe('care_group')
      expect(rows[0]?.care_group_id_snapshot).toBe(careGroupId)
    })
  })

  describe('VALIDATION', () => {
    it('MA-DB-10 rejects empty areas array', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'no-areas', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const { error } = await callMultiAreaRpc(setup.auth, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        applicationMode: 'rate_per_sqm',
        selectionSource: 'manual',
        confirmedInputValue: 25,
        confirmedInputUnit: 'g_per_sqm',
        totalApplicationAmount: 1,
        applicationUnit: 'kg',
        appliedAt: APPLIED_AT,
        idempotencyKey: uniqueKey('no-areas'),
        areas: [],
        userId: setup.user.id,
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_NO_AREAS_SELECTED',
      )
    })

    it('MA-DB-11 rejects duplicate area ids', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'duplicate', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'dup', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('dup'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const rpcAreas = buildRpcAreasFromNormalized(normalized)
      const { error } = await callMultiAreaRpc(
        setup.auth,
        buildRpcParams(normalized, {
          inventoryItemId: setup.itemId,
          savedProductProfileId: setup.profileId,
          userId: setup.user.id,
          idempotencyKey: uniqueKey('duplicate'),
          areasOverride: [rpcAreas[0]!, rpcAreas[0]!],
        }),
      )
      expect(extractMultiAreaErrorCode(error!.message)).toBe('FERTILIZER_MULTI_AREA_APPLICATION_DUPLICATE_AREA')
    })

    it('MA-DB-12 rejects unknown area id', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'unknown-area', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const unknownId = crypto.randomUUID()
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId: unknownId, areaName: 'Ghost', areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const { error } = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('unknown-area'),
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_TARGET_NOT_FOUND',
      )
    })

    it('MA-DB-13 rejects foreign user area', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const owner = await createCreationDatabaseTestUser(admin, state, 'foreign-owner')
      const foreignAreaId = await insertMultiAreaTestArea(pgClient, state, owner.id, 'foreign', 100)
      const setup = await setupUserWithInventory(state, 'foreign-caller', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId: foreignAreaId, areaName: areaNameForSuffix('foreign'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const { error } = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('foreign-area'),
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_TARGET_NOT_ACCESSIBLE',
      )
    })

    it('MA-DB-14 rejects area with missing size in database', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'missing-size', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = crypto.randomUUID()
      await pgClient.query(
        `insert into public.areas (id, user_id, name, size_sqm, sort_order)
         values ($1, $2, $3, null, 0)`,
        [areaId, setup.user.id, areaNameForSuffix('missing-size')],
      )
      state.areaIds.push(areaId)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('missing-size'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const { error } = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('missing-size'),
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_AREA_SIZE_MISSING',
      )
    })

    it('MA-DB-15 rejects area size snapshot mismatch', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'size-mismatch', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'size-mismatch', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('size-mismatch'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const rpcAreas = buildRpcAreasFromNormalized(normalized)
      rpcAreas[0]!.areaSizeSqmSnapshot = 99
      const { error } = await callMultiAreaRpc(
        setup.auth,
        buildRpcParams(normalized, {
          inventoryItemId: setup.itemId,
          savedProductProfileId: setup.profileId,
          userId: setup.user.id,
          idempotencyKey: uniqueKey('size-mismatch'),
          areasOverride: rpcAreas,
        }),
      )
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_AREA_SNAPSHOT_MISMATCH',
      )
    })

    it('MA-DB-16 rejects area name snapshot mismatch', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'name-mismatch', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'name-mismatch', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('name-mismatch'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const rpcAreas = buildRpcAreasFromNormalized(normalized)
      rpcAreas[0]!.areaNameSnapshot = 'Wrong Name'
      const { error } = await callMultiAreaRpc(
        setup.auth,
        buildRpcParams(normalized, {
          inventoryItemId: setup.itemId,
          savedProductProfileId: setup.profileId,
          userId: setup.user.id,
          idempotencyKey: uniqueKey('name-mismatch'),
          areasOverride: rpcAreas,
        }),
      )
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_AREA_SNAPSHOT_MISMATCH',
      )
    })

    it('MA-DB-17 rejects invalid application mode', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'invalid-mode', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'invalid-mode', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('invalid-mode'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const params = buildRpcParams(normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('invalid-mode'),
      })
      const { error } = await callMultiAreaRpc(setup.auth, {
        ...params,
        applicationMode: 'invalid_mode' as 'rate_per_sqm',
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_MODE_INVALID',
      )
    })

    it('MA-DB-18 rejects invalid rate unit for rate_per_sqm mode', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'invalid-rate-unit', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'invalid-rate-unit', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('invalid-rate-unit'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const params = buildRpcParams(normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('invalid-rate-unit'),
      })
      const { error } = await callMultiAreaRpc(setup.auth, {
        ...params,
        confirmedInputUnit: 'ml_per_sqm',
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_RATE_UNIT_INVALID',
      )
    })

    it('MA-DB-19 rejects invalid base application unit', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'invalid-base-unit', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'invalid-base-unit', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('invalid-base-unit'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const params = buildRpcParams(normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('invalid-base-unit'),
      })
      const { error } = await callMultiAreaRpc(setup.auth, {
        ...params,
        applicationUnit: 'g' as 'kg',
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_UNIT_INVALID',
      )
    })

    it('MA-DB-20 rejects zero total application amount', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'zero-amount', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'zero-amount', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('zero-amount'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const params = buildRpcParams(normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('zero-amount'),
      })
      const { error } = await callMultiAreaRpc(setup.auth, {
        ...params,
        totalApplicationAmount: 0,
        confirmedInputValue: 0,
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_RATE_INVALID',
      )
    })

    it('MA-DB-21 rejects per-area amount below 0.0001', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'too-small', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'too-small', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('too-small'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const rpcAreas = buildRpcAreasFromNormalized(normalized)
      rpcAreas[0]!.applicationAmount = 0.00001
      const { error } = await callMultiAreaRpc(
        setup.auth,
        buildRpcParams(normalized, {
          inventoryItemId: setup.itemId,
          savedProductProfileId: setup.profileId,
          userId: setup.user.id,
          idempotencyKey: uniqueKey('too-small'),
          areasOverride: rpcAreas,
        }),
      )
      expect(rpcAreas[0]!.applicationAmount).toBe(0.00001)
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_AMOUNT_TOO_SMALL',
      )
    })

    it('MA-DB-22 rejects confirmed input precision beyond four decimals', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'precision', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'precision', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('precision'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const params = buildRpcParams(normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('precision'),
      })
      const { error } = await callMultiAreaRpc(setup.auth, {
        ...params,
        confirmedInputValue: 25.12345,
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_AMOUNT_PRECISION_INVALID',
      )
    })

    it('MA-DB-23 rejects wrong proportional sum', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'wrong-sum', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'total_amount_proportional',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        totalAmount: 3,
      })
      const params = buildRpcParams(normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('wrong-sum'),
      })
      const { error } = await callMultiAreaRpc(setup.auth, {
        ...params,
        totalApplicationAmount: 2.5,
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID',
      )
    })

    it('MA-DB-24 rejects wrong rate_per_sqm amount calculation', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'wrong-rate', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'wrong-rate', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('wrong-rate'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const rpcAreas = buildRpcAreasFromNormalized(normalized)
      rpcAreas[0]!.applicationAmount = 9.99
      const { error } = await callMultiAreaRpc(
        setup.auth,
        buildRpcParams(normalized, {
          inventoryItemId: setup.itemId,
          savedProductProfileId: setup.profileId,
          userId: setup.user.id,
          idempotencyKey: uniqueKey('wrong-rate'),
          areasOverride: rpcAreas,
        }),
      )
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID',
      )
    })

    it('MA-DB-25 rejects wrong proportional distribution shares', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'wrong-prop', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'total_amount_proportional',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        totalAmount: 3,
      })
      const rpcAreas = buildRpcAreasFromNormalized(normalized)
      rpcAreas[0]!.applicationAmount = 1.5
      rpcAreas[1]!.applicationAmount = 1.5
      const { error } = await callMultiAreaRpc(
        setup.auth,
        buildRpcParams(normalized, {
          inventoryItemId: setup.itemId,
          savedProductProfileId: setup.profileId,
          userId: setup.user.id,
          idempotencyKey: uniqueKey('wrong-prop'),
          areasOverride: rpcAreas,
        }),
      )
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID',
      )
    })

    it('MA-DB-26 rejects proportional remainder that does not sum to total', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'wrong-remainder', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const area1Id = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'rem-a', 100)
      const area2Id = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'rem-b', 100)
      const area3Id = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'rem-c', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'total_amount_proportional',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: area1Id, suffix: 'rem-a', areaSizeSqm: 100 },
          { areaId: area2Id, suffix: 'rem-b', areaSizeSqm: 100 },
          { areaId: area3Id, suffix: 'rem-c', areaSizeSqm: 100 },
        ]),
        totalAmount: 1,
      })
      const rpcAreas = buildRpcAreasFromNormalized(normalized)
      rpcAreas[0]!.applicationAmount = 0.3333
      rpcAreas[1]!.applicationAmount = 0.3333
      rpcAreas[2]!.applicationAmount = 0.3333
      const { error } = await callMultiAreaRpc(
        setup.auth,
        buildRpcParams(normalized, {
          inventoryItemId: setup.itemId,
          savedProductProfileId: setup.profileId,
          userId: setup.user.id,
          idempotencyKey: uniqueKey('wrong-remainder'),
          areasOverride: rpcAreas,
        }),
      )
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID',
      )
    })

    it('MA-DB-27 rejects over-application (insufficient stock)', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'overdraft', {
        initialQuantity: 1,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        rateValue: 25,
      })
      const { error } = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('overdraft'),
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_INSUFFICIENT_STOCK',
      )
    })

    it('MA-DB-28 rejects product profile mismatch', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'profile-mismatch', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'profile-mismatch', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('profile-mismatch'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const { error } = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: crypto.randomUUID(),
        userId: setup.user.id,
        idempotencyKey: uniqueKey('profile-mismatch'),
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_PRODUCT_PROFILE_MISMATCH',
      )
    })

    it('MA-DB-29 rejects unknown inventory item id', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'missing-inventory', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'missing-inventory', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('missing-inventory'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const { error } = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: crypto.randomUUID(),
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('missing-inventory'),
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_INVENTORY_ITEM_NOT_FOUND',
      )
    })

    it('MA-DB-30 rejects care_group area outside selected group', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'wrong-care-group', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const careGroupId = await insertMultiAreaTestCareGroup(pgClient, state, setup.user.id, [areas.area1Id])
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'care_group',
        careGroupId,
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        rateValue: 25,
      })
      const { error } = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('wrong-care-group'),
      })
      expect(extractMultiAreaErrorCode(error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_DISTRIBUTION_INVALID',
      )
    })
  })

  describe('IDEMPOTENCY', () => {
    it('MA-DB-31 identical retry is idempotent', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'idem-retry', {
        initialQuantity: 10,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        rateValue: 25,
      })
      const idempotencyKey = uniqueKey('idem-retry')
      const params = buildRpcParams(normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey,
      })
      const first = parseMultiAreaRpcSuccess((await callMultiAreaRpc(setup.auth, params)).data)
      trackMultiAreaSuccess(state, first, idempotencyKey)
      const second = parseMultiAreaRpcSuccess((await callMultiAreaRpc(setup.auth, params)).data)

      expect(second.idempotentReplay).toBe(true)
      expect(second.applicationBatchId).toBe(first.applicationBatchId)
      expect(second.movementId).toBe(first.movementId)
      const { rows } = await pgClient.query(
        `select count(*)::int as count from public.fertilizer_stock_movements where application_batch_id = $1`,
        [first.applicationBatchId],
      )
      expect(Number(rows[0]?.count)).toBe(1)
    })

    it('MA-DB-32 same key with different payload conflicts', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'idem-conflict', {
        initialQuantity: 10,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const idempotencyKey = uniqueKey('idem-conflict')
      const baseNormalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        rateValue: 25,
      })
      const first = await callMultiAreaRpc(
        setup.auth,
        buildRpcParams(baseNormalized, {
          inventoryItemId: setup.itemId,
          savedProductProfileId: setup.profileId,
          userId: setup.user.id,
          idempotencyKey,
        }),
      )
      trackMultiAreaSuccess(state, parseMultiAreaRpcSuccess(first.data), idempotencyKey)

      const conflicting = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        rateValue: 30,
      })
      const second = await callMultiAreaRpc(
        setup.auth,
        buildRpcParams(conflicting, {
          inventoryItemId: setup.itemId,
          savedProductProfileId: setup.profileId,
          userId: setup.user.id,
          idempotencyKey,
        }),
      )
      expect(extractMultiAreaErrorCode(second.error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_IDEMPOTENCY_CONFLICT',
      )
    })

    it('MA-DB-33 parallel identical calls produce one batch', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'parallel-idem', {
        initialQuantity: 10,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        rateValue: 25,
      })
      const idempotencyKey = uniqueKey('parallel-idem')
      const params = buildRpcParams(normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey,
      })
      const [first, second] = await Promise.all([
        callMultiAreaRpc(setup.auth, params),
        callMultiAreaRpc(setup.auth, params),
      ])
      expect(first.error).toBeNull()
      expect(second.error).toBeNull()
      const parsedFirst = parseMultiAreaRpcSuccess(first.data)
      const parsedSecond = parseMultiAreaRpcSuccess(second.data)
      trackMultiAreaSuccess(state, parsedFirst, idempotencyKey)
      expect(parsedFirst.applicationBatchId).toBe(parsedSecond.applicationBatchId)
      expect(parsedFirst.movementId).toBe(parsedSecond.movementId)
    })

    it('MA-DB-34 parallel different keys on same container prevent double spend', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'parallel-compete', {
        initialQuantity: 3.75,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        rateValue: 25,
      })
      const keyA = uniqueKey('compete-a')
      const keyB = uniqueKey('compete-b')
      const base = {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
      }
      const [first, second] = await Promise.all([
        callMultiAreaRpc(setup.auth, buildRpcParams(normalized, { ...base, idempotencyKey: keyA })),
        callMultiAreaRpc(setup.auth, buildRpcParams(normalized, { ...base, idempotencyKey: keyB })),
      ])
      const successes = [first, second].filter((entry) => entry.error == null)
      const failures = [first, second].filter((entry) => entry.error != null)
      expect(successes).toHaveLength(1)
      expect(failures).toHaveLength(1)
      expect(extractMultiAreaErrorCode(failures[0]!.error!.message)).toBe(
        'FERTILIZER_MULTI_AREA_APPLICATION_INSUFFICIENT_STOCK',
      )
      const winningKey = first.error == null ? keyA : keyB
      trackMultiAreaSuccess(state, parseMultiAreaRpcSuccess(successes[0]!.data), winningKey)
      expect(await computeContainerBalance(pgClient, setup.itemId)).toBe(0)
    })
  })

  describe('ROLLBACK', () => {
    it('MA-DB-35 invalid second area leaves no batch artifacts', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'rollback-partial', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'rollback-valid', 100)
      const unknownId = crypto.randomUUID()
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId, suffix: 'rollback-valid', areaSizeSqm: 100 },
          { areaId: unknownId, suffix: 'rollback-missing', areaSizeSqm: 50 },
        ]),
        rateValue: 25,
      })
      const idempotencyKey = uniqueKey('rollback-partial')
      const activityCountBefore = await countActivitiesForAreaIds([areaId])
      const { error } = await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey,
      })
      expect(error).not.toBeNull()
      const artifacts = await countMultiAreaFailureArtifacts(pgClient, {
        userId: setup.user.id,
        idempotencyKey,
        inventoryItemId: setup.itemId,
      })
      expect(artifacts.batches).toBe(0)
      expect(await countActivitiesForAreaIds([areaId])).toBe(activityCountBefore)
      expect(artifacts.activities).toBe(0)
      expect(artifacts.fertilizationDetails).toBe(0)
      expect(artifacts.movements).toBe(0)
    })

    it('MA-DB-36 balance unchanged on reference validation failure', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'rollback-balance', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const balanceBefore = await computeContainerBalance(pgClient, setup.itemId)
      const { rows: movementsBefore } = await pgClient.query(
        `select count(*)::int as count from public.fertilizer_stock_movements where container_id = $1`,
        [setup.itemId],
      )
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId: crypto.randomUUID(), areaName: 'Missing', areaSizeSqm: 100 }],
        rateValue: 25,
      })
      await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey: uniqueKey('rollback-balance'),
      })
      expect(await computeContainerBalance(pgClient, setup.itemId)).toBe(balanceBefore)
      const { rows: movementsAfter } = await pgClient.query(
        `select count(*)::int as count from public.fertilizer_stock_movements where container_id = $1`,
        [setup.itemId],
      )
      expect(Number(movementsAfter[0]?.count)).toBe(Number(movementsBefore[0]?.count))
    })

    it('MA-DB-37 no batch on pre-validation failure (invalid mode)', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'rollback-pre', {
        initialQuantity: 5,
        unit: 'kg',
      })
      const areaId = await insertMultiAreaTestArea(pgClient, state, setup.user.id, 'rollback-pre', 100)
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: [{ areaId, areaName: areaNameForSuffix('rollback-pre'), areaSizeSqm: 100 }],
        rateValue: 25,
      })
      const idempotencyKey = uniqueKey('rollback-pre')
      const params = buildRpcParams(normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey,
      })
      await callMultiAreaRpc(setup.auth, {
        ...params,
        applicationMode: 'bogus' as 'rate_per_sqm',
      })
      const artifacts = await countMultiAreaFailureArtifacts(pgClient, {
        userId: setup.user.id,
        idempotencyKey,
        inventoryItemId: setup.itemId,
      })
      expect(artifacts.batches).toBe(0)
      expect(artifacts.movements).toBe(0)
    })

    it('MA-DB-38 overdraft failure leaves no batch and unchanged balance', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const setup = await setupUserWithInventory(state, 'rollback-over', {
        initialQuantity: 1,
        unit: 'kg',
      })
      const areas = await insertTwoAreas(state, setup.user.id)
      const balanceBefore = await computeContainerBalance(pgClient, setup.itemId)
      const idempotencyKey = uniqueKey('rollback-over')
      const normalized = normalizeInput({
        baseUnit: 'kg',
        mode: 'rate_per_sqm',
        selectionSource: 'manual',
        areas: buildAreaInputs([
          { areaId: areas.area1Id, suffix: 'a', areaSizeSqm: 100 },
          { areaId: areas.area2Id, suffix: 'b', areaSizeSqm: 50 },
        ]),
        rateValue: 25,
      })
      await applyNormalized(setup.auth, state, normalized, {
        inventoryItemId: setup.itemId,
        savedProductProfileId: setup.profileId,
        userId: setup.user.id,
        idempotencyKey,
      })
      const artifacts = await countMultiAreaFailureArtifacts(pgClient, {
        userId: setup.user.id,
        idempotencyKey,
        inventoryItemId: setup.itemId,
      })
      expect(artifacts.batches).toBe(0)
      expect(await computeContainerBalance(pgClient, setup.itemId)).toBe(balanceBefore)
    })
  })

  describe('IMMUTABILITY', () => {
    it('MA-DB-39 blocks direct batch update', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'batch-update')
      await expect(
        pgClient.query(
          `update public.fertilizer_application_batches set note = 'changed' where id = $1`,
          [baseline.result.applicationBatchId],
        ),
      ).rejects.toThrow(/FERTILIZER_MULTI_AREA_APPLICATION_BATCH_IMMUTABLE/)
    })

    it('MA-DB-40 blocks direct batch delete', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'batch-delete')
      await expect(
        pgClient.query(`delete from public.fertilizer_application_batches where id = $1`, [
          baseline.result.applicationBatchId,
        ]),
      ).rejects.toThrow(/FERTILIZER_MULTI_AREA_APPLICATION_BATCH_IMMUTABLE/)
    })

    it('MA-DB-41 blocks direct batch-area update', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'batch-area-update')
      const { rows } = await pgClient.query(
        `select id from public.fertilizer_application_areas where application_batch_id = $1 limit 1`,
        [baseline.result.applicationBatchId],
      )
      await expect(
        pgClient.query(
          `update public.fertilizer_application_areas set application_amount = 9 where id = $1`,
          [rows[0]?.id],
        ),
      ).rejects.toThrow(/FERTILIZER_MULTI_AREA_APPLICATION_BATCH_AREA_IMMUTABLE/)
    })

    it('MA-DB-42 blocks direct batch-area delete without area deletion context', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'batch-area-delete')
      const { rows } = await pgClient.query(
        `select id from public.fertilizer_application_areas where application_batch_id = $1 limit 1`,
        [baseline.result.applicationBatchId],
      )
      await expect(
        pgClient.query(`delete from public.fertilizer_application_areas where id = $1`, [rows[0]?.id]),
      ).rejects.toThrow(/FERTILIZER_MULTI_AREA_APPLICATION_BATCH_AREA_IMMUTABLE/)
    })

    it('MA-DB-43 blocks direct inventory-coupled activity update', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'activity-update')
      const activityId = baseline.result.areas[0]!.activityId
      await expect(
        pgClient.query(`update public.activities set title = 'changed' where id = $1`, [activityId]),
      ).rejects.toThrow(/FERTILIZER_APPLICATION_ACTIVITY_IMMUTABLE/)
    })

    it('MA-DB-44 blocks direct inventory-coupled activity delete', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'activity-delete')
      const activityId = baseline.result.areas[0]!.activityId
      await expect(
        pgClient.query(`delete from public.activities where id = $1`, [activityId]),
      ).rejects.toThrow(/FERTILIZER_APPLICATION_ACTIVITY_IMMUTABLE/)
    })

    it('MA-DB-45 blocks direct inventory-coupled fertilization_details update', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'details-update')
      const activityId = baseline.result.areas[0]!.activityId
      await expect(
        pgClient.query(
          `update public.fertilization_details set amount_applied = 99 where activity_id = $1`,
          [activityId],
        ),
      ).rejects.toThrow(/FERTILIZER_APPLICATION_FERTILIZATION_IMMUTABLE/)
    })

    it('MA-DB-46 blocks direct inventory-coupled fertilization_details delete', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'details-delete')
      const activityId = baseline.result.areas[0]!.activityId
      await expect(
        pgClient.query(`delete from public.fertilization_details where activity_id = $1`, [activityId]),
      ).rejects.toThrow(/FERTILIZER_APPLICATION_FERTILIZATION_IMMUTABLE/)
    })

    it('MA-DB-47 blocks direct movement update', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'movement-update')
      await expect(
        pgClient.query(
          `update public.fertilizer_stock_movements set quantity_delta = -99 where id = $1`,
          [baseline.result.movementId],
        ),
      ).rejects.toThrow(/INVENTORY_MOVEMENT_IMMUTABLE/)
    })

    it('MA-DB-48 blocks direct movement delete', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'movement-delete')
      await expect(
        pgClient.query(`delete from public.fertilizer_stock_movements where id = $1`, [
          baseline.result.movementId,
        ]),
      ).rejects.toThrow(/INVENTORY_MOVEMENT_IMMUTABLE/)
    })

    it('MA-DB-49 non-inventory-coupled activity remains editable', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const user = await createCreationDatabaseTestUser(admin, state, 'manual-activity')
      const areaId = await insertMultiAreaTestArea(pgClient, state, user.id, 'manual', 100)
      const activityId = await insertNonInventoryCoupledActivity(pgClient, state, user.id, areaId)
      await pgClient.query(`update public.activities set title = $2 where id = $1`, [
        activityId,
        `${MULTI_AREA_DB_TEST_PREFIX}-manual-updated`,
      ])
      const { rows } = await pgClient.query(`select title from public.activities where id = $1`, [activityId])
      expect(rows[0]?.title).toBe(`${MULTI_AREA_DB_TEST_PREFIX}-manual-updated`)
    })
  })

  describe('AREA DELETE DL-032', () => {
    it('MA-DB-50 deleting one of two areas preserves other area artifacts and balance', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'delete-one')
      const primaryId =
        baseline.area1Id.toLowerCase() < baseline.area2Id.toLowerCase()
          ? baseline.area1Id
          : baseline.area2Id
      const secondaryId = primaryId === baseline.area1Id ? baseline.area2Id : baseline.area1Id
      const balanceBefore = await computeContainerBalance(pgClient, baseline.itemId)

      await deleteAreaForMultiAreaTest(pgClient, primaryId)

      const { rows: remainingBatchAreas } = await pgClient.query(
        `select area_id from public.fertilizer_application_areas where application_batch_id = $1`,
        [baseline.result.applicationBatchId],
      )
      const { rows: batches } = await pgClient.query(
        `select id from public.fertilizer_application_batches where id = $1`,
        [baseline.result.applicationBatchId],
      )
      const { rows: movements } = await pgClient.query(
        `select id from public.fertilizer_stock_movements where id = $1`,
        [baseline.result.movementId],
      )
      const { rows: remainingActivities } = await pgClient.query(
        `select id from public.activities where area_id = $1`,
        [secondaryId],
      )

      expect(batches).toHaveLength(1)
      expect(movements).toHaveLength(1)
      expect(remainingBatchAreas).toHaveLength(1)
      expect(remainingBatchAreas[0]?.area_id).toBe(secondaryId)
      expect(remainingActivities).toHaveLength(1)
      expect(await computeContainerBalance(pgClient, baseline.itemId)).toBe(balanceBefore)
    })

    it('MA-DB-51 deleting primary area sets movement activity_id to null', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'delete-primary')
      const primaryAreaId = baseline.result.areas[0]!.areaId

      await deleteAreaForMultiAreaTest(pgClient, primaryAreaId)

      const { rows } = await pgClient.query(
        `select activity_id from public.fertilizer_stock_movements where id = $1`,
        [baseline.result.movementId],
      )
      expect(rows[0]?.activity_id).toBeNull()
    })

    it('MA-DB-52 deleting all areas leaves batch and movement intact', async () => {
      state = createEmptyMultiAreaDatabaseTestState()
      const baseline = await applyTwoAreaRateBaseline(state, 'delete-all')
      const balanceBefore = await computeContainerBalance(pgClient, baseline.itemId)

      await deleteAreaForMultiAreaTest(pgClient, baseline.area1Id)
      await deleteAreaForMultiAreaTest(pgClient, baseline.area2Id)

      const { rows: batches } = await pgClient.query(
        `select id from public.fertilizer_application_batches where id = $1`,
        [baseline.result.applicationBatchId],
      )
      const { rows: movements } = await pgClient.query(
        `select id, activity_id from public.fertilizer_stock_movements where id = $1`,
        [baseline.result.movementId],
      )
      const { rows: batchAreas } = await pgClient.query(
        `select count(*)::int as count from public.fertilizer_application_areas where application_batch_id = $1`,
        [baseline.result.applicationBatchId],
      )
      const { rows: activities } = await pgClient.query(
        `select count(*)::int as count from public.activities where id = any($1::uuid[])`,
        [baseline.result.areas.map((area) => area.activityId)],
      )

      expect(batches).toHaveLength(1)
      expect(movements).toHaveLength(1)
      expect(movements[0]?.activity_id).toBeNull()
      expect(Number(batchAreas[0]?.count)).toBe(0)
      expect(Number(activities[0]?.count)).toBe(0)
      expect(await computeContainerBalance(pgClient, baseline.itemId)).toBe(balanceBefore)
    })
  })
})

