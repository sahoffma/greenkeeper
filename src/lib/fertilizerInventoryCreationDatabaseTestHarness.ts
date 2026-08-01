import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client } from 'pg'
import { buildInventoryCreationMovementIdempotencyKey } from './fertilizerInventoryCreationRpcCore'
import { CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC } from './fertilizerInventoryCreationRpcCore'

export const CREATION_DB_DEV_REF = 'amyounxrsxgujsfutshx'
export const CREATION_DB_TEST_PREFIX = 'gk-7b-db'
export const CREATION_DB_FAKE_SESSION_HASH = '0123456789abcdef'.repeat(4)
export const CREATION_DB_FAKE_SESSION_HASH_B = 'fedcba9876543210'.repeat(4)

const MIGRATION_DIR = resolve(process.cwd(), 'supabase/migrations')
const CREATION_MIGRATIONS = [
  {
    file: '20250804_fertilizer_saved_product_profiles.sql',
    probeSql: `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'product_profiles' and column_name = 'access_kind'`,
  },
  {
    file: '20250805_fertilizer_inventory_core.sql',
    probeSql: `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'fertilizer_containers' and column_name = 'base_unit'`,
  },
  {
    file: '20250806_fertilizer_inventory_creation_core.sql',
    probeSql: `select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'fertilizer_inventory_creation_receipts'`,
  },
] as const

export interface CreationDatabaseTestConfig {
  supabaseUrl: string
  projectRef: string
  anonKey: string
  serviceRoleKey: string
  dbPassword: string
}

export interface CreationDatabaseTestState {
  testUsers: Array<{ id: string; email: string; password: string; label: string }>
  profileIds: string[]
  receiptIds: string[]
  containerIds: string[]
  idempotencyKeys: string[]
}

export interface SavedProductProfileFixture {
  id: string
  accessKind: 'authenticated_user' | 'session'
  userId: string | null
  sessionAccessHash: string | null
  productForm: 'granular' | 'liquid'
}

export interface CreationRpcPackageInput {
  packageSizeValue: number
  packageSizeUnit: 'kg' | 'ml'
  initialQuantityValue: number
  clientCorrelationId?: string | null
}

export interface CreationRpcCallParams {
  savedProductProfileId: string
  accessKind: 'authenticated_user' | 'session'
  userId: string | null
  sessionAccessHash: string | null
  creationReason: 'initial_stock' | 'purchase' | 'gift_received'
  idempotencyKey: string
  sourceEventRef?: string | null
  packages: readonly CreationRpcPackageInput[]
}

function parseEnvFile(envPath: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      }),
  )
}

export function isCreationDatabaseWriteTestsEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.ALLOW_SUPABASE_WRITE_TESTS === 'true'
}

export function resolveCreationDatabaseTestConfig(
  envValues: Record<string, string>,
): CreationDatabaseTestConfig | null {
  const supabaseUrl = (envValues.SUPABASE_URL ?? envValues.VITE_SUPABASE_URL ?? '').trim()
  const projectRef =
    supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1]?.toLowerCase() ?? ''

  if (!supabaseUrl || !projectRef) {
    return null
  }

  if (projectRef === 'keoxzyzdkvebedgdswah' || projectRef === 'greenkeeper-prod') {
    return null
  }

  if (projectRef !== CREATION_DB_DEV_REF) {
    return null
  }

  const anonKey = envValues.VITE_SUPABASE_ANON_KEY?.trim() ?? ''
  const serviceRoleKey = envValues.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
  const dbPassword = envValues.SUPABASE_DB_PASSWORD?.trim() ?? ''

  if (!anonKey || !serviceRoleKey || !dbPassword) {
    return null
  }

  return {
    supabaseUrl,
    projectRef,
    anonKey,
    serviceRoleKey,
    dbPassword,
  }
}

export function loadCreationDatabaseTestConfig(): CreationDatabaseTestConfig | null {
  if (!isCreationDatabaseWriteTestsEnabled()) {
    return null
  }

  const envPath = resolve(process.cwd(), '.env.local')
  let values: Record<string, string>
  try {
    values = parseEnvFile(envPath)
  } catch {
    return null
  }

  return resolveCreationDatabaseTestConfig(values)
}

export function createEmptyCreationDatabaseTestState(): CreationDatabaseTestState {
  return {
    testUsers: [],
    profileIds: [],
    receiptIds: [],
    containerIds: [],
    idempotencyKeys: [],
  }
}

export async function connectCreationTestPg(
  config: CreationDatabaseTestConfig,
): Promise<Client> {
  const hosts = [`db.${CREATION_DB_DEV_REF}.supabase.co`, 'aws-0-eu-central-1.pooler.supabase.com']
  let lastError: unknown

  for (const host of hosts) {
    const isPooler = host.includes('pooler')
    const client = new Client({
      host,
      port: isPooler ? 6543 : 5432,
      user: isPooler ? `postgres.${CREATION_DB_DEV_REF}` : 'postgres',
      password: config.dbPassword,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
    })

    try {
      await client.connect()
      return client
    } catch (error) {
      lastError = error
      await client.end().catch(() => undefined)
    }
  }

  throw lastError
}

export function createAdminSupabaseClient(config: CreationDatabaseTestConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function createAuthenticatedSupabaseClient(
  config: CreationDatabaseTestConfig,
  email: string,
  password: string,
): Promise<SupabaseClient> {
  const client = createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(`Login failed for ${email}: ${error.message}`)
  }
  return client
}

export async function createCreationDatabaseTestUser(
  admin: SupabaseClient,
  state: CreationDatabaseTestState,
  label: string,
  password = 'Gk7bDbTest123!',
): Promise<{ id: string; email: string; password: string }> {
  const email = `${CREATION_DB_TEST_PREFIX}-${label}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}@example.com`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) {
    throw new Error(`Test user ${label}: ${error.message}`)
  }

  const user = { id: data.user.id, email, password, label }
  state.testUsers.push(user)
  return user
}

export async function ensureCreationMigrationsApplied(client: Client): Promise<boolean> {
  let applied = false
  for (const migration of CREATION_MIGRATIONS) {
    const probe = await client.query(migration.probeSql)
    if (probe.rows.length > 0) {
      continue
    }

    const sql = readFileSync(resolve(MIGRATION_DIR, migration.file), 'utf8')
    await client.query(sql)
    applied = true
  }

  return applied
}

export async function reloadPostgrestSchema(client: Client): Promise<void> {
  await client.query(`NOTIFY pgrst, 'reload schema'`)
  await new Promise((resolve) => setTimeout(resolve, 2_000))
}

async function withTestReplicationRole(client: Client, run: () => Promise<void>): Promise<void> {
  await client.query('begin')
  try {
    await client.query(`set local session_replication_role = replica`)
    await run()
    await client.query('commit')
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  }
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function insertSavedProductProfileFixture(
  client: Client,
  state: CreationDatabaseTestState,
  options: {
    accessKind: 'authenticated_user' | 'session'
    userId: string | null
    sessionAccessHash: string | null
    productForm: 'granular' | 'liquid'
    suffix?: string
  },
): Promise<SavedProductProfileFixture> {
  const suffix = options.suffix ?? uniqueSuffix()
  const id = crypto.randomUUID()
  const nutrientMatrix = { nitrogen: { status: 'declared', value: 15 } }

  await client.query(
    `insert into public.product_profiles (
      id, user_id, session_access_hash, access_kind,
      identity_fingerprint, brand, product_line, official_name, variant, product_form,
      nitrogen, phosphate, potash, npk_declaration,
      source, profile_status, verification_status,
      product_family_key, nutrient_matrix, composition_fingerprint_version,
      composition_fingerprint, provenance_json, save_idempotency_key
    ) values (
      $1, $2, $3, $4,
      $5, $6, $7, $8, $9, $10,
      15, 0, 26, '15-0-26',
      'enrichment', 'saved', 'verified',
      $11, $12::jsonb, 'fertilizer-composition-v1',
      $13, $14::jsonb, $15
    )`,
    [
      id,
      options.userId,
      options.sessionAccessHash,
      options.accessKind,
      `${CREATION_DB_TEST_PREFIX}-identity-${suffix}`,
      `${CREATION_DB_TEST_PREFIX}-brand`,
      `${CREATION_DB_TEST_PREFIX}-line`,
      `${CREATION_DB_TEST_PREFIX}-product`,
      '15-0-26',
      options.productForm,
      `${CREATION_DB_TEST_PREFIX}-family-${suffix}`,
      JSON.stringify(nutrientMatrix),
      `${CREATION_DB_TEST_PREFIX}-fp-${suffix}`,
      JSON.stringify({ confirmedAt: new Date().toISOString(), source: CREATION_DB_TEST_PREFIX }),
      `${CREATION_DB_TEST_PREFIX}-save-${suffix}`,
    ],
  )

  state.profileIds.push(id)
  return {
    id,
    accessKind: options.accessKind,
    userId: options.userId,
    sessionAccessHash: options.sessionAccessHash,
    productForm: options.productForm,
  }
}

export async function insertDraftProductProfileFixture(
  client: Client,
  state: CreationDatabaseTestState,
  userId: string,
): Promise<string> {
  const suffix = uniqueSuffix()
  const { rows } = await client.query(
    `insert into public.product_profiles (
      user_id, identity_fingerprint, brand, source, profile_status, verification_status
    ) values ($1, $2, $3, 'packaging_photo', 'draft', 'unverified')
    returning id`,
    [userId, `${CREATION_DB_TEST_PREFIX}-draft-${suffix}`, `${CREATION_DB_TEST_PREFIX}-brand`],
  )
  const profileId = rows[0].id as string
  state.profileIds.push(profileId)
  return profileId
}

export function buildRpcPackages(
  packages: readonly CreationRpcPackageInput[],
): Array<Record<string, unknown>> {
  return packages.map((pkg, sequenceIndex) => ({
    sequence_index: sequenceIndex,
    package_size_value: pkg.packageSizeValue,
    package_size_unit: pkg.packageSizeUnit,
    initial_quantity_value: pkg.initialQuantityValue,
    initial_quantity_unit: pkg.packageSizeUnit,
    client_correlation_id: pkg.clientCorrelationId ?? null,
  }))
}

export function buildCreationRpcParams(
  params: CreationRpcCallParams,
): Record<string, unknown> {
  return {
    p_saved_product_profile_id: params.savedProductProfileId,
    p_access_kind: params.accessKind,
    p_user_id: params.userId,
    p_session_access_hash: params.sessionAccessHash,
    p_creation_reason: params.creationReason,
    p_idempotency_key: params.idempotencyKey,
    p_source_event_ref: params.sourceEventRef ?? null,
    p_packages: buildRpcPackages(params.packages),
  }
}

export async function callCreationRpcWithPackagesJson(
  client: SupabaseClient,
  params: Omit<CreationRpcCallParams, 'packages'>,
  packagesJson: Array<Record<string, unknown>>,
): Promise<{ data: unknown; error: { message: string } | null }> {
  return client.rpc(CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC, {
    p_saved_product_profile_id: params.savedProductProfileId,
    p_access_kind: params.accessKind,
    p_user_id: params.userId,
    p_session_access_hash: params.sessionAccessHash,
    p_creation_reason: params.creationReason,
    p_idempotency_key: params.idempotencyKey,
    p_source_event_ref: params.sourceEventRef ?? null,
    p_packages: packagesJson,
  })
}

export async function callCreationRpc(
  client: SupabaseClient,
  params: CreationRpcCallParams,
): Promise<{ data: unknown; error: { message: string } | null }> {
  return client.rpc(
    CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC,
    buildCreationRpcParams(params),
  )
}

export function extractErrorCode(message: string): string | null {
  const match = message.match(/INVENTORY_CREATION_[A-Z_]+/)
  return match?.[0] ?? null
}

export function parseCreationRpcSuccess(payload: unknown): {
  operationId: string
  idempotencyKey: string
  packages: Array<{
    sequenceIndex: number
    clientCorrelationId: string | null
    itemId: string
    movementId: string
    movementKey: string | null
    packageSizeValue: number
    initialQuantityValue: number
    unit: string
    movementType: string
    movementOrigin: string
  }>
} {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Creation RPC returned an empty payload.')
  }

  const record = payload as Record<string, unknown>
  if (typeof record.operation_id !== 'string' || typeof record.idempotency_key !== 'string') {
    throw new Error('Creation RPC payload is missing operation metadata.')
  }

  if (!Array.isArray(record.packages)) {
    throw new Error('Creation RPC payload is missing packages.')
  }

  const packages = record.packages.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Creation RPC package entry is invalid.')
    }
    const pkg = entry as Record<string, unknown>
    const item = pkg.item as Record<string, unknown>
    const movement = pkg.initial_movement as Record<string, unknown>
    return {
      sequenceIndex: Number(pkg.sequence_index),
      clientCorrelationId:
        pkg.client_correlation_id == null ? null : String(pkg.client_correlation_id),
      itemId: String(item.id),
      movementId: String(movement.id),
      movementKey:
        movement.inventory_idempotency_key == null
          ? null
          : String(movement.inventory_idempotency_key),
      packageSizeValue: Number(item.package_size_value),
      initialQuantityValue: Number(movement.quantity_delta),
      unit: String(movement.unit),
      movementType: String(movement.movement_type),
      movementOrigin: String(movement.movement_origin),
    }
  })

  return {
    operationId: record.operation_id,
    idempotencyKey: record.idempotency_key,
    packages: packages.sort((left, right) => left.sequenceIndex - right.sequenceIndex),
  }
}

export function trackCreationResult(
  state: CreationDatabaseTestState,
  result: ReturnType<typeof parseCreationRpcSuccess>,
): void {
  state.receiptIds.push(result.operationId)
  state.idempotencyKeys.push(result.idempotencyKey)
  for (const pkg of result.packages) {
    state.containerIds.push(pkg.itemId)
  }
}

export function expectedMovementKey(receiptId: string, sequenceIndex: number): string {
  return buildInventoryCreationMovementIdempotencyKey(receiptId, sequenceIndex)
}

export async function installSecondContainerRollbackTrigger(
  client: Client,
  profileId: string,
): Promise<void> {
  await client.query(`
    create or replace function public.gk_7b_test_block_second_container()
    returns trigger
    language plpgsql
    as $$
    begin
      if new.saved_product_profile_id = '${profileId}'::uuid then
        if (
          select count(*)
          from public.fertilizer_containers
          where saved_product_profile_id = new.saved_product_profile_id
        ) >= 1 then
          raise exception 'GK7B_TEST_FORCED_ROLLBACK';
        end if;
      end if;
      return new;
    end;
    $$;
  `)

  await client.query(`
    drop trigger if exists gk_7b_test_block_second_container on public.fertilizer_containers;
    create trigger gk_7b_test_block_second_container
      before insert on public.fertilizer_containers
      for each row
      execute function public.gk_7b_test_block_second_container();
  `)
}

export async function removeSecondContainerRollbackTrigger(client: Client): Promise<void> {
  await client.query(`
    drop trigger if exists gk_7b_test_block_second_container on public.fertilizer_containers;
    drop function if exists public.gk_7b_test_block_second_container();
  `)
}

export async function countCreationArtifacts(
  client: Client,
  options: {
    idempotencyKey?: string
    userId?: string | null
    sessionAccessHash?: string | null
    profileId?: string
  },
): Promise<{ receipts: number; containers: number; movements: number }> {
  const receiptParams: unknown[] = []
  let receiptWhere = '1=1'
  if (options.idempotencyKey) {
    receiptParams.push(options.idempotencyKey)
    receiptWhere += ` and idempotency_key = $${receiptParams.length}`
  }
  if (options.userId) {
    receiptParams.push(options.userId)
    receiptWhere += ` and user_id = $${receiptParams.length}`
  }
  if (options.sessionAccessHash) {
    receiptParams.push(options.sessionAccessHash)
    receiptWhere += ` and session_access_hash = $${receiptParams.length}`
  }

  const receipts = await client.query(
    `select count(*)::int as count from public.fertilizer_inventory_creation_receipts where ${receiptWhere}`,
    receiptParams,
  )

  const containerParams: unknown[] = []
  let containerWhere = '1=1'
  if (options.profileId) {
    containerParams.push(options.profileId)
    containerWhere += ` and saved_product_profile_id = $${containerParams.length}`
  }
  if (options.userId) {
    containerParams.push(options.userId)
    containerWhere += ` and user_id = $${containerParams.length}`
  }
  if (options.sessionAccessHash) {
    containerParams.push(options.sessionAccessHash)
    containerWhere += ` and session_access_hash = $${containerParams.length}`
  }

  const containers = await client.query(
    `select count(*)::int as count from public.fertilizer_containers where ${containerWhere}`,
    containerParams,
  )

  const movementParams: unknown[] = []
  let movementWhere = 'movement_at is not null'
  if (options.userId) {
    movementParams.push(options.userId)
    movementWhere += ` and user_id = $${movementParams.length}`
  }
  if (options.sessionAccessHash) {
    movementParams.push(options.sessionAccessHash)
    movementWhere += ` and session_access_hash = $${movementParams.length}`
  }

  const movements = await client.query(
    `select count(*)::int as count from public.fertilizer_stock_movements where ${movementWhere}`,
    movementParams,
  )

  return {
    receipts: Number((receipts.rows[0] as { count?: number } | undefined)?.count ?? 0),
    containers: Number((containers.rows[0] as { count?: number } | undefined)?.count ?? 0),
    movements: Number((movements.rows[0] as { count?: number } | undefined)?.count ?? 0),
  }
}

export async function purgeCreationDatabaseTestData(
  client: Client,
  state: CreationDatabaseTestState,
  admin: SupabaseClient,
): Promise<void> {
  const receiptIds = [...new Set(state.receiptIds)]
  const containerIds = [...new Set(state.containerIds)]
  const profileIds = [...new Set(state.profileIds)]

  await withTestReplicationRole(client, async () => {
    if (receiptIds.length > 0) {
      const movementKeyPatterns = receiptIds.map((id) => `inventory-create:${id}:%`)
      await client.query(
        `delete from public.fertilizer_stock_movements
         where inventory_idempotency_key like any($1::text[])`,
        [movementKeyPatterns],
      )
    }

    if (containerIds.length > 0) {
      await client.query(
        `delete from public.fertilizer_stock_movements where container_id = any($1::uuid[])`,
        [containerIds],
      )
      await client.query(`delete from public.fertilizer_containers where id = any($1::uuid[])`, [
        containerIds,
      ])
    }

    if (profileIds.length > 0) {
      await client.query(
        `delete from public.fertilizer_stock_movements
         where container_id in (
           select id from public.fertilizer_containers where saved_product_profile_id = any($1::uuid[])
         )`,
        [profileIds],
      )
      await client.query(
        `delete from public.fertilizer_containers where saved_product_profile_id = any($1::uuid[])`,
        [profileIds],
      )
    }

    await client.query(
      `delete from public.fertilizer_inventory_creation_receipts
       where idempotency_key like $1 or id = any($2::uuid[])`,
      [`${CREATION_DB_TEST_PREFIX}%`, receiptIds.length > 0 ? receiptIds : []],
    )

    if (profileIds.length > 0) {
      await client.query(`delete from public.product_profiles where id = any($1::uuid[])`, [
        profileIds,
      ])
    }

    await client.query(
      `delete from public.product_profiles where identity_fingerprint like $1`,
      [`${CREATION_DB_TEST_PREFIX}%`],
    )
  })

  for (const user of state.testUsers) {
    await admin.auth.admin.deleteUser(user.id)
  }

  state.testUsers = []
  state.profileIds = []
  state.receiptIds = []
  state.containerIds = []
  state.idempotencyKeys = []
}
