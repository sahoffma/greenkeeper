import { readFileSync, readdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import pg, { Client } from 'pg'

type LocalPgPool = {
  connect(): Promise<LocalPgPoolClient>
  end(): Promise<void>
}

type LocalPgPoolClient = Client & {
  release(): void
}

const PgPool = (pg as typeof pg & { Pool: new (config: object) => LocalPgPool }).Pool

const REPO_ROOT = resolve(process.cwd())
const SCHEMA_PATH = resolve(REPO_ROOT, 'supabase/schema.sql')
const MIGRATIONS_DIR = resolve(REPO_ROOT, 'supabase/migrations')

export const LOCAL_PG_HOST = '127.0.0.1' as const
export const LOCAL_PG_PORT = 55432
export const LOCAL_PG_USER = 'postgres' as const
export const LOCAL_PG_PASSWORD = 'postgres' as const
export const LOCAL_PG_DATABASE = 'postgres' as const

export interface LocalProductStockIntakeDatabaseTestConfig {
  mode: 'local'
  host: typeof LOCAL_PG_HOST
  port: number
  user: typeof LOCAL_PG_USER
  password: typeof LOCAL_PG_PASSWORD
  database: typeof LOCAL_PG_DATABASE
}

export interface LocalProductStockIntakeAuthClient {
  __productStockLocalAuth: true
  userId: string
  pool: LocalPgPool
}

export interface LocalProductStockIntakeAdminClient {
  __productStockLocalAdmin: true
}

type EmbeddedPostgresInstance = {
  initialise(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
}

type EmbeddedPostgresConstructor = new (options: {
  databaseDir: string
  user: string
  password: string
  port: number
  persistent: boolean
}) => EmbeddedPostgresInstance

let embeddedPostgres: EmbeddedPostgresInstance | null = null
let localPool: LocalPgPool | null = null
let localBootstrapComplete = false

export function isLocalProductStockIntakeDatabaseTestEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.GREENKEEPER_LOCAL_PG_TEST === 'true' && env.ALLOW_SUPABASE_WRITE_TESTS === 'true'
}

export function loadLocalProductStockIntakeDatabaseTestConfig(): LocalProductStockIntakeDatabaseTestConfig | null {
  if (!isLocalProductStockIntakeDatabaseTestEnabled()) {
    return null
  }

  return {
    mode: 'local',
    host: LOCAL_PG_HOST,
    port: LOCAL_PG_PORT,
    user: LOCAL_PG_USER,
    password: LOCAL_PG_PASSWORD,
    database: LOCAL_PG_DATABASE,
  }
}

export function isLocalProductStockIntakeDatabaseTestConfig(
  config: unknown,
): config is LocalProductStockIntakeDatabaseTestConfig {
  return (
    typeof config === 'object'
    && config !== null
    && (config as LocalProductStockIntakeDatabaseTestConfig).mode === 'local'
  )
}

export function isLocalProductStockIntakeAuthClient(
  client: unknown,
): client is LocalProductStockIntakeAuthClient {
  return (
    typeof client === 'object'
    && client !== null
    && (client as LocalProductStockIntakeAuthClient).__productStockLocalAuth === true
  )
}

export function isLocalProductStockIntakeAdminClient(
  client: unknown,
): client is LocalProductStockIntakeAdminClient {
  return (
    typeof client === 'object'
    && client !== null
    && (client as LocalProductStockIntakeAdminClient).__productStockLocalAdmin === true
  )
}

function stripTransactionWrappers(sql: string): string {
  let result = sql.trim()
  result = result.replace(/^\s*begin\s*;\s*\r?\n/i, '')
  result = result.replace(/\r?\n\s*commit\s*;\s*$/i, '')
  return result
}

function listMigrationsChronological(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

async function loadEmbeddedPostgresConstructor(): Promise<EmbeddedPostgresConstructor> {
  const moduleRoots = [
    process.env.GREENKEEPER_EMBEDDED_PG_MODULE_ROOT?.trim(),
    '/tmp/gk-embedded-pg/node_modules',
  ].filter(Boolean) as string[]

  for (const moduleRoot of moduleRoots) {
    try {
      const require = createRequire(resolve(moduleRoot, 'embedded-postgres/package.json'))
      const loaded = require('embedded-postgres') as { default?: EmbeddedPostgresConstructor }
      const ctor = loaded.default ?? (loaded as unknown as EmbeddedPostgresConstructor)
      if (typeof ctor === 'function') {
        return ctor
      }
    } catch {
      // try next module root
    }
  }

  throw new Error(
    'embedded-postgres is unavailable. Install it under /tmp/gk-embedded-pg or set GREENKEEPER_EMBEDDED_PG_MODULE_ROOT.',
  )
}

async function bootstrapSupabaseStubs(client: Client): Promise<void> {
  await client.query(`
    create schema if not exists auth;
    create schema if not exists extensions;
    create schema if not exists storage;

    create extension if not exists pgcrypto with schema extensions;

    create table if not exists auth.users (
      id uuid primary key,
      email text,
      raw_user_meta_data jsonb,
      created_at timestamptz not null default now()
    );

    create or replace function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );

    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text,
      owner uuid
    );

    create or replace function storage.foldername(name text)
    returns text[]
    language sql
    immutable
    as $$
      select string_to_array(name, '/');
    $$;

    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role; exception when duplicate_object then null; end $$;

    grant usage on schema public to authenticated, anon, service_role;
    grant usage on schema auth to authenticated, anon, service_role;
    grant usage on schema storage to authenticated, anon, service_role;
  `)
}

async function applyLocalBootstrap(client: Client): Promise<void> {
  if (localBootstrapComplete) {
    return
  }

  await bootstrapSupabaseStubs(client)

  const schemaSql = stripTransactionWrappers(readFileSync(SCHEMA_PATH, 'utf8')).replace(
    /create extension if not exists "pgcrypto";\s*/i,
    '',
  )
  await client.query(schemaSql)

  for (const file of listMigrationsChronological()) {
    const sql = stripTransactionWrappers(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'))
    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('commit')
    } catch (error) {
      await client.query('rollback').catch(() => undefined)
      throw new Error(`Local bootstrap failed on ${file}: ${(error as Error).message}`)
    }
  }

  localBootstrapComplete = true
}

export async function ensureLocalProductStockIntakePostgresStarted(
  config: LocalProductStockIntakeDatabaseTestConfig,
): Promise<void> {
  if (embeddedPostgres) {
    return
  }

  const EmbeddedPostgres = await loadEmbeddedPostgresConstructor()
  const databaseDir = resolve('/tmp/gk-embedded-pg/greenkeeper-test-data')
  rmSync(databaseDir, { recursive: true, force: true })

  embeddedPostgres = new EmbeddedPostgres({
    databaseDir,
    user: config.user,
    password: config.password,
    port: config.port,
    persistent: false,
  })

  await embeddedPostgres.initialise()
  await embeddedPostgres.start()

  localPool = new PgPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
  })

  const client = await localPool.connect()
  try {
    await applyLocalBootstrap(client)
  } finally {
    client.release()
  }
}

export async function connectLocalProductStockIntakeTestPg(
  config: LocalProductStockIntakeDatabaseTestConfig,
): Promise<Client> {
  await ensureLocalProductStockIntakePostgresStarted(config)

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
  })
  await client.connect()
  return client
}

export function createLocalProductStockIntakeAdminClient(): LocalProductStockIntakeAdminClient {
  return { __productStockLocalAdmin: true }
}

export async function createLocalProductStockIntakeTestUser(
  state: { testUsers: Array<{ id: string; email: string; password: string; label: string }> },
  label: string,
  password = 'Gk7bDbTest123!',
): Promise<{ id: string; email: string; password: string }> {
  if (!localPool) {
    throw new Error('Local Postgres has not been started.')
  }

  const email = `gk-ps-local-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const id = crypto.randomUUID()
  const client = await localPool.connect()
  try {
    await client.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email])
  } finally {
    client.release()
  }

  const user = { id, email, password, label }
  state.testUsers.push(user)
  return user
}

export async function createLocalProductStockIntakeAuthClient(
  user: { id: string },
): Promise<LocalProductStockIntakeAuthClient> {
  if (!localPool) {
    throw new Error('Local Postgres has not been started.')
  }

  return {
    __productStockLocalAuth: true,
    userId: user.id,
    pool: localPool,
  }
}

export async function callLocalProductStockIntakeRpc(
  authClient: LocalProductStockIntakeAuthClient,
  params: Record<string, unknown>,
): Promise<{ data: unknown; error: { message: string } | null }> {
  const client = await authClient.pool.connect()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [authClient.userId])
    const { rows } = await client.query(
      `select public.record_fertilizer_product_stock_intake(
        $1::uuid, $2::text, $3::numeric, $4::text, $5::text, $6::timestamptz, $7::text, $8::text
      ) as result`,
      [
        params.p_saved_product_profile_id,
        params.p_base_unit,
        params.p_quantity,
        params.p_reason,
        params.p_idempotency_key,
        params.p_movement_at ?? null,
        params.p_source_event_ref ?? null,
        params.p_note ?? null,
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

export async function purgeLocalProductStockIntakeDatabaseTestData(
  pgClient: Client,
  state: {
    testUsers: Array<{ id: string }>
    intakeReceiptIds?: string[]
    containerIds?: string[]
    profileIds?: string[]
  },
): Promise<void> {
  const receiptIds = [...new Set(state.intakeReceiptIds ?? [])]
  const containerIds = [...new Set((state.containerIds ?? []).filter(Boolean))]
  const profileIds = [...new Set(state.profileIds ?? [])]
  const userIds = [...new Set(state.testUsers.map((user) => user.id))]

  await pgClient.query('begin')
  try {
    await pgClient.query(`set local session_replication_role = replica`)

    if (receiptIds.length > 0) {
      await pgClient.query(
        `delete from public.fertilizer_product_stock_intake_receipts where id = any($1::uuid[])`,
        [receiptIds],
      )
    }

    if (containerIds.length > 0) {
      await pgClient.query(
        `delete from public.fertilizer_stock_movements where container_id = any($1::uuid[])`,
        [containerIds],
      )
      await pgClient.query(
        `delete from public.fertilizer_containers
         where id = any($1::uuid[]) and stock_kind = 'product_stock'`,
        [containerIds],
      )
    }

    if (profileIds.length > 0) {
      await pgClient.query(
        `delete from public.fertilizer_stock_movements
         where container_id in (
           select id from public.fertilizer_containers
           where saved_product_profile_id = any($1::uuid[])
         )`,
        [profileIds],
      )
      await pgClient.query(
        `delete from public.fertilizer_containers where saved_product_profile_id = any($1::uuid[])`,
        [profileIds],
      )
      await pgClient.query(`delete from public.product_profiles where id = any($1::uuid[])`, [
        profileIds,
      ])
    }

    if (userIds.length > 0) {
      await pgClient.query(`delete from public.profiles where id = any($1::uuid[])`, [userIds])
      await pgClient.query(`delete from auth.users where id = any($1::uuid[])`, [userIds])
    }

    await pgClient.query('commit')
  } catch (error) {
    await pgClient.query('rollback').catch(() => undefined)
    throw error
  }
}

export async function stopLocalProductStockIntakePostgres(): Promise<void> {
  if (localPool) {
    await localPool.end()
    localPool = null
  }

  if (embeddedPostgres) {
    await embeddedPostgres.stop()
    embeddedPostgres = null
  }

  localBootstrapComplete = false
}

export async function reloadLocalPostgrestSchema(_client: Client): Promise<void> {
  // PostgREST is not part of the local embedded Postgres harness.
}
