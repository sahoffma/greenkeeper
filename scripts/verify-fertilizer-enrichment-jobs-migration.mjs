/**
 * GA-014 Phase 4b — Schema- und Constraint-Validierung (nur Dev).
 *
 *   ALLOW_SUPABASE_WRITE_TESTS=true node scripts/verify-fertilizer-enrichment-jobs-migration.mjs
 */
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import {
  assertSafeSupabaseWriteTarget,
  describeSupabaseTarget,
  loadLocalEnv,
} from './supabaseEnvGuard.mjs'

const DEV_REF = 'amyounxrsxgujsfutshx'
const TEST_PREFIX = 'gk-fe4b-verify'
const TABLE = 'fertilizer_enrichment_jobs'

/** Fixture-only lowercase hex (64 chars) — not a real session HMAC. */
const FAKE_SESSION_HASH_A = '0123456789abcdef'.repeat(4)
const FAKE_SESSION_HASH_B = 'fedcba9876543210'.repeat(4)

const config = loadLocalEnv()
const results = []
const testUsers = []

function log(section, ok, detail) {
  results.push({ section, ok, detail })
  console.log(`${ok ? '✅' : '❌'} [${section}] ${detail}`)
}

function adminClient() {
  assertSafeSupabaseWriteTarget(config)
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function anonClient() {
  return createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function connectPg() {
  const password = config.dbPassword
  if (!password) throw new Error('SUPABASE_DB_PASSWORD fehlt in .env.local.')

  const hosts = [`db.${DEV_REF}.supabase.co`, 'aws-0-eu-central-1.pooler.supabase.com']
  let lastError

  for (const host of hosts) {
    const isPooler = host.includes('pooler')
    const client = new pg.Client({
      host,
      port: isPooler ? 6543 : 5432,
      user: isPooler ? `postgres.${DEV_REF}` : 'postgres',
      password,
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

function minimalJobJson(accessKind = 'session') {
  return {
    result: { status: 'needs_input' },
    accessContext:
      accessKind === 'authenticated_user'
        ? { kind: 'authenticated_user', userId: '00000000-0000-4000-8000-000000000001' }
        : { kind: 'session' },
  }
}

function minimalOrchestrationInputJson() {
  return { objectCategory: 'fertilizer' }
}

function buildRow(overrides = {}) {
  const suffix = crypto.randomUUID().slice(0, 8)
  return {
    job_id: `${TEST_PREFIX}-job-${suffix}`,
    orchestration_run_id: `${TEST_PREFIX}-orch-${suffix}`,
    idempotency_key: `${TEST_PREFIX}-idem-${suffix}`,
    access_kind: 'session',
    user_id: null,
    session_access_hash: FAKE_SESSION_HASH_A,
    object_category: 'fertilizer',
    identity_fingerprint: `${TEST_PREFIX}-fp-${suffix}`,
    job_json: minimalJobJson('session'),
    orchestration_input_json: minimalOrchestrationInputJson(),
    last_source_provision_idempotency_key: null,
    record_schema_version: 1,
    revision: 1,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    ...overrides,
  }
}

const INSERT_SQL = `
  insert into public.fertilizer_enrichment_jobs (
    job_id,
    orchestration_run_id,
    idempotency_key,
    access_kind,
    user_id,
    session_access_hash,
    object_category,
    identity_fingerprint,
    job_json,
    orchestration_input_json,
    last_source_provision_idempotency_key,
    record_schema_version,
    revision,
    expires_at
  ) values (
    $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14
  )
`

function rowValues(row) {
  return [
    row.job_id,
    row.orchestration_run_id,
    row.idempotency_key,
    row.access_kind,
    row.user_id,
    row.session_access_hash,
    row.object_category,
    row.identity_fingerprint,
    JSON.stringify(row.job_json),
    JSON.stringify(row.orchestration_input_json),
    row.last_source_provision_idempotency_key,
    row.record_schema_version,
    row.revision,
    row.expires_at,
  ]
}

async function tryInsert(client, row) {
  await client.query(INSERT_SQL, rowValues(row))
}

async function expectInsert(client, row, shouldSucceed, section) {
  await client.query('SAVEPOINT verify_insert')
  try {
    await tryInsert(client, row)
    await client.query('ROLLBACK TO SAVEPOINT verify_insert')
    log(section, shouldSucceed, shouldSucceed ? 'accepted' : 'unexpectedly accepted')
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT verify_insert')
    log(
      section,
      !shouldSucceed,
      shouldSucceed ? error.message : `rejected (${error.code ?? 'error'})`,
    )
  }
}

async function createTestUser(label) {
  const admin = adminClient()
  const email = `${TEST_PREFIX}-${label}-${Date.now()}@example.com`
  const password = 'GkFe4bVerify123!'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`Testnutzer ${label}: ${error.message}`)
  testUsers.push({ id: data.user.id, email, password, label })
  return data.user.id
}

async function verifyTableAndColumns(client) {
  const { rows: existsRows } = await client.query(
    `select exists (
       select 1 from information_schema.tables
       where table_schema = 'public' and table_name = $1
     ) as exists`,
    [TABLE],
  )
  log('V-1.table', existsRows[0]?.exists === true, TABLE)

  const expectedColumns = [
    'job_id',
    'orchestration_run_id',
    'idempotency_key',
    'access_kind',
    'user_id',
    'session_access_hash',
    'object_category',
    'identity_fingerprint',
    'job_json',
    'orchestration_input_json',
    'last_source_provision_idempotency_key',
    'record_schema_version',
    'revision',
    'created_at',
    'updated_at',
    'expires_at',
  ]

  const { rows: cols } = await client.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public' and table_name = $1`,
    [TABLE],
  )
  const colNames = cols.map((row) => row.column_name)
  const missing = expectedColumns.filter((name) => !colNames.includes(name))
  log(
    'V-2.columns',
    missing.length === 0,
    missing.length === 0 ? expectedColumns.join(', ') : `missing: ${missing.join(', ')}`,
  )
  log(
    'V-2.no_session_id',
    !colNames.includes('session_id'),
    colNames.includes('session_id') ? 'session_id column present' : 'no session_id column',
  )
}

async function verifyAccessConstraints(client) {
  const authUserId = await createTestUser('access-auth')

  await client.query('BEGIN')
  try {
    await expectInsert(
      client,
      buildRow({
        access_kind: 'authenticated_user',
        user_id: authUserId,
        session_access_hash: null,
        job_json: minimalJobJson('authenticated_user'),
      }),
      true,
      'V-3.auth_valid',
    )

    await expectInsert(
      client,
      buildRow({
        access_kind: 'session',
        user_id: null,
        session_access_hash: FAKE_SESSION_HASH_A,
      }),
      true,
      'V-3.session_valid',
    )

    await expectInsert(
      client,
      buildRow({
        access_kind: 'authenticated_user',
        user_id: authUserId,
        session_access_hash: FAKE_SESSION_HASH_A,
      }),
      false,
      'V-3.both_set',
    )

    await expectInsert(
      client,
      buildRow({
        access_kind: 'session',
        user_id: null,
        session_access_hash: null,
      }),
      false,
      'V-3.both_empty',
    )

    await expectInsert(
      client,
      buildRow({
        access_kind: 'anonymous',
        user_id: null,
        session_access_hash: null,
      }),
      false,
      'V-3.unknown_access_kind',
    )
  } finally {
    await client.query('ROLLBACK')
  }
}

async function verifySessionHash(client) {
  await client.query('BEGIN')
  try {
    await expectInsert(
      client,
      buildRow({
        access_kind: 'session',
        session_access_hash: FAKE_SESSION_HASH_A,
      }),
      true,
      'V-4.valid_hex_64',
    )

    await expectInsert(
      client,
      buildRow({
        access_kind: 'session',
        session_access_hash: 'abc',
      }),
      false,
      'V-4.too_short',
    )

    await expectInsert(
      client,
      buildRow({
        access_kind: 'session',
        session_access_hash: `${'g'.repeat(64)}`,
      }),
      false,
      'V-4.non_hex',
    )

    await expectInsert(
      client,
      buildRow({
        access_kind: 'session',
        session_access_hash: '',
      }),
      false,
      'V-4.empty',
    )

    await expectInsert(
      client,
      buildRow({
        access_kind: 'session',
        session_access_hash: 'ABCDEF0123456789abcdef0123456789abcdef0123456789abcdef0123456789ab',
      }),
      false,
      'V-4.uppercase_rejected',
    )
  } finally {
    await client.query('ROLLBACK')
  }
}

async function verifyJsonb(client) {
  await client.query('BEGIN')
  try {
    await expectInsert(
      client,
      buildRow({ job_json: minimalJobJson('session') }),
      true,
      'V-5.job_json_object',
    )

    await expectInsert(
      client,
      buildRow({ job_json: [] }),
      false,
      'V-5.job_json_array_rejected',
    )

    await expectInsert(
      client,
      buildRow({ job_json: 'scalar' }),
      false,
      'V-5.job_json_scalar_rejected',
    )

    await expectInsert(
      client,
      buildRow({ job_json: {} }),
      false,
      'V-5.job_json_missing_result',
    )

    await expectInsert(
      client,
      buildRow({ orchestration_input_json: minimalOrchestrationInputJson() }),
      true,
      'V-5.orchestration_input_object',
    )

    await expectInsert(
      client,
      buildRow({ orchestration_input_json: [] }),
      false,
      'V-5.orchestration_input_array_rejected',
    )
  } finally {
    await client.query('ROLLBACK')
  }
}

async function verifyObjectCategory(client) {
  await client.query('BEGIN')
  try {
    await expectInsert(
      client,
      buildRow({ object_category: 'fertilizer' }),
      true,
      'V-6.fertilizer_accepted',
    )

    await expectInsert(
      client,
      buildRow({ object_category: 'equipment' }),
      false,
      'V-6.foreign_category_rejected',
    )
  } finally {
    await client.query('ROLLBACK')
  }
}

async function verifyIdempotency(client) {
  const userA = await createTestUser('idem-a')
  const userB = await createTestUser('idem-b')
  const sharedKey = `${TEST_PREFIX}-shared-idem-key`

  await client.query('BEGIN')
  try {
    const authRowA = buildRow({
      job_id: `${TEST_PREFIX}-auth-a-1`,
      orchestration_run_id: `${TEST_PREFIX}-orch-a-1`,
      idempotency_key: sharedKey,
      access_kind: 'authenticated_user',
      user_id: userA,
      session_access_hash: null,
      job_json: minimalJobJson('authenticated_user'),
    })
    await tryInsert(client, authRowA)

    await expectInsert(
      client,
      buildRow({
        job_id: `${TEST_PREFIX}-auth-a-2`,
        orchestration_run_id: `${TEST_PREFIX}-orch-a-2`,
        idempotency_key: sharedKey,
        access_kind: 'authenticated_user',
        user_id: userA,
        session_access_hash: null,
        job_json: minimalJobJson('authenticated_user'),
      }),
      false,
      'V-7.same_user_same_key_conflict',
    )

    await expectInsert(
      client,
      buildRow({
        job_id: `${TEST_PREFIX}-auth-b-1`,
        orchestration_run_id: `${TEST_PREFIX}-orch-b-1`,
        idempotency_key: sharedKey,
        access_kind: 'authenticated_user',
        user_id: userB,
        session_access_hash: null,
        job_json: minimalJobJson('authenticated_user'),
      }),
      true,
      'V-7.other_user_same_key_allowed',
    )

    const sessionRowA = buildRow({
      job_id: `${TEST_PREFIX}-sess-a-1`,
      orchestration_run_id: `${TEST_PREFIX}-orch-sa-1`,
      idempotency_key: sharedKey,
      access_kind: 'session',
      user_id: null,
      session_access_hash: FAKE_SESSION_HASH_A,
    })
    await tryInsert(client, sessionRowA)

    await expectInsert(
      client,
      buildRow({
        job_id: `${TEST_PREFIX}-sess-a-2`,
        orchestration_run_id: `${TEST_PREFIX}-orch-sa-2`,
        idempotency_key: sharedKey,
        access_kind: 'session',
        user_id: null,
        session_access_hash: FAKE_SESSION_HASH_A,
      }),
      false,
      'V-8.same_hash_same_key_conflict',
    )

    await expectInsert(
      client,
      buildRow({
        job_id: `${TEST_PREFIX}-sess-b-1`,
        orchestration_run_id: `${TEST_PREFIX}-orch-sb-1`,
        idempotency_key: sharedKey,
        access_kind: 'session',
        user_id: null,
        session_access_hash: FAKE_SESSION_HASH_B,
      }),
      true,
      'V-8.other_hash_same_key_allowed',
    )

    await expectInsert(
      client,
      buildRow({
        job_id: `${TEST_PREFIX}-cross-space-1`,
        orchestration_run_id: `${TEST_PREFIX}-orch-cross-1`,
        idempotency_key: `${TEST_PREFIX}-cross-space-key`,
        access_kind: 'authenticated_user',
        user_id: userA,
        session_access_hash: null,
        job_json: minimalJobJson('authenticated_user'),
      }),
      true,
      'V-9.user_and_session_same_key_allowed',
    )
  } finally {
    await client.query('ROLLBACK')
  }
}

async function verifyRevisionAndSchemaVersion(client) {
  await client.query('BEGIN')
  try {
    const row = buildRow({ revision: 1, record_schema_version: 1 })
    await tryInsert(client, row)
    log('V-10.revision_default', row.revision === 1, `revision=${row.revision}`)
    log('V-11.schema_version_default', row.record_schema_version === 1, `version=${row.record_schema_version}`)

    await expectInsert(client, buildRow({ revision: 0 }), false, 'V-10.revision_invalid')
    await expectInsert(
      client,
      buildRow({ record_schema_version: 0 }),
      false,
      'V-11.schema_version_invalid',
    )
  } finally {
    await client.query('ROLLBACK')
  }
}

async function verifyExpiry(client) {
  await client.query('BEGIN')
  try {
    await expectInsert(
      client,
      buildRow({ expires_at: new Date(Date.now() + 3_600_000).toISOString() }),
      true,
      'V-12.valid_expiry',
    )

    await expectInsert(
      client,
      buildRow({ expires_at: new Date(Date.now() - 3_600_000).toISOString() }),
      false,
      'V-12.expiry_before_created_rejected',
    )
  } finally {
    await client.query('ROLLBACK')
  }
}

async function verifyAdditionalSourceKey(client) {
  await client.query('BEGIN')
  try {
    await expectInsert(
      client,
      buildRow({ last_source_provision_idempotency_key: null }),
      true,
      'V-13.null_allowed',
    )

    await expectInsert(
      client,
      buildRow({ last_source_provision_idempotency_key: `${TEST_PREFIX}-source-key` }),
      true,
      'V-13.nonempty_allowed',
    )

    await expectInsert(
      client,
      buildRow({ last_source_provision_idempotency_key: '' }),
      false,
      'V-13.empty_string_rejected',
    )
  } finally {
    await client.query('ROLLBACK')
  }
}

async function verifyRlsAndPrivileges(client) {
  const { rows: rlsRows } = await client.query(
    `select relrowsecurity, relforcerowsecurity
     from pg_class
     where relname = $1`,
    [TABLE],
  )
  log('V-14.rls_enabled', rlsRows[0]?.relrowsecurity === true, String(rlsRows[0]?.relrowsecurity))

  const { rows: policyRows } = await client.query(
    `select polname
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     where c.relname = $1`,
    [TABLE],
  )
  log(
    'V-14.no_policies',
    policyRows.length === 0,
    policyRows.length === 0 ? 'none' : policyRows.map((row) => row.polname).join(', '),
  )

  const { rows: privRows } = await client.query(
    `select
       has_table_privilege('anon', 'public.${TABLE}', 'SELECT') as anon_select,
       has_table_privilege('anon', 'public.${TABLE}', 'INSERT') as anon_insert,
       has_table_privilege('authenticated', 'public.${TABLE}', 'SELECT') as auth_select,
       has_table_privilege('authenticated', 'public.${TABLE}', 'INSERT') as auth_insert`,
  )
  const priv = privRows[0] ?? {}
  log(
    'V-14.anon_no_access',
    !priv.anon_select && !priv.anon_insert,
    `select=${priv.anon_select}, insert=${priv.anon_insert}`,
  )
  log(
    'V-14.authenticated_no_access',
    !priv.auth_select && !priv.auth_insert,
    `select=${priv.auth_select}, insert=${priv.auth_insert}`,
  )

  const anon = anonClient()
  const { error: anonError } = await anon.from(TABLE).select('job_id').limit(1)
  log(
    'V-14.anon_client_blocked',
    Boolean(anonError),
    anonError?.message ?? 'unexpected read success',
  )
}

async function verifyNoSecondStatus(client) {
  const forbidden = ['status', 'readiness_status', 'failure_reason', 'pipeline_result', 'completed_at']
  const { rows } = await client.query(
    `select column_name
     from information_schema.columns
     where table_schema = 'public'
       and table_name = $1
       and column_name = any($2::text[])`,
    [TABLE, forbidden],
  )
  log(
    'V-15.no_second_status',
    rows.length === 0,
    rows.length === 0 ? 'no parallel status columns' : rows.map((row) => row.column_name).join(', '),
  )
}

async function verifyIndexes(client) {
  const { rows } = await client.query(
    `select indexname, indexdef
     from pg_indexes
     where schemaname = 'public' and tablename = $1
     order by indexname`,
    [TABLE],
  )
  const names = rows.map((row) => row.indexname)
  log(
    'V-16.expires_at_index',
    names.includes('fertilizer_enrichment_jobs_expires_at_idx'),
    names.join(', '),
  )
  log(
    'V-16.auth_idempotency_index',
    names.includes('fertilizer_enrichment_jobs_auth_idempotency_idx'),
    'partial unique auth idempotency present',
  )
  log(
    'V-16.session_idempotency_index',
    names.includes('fertilizer_enrichment_jobs_session_idempotency_idx'),
    'partial unique session idempotency present',
  )
}

async function verifyRevisionUpdate(client) {
  await client.query('BEGIN')
  try {
    const row = buildRow()
    await tryInsert(client, row)

    const ok = await client.query(
      `update public.fertilizer_enrichment_jobs
       set revision = revision + 1,
           job_json = jsonb_set(job_json, '{result,status}', '"processing"'::jsonb, true)
       where job_id = $1 and revision = 1`,
      [row.job_id],
    )
    log('V-17.update_expected_revision', ok.rowCount === 1, `rowCount=${ok.rowCount}`)

    const stale = await client.query(
      `update public.fertilizer_enrichment_jobs
       set revision = revision + 1
       where job_id = $1 and revision = 1`,
      [row.job_id],
    )
    log('V-17.update_stale_revision', stale.rowCount === 0, `rowCount=${stale.rowCount}`)

    const { rows } = await client.query(
      `select revision from public.fertilizer_enrichment_jobs where job_id = $1`,
      [row.job_id],
    )
    log('V-17.revision_incremented', rows[0]?.revision === 2, `revision=${rows[0]?.revision}`)
  } finally {
    await client.query('ROLLBACK')
  }
}

async function verifyUpdatedAtTrigger(client) {
  await client.query('BEGIN')
  try {
    const row = buildRow()
    await tryInsert(client, row)

    const { rows: beforeRows } = await client.query(
      `select updated_at from public.fertilizer_enrichment_jobs where job_id = $1`,
      [row.job_id],
    )
    await client.query(`select pg_sleep(0.05)`)
    await client.query(
      `update public.fertilizer_enrichment_jobs
       set revision = revision + 1
       where job_id = $1 and revision = 1`,
      [row.job_id],
    )
    const { rows: afterRows } = await client.query(
      `select updated_at from public.fertilizer_enrichment_jobs where job_id = $1`,
      [row.job_id],
    )
    const changed =
      beforeRows[0]?.updated_at &&
      afterRows[0]?.updated_at &&
      new Date(afterRows[0].updated_at).getTime() >= new Date(beforeRows[0].updated_at).getTime()
    log('trigger.updated_at', changed, `${beforeRows[0]?.updated_at} -> ${afterRows[0]?.updated_at}`)
  } finally {
    await client.query('ROLLBACK')
  }
}

async function cleanupUsers() {
  const admin = adminClient()
  for (const user of testUsers) {
    await admin.auth.admin.deleteUser(user.id).catch(() => undefined)
  }
}

async function main() {
  const target = describeSupabaseTarget(config)
  if (target.projectRef !== DEV_REF) {
    throw new Error(`ABBRUCH: Erwartete Dev-Ref ${DEV_REF}, erhalten ${target.projectRef}`)
  }

  console.log(`Supabase-Ziel: ${target.projectRef} (${target.supabaseUrl})`)

  const client = await connectPg()
  try {
    await verifyTableAndColumns(client)
    await verifyAccessConstraints(client)
    await verifySessionHash(client)
    await verifyJsonb(client)
    await verifyObjectCategory(client)
    await verifyIdempotency(client)
    await verifyRevisionAndSchemaVersion(client)
    await verifyExpiry(client)
    await verifyAdditionalSourceKey(client)
    await verifyRlsAndPrivileges(client)
    await verifyNoSecondStatus(client)
    await verifyIndexes(client)
    await verifyRevisionUpdate(client)
    await verifyUpdatedAtTrigger(client)
  } finally {
    await client.end()
    await cleanupUsers()
  }

  const failed = results.filter((entry) => !entry.ok)
  console.log(`\nErgebnis: ${results.length - failed.length}/${results.length} OK`)
  if (failed.length > 0) {
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
