/**
 * GA-013 Stufe 1 — Schema- und Integrationsvalidierung (nur Dev).
 *
 *   node scripts/verify-product-profiles-migration.mjs --pre-check
 *   node scripts/verify-product-profiles-migration.mjs --post-schema
 *   node scripts/verify-product-profiles-migration.mjs --integration
 *   node scripts/verify-product-profiles-migration.mjs --rasendoktor-readonly
 *   node scripts/verify-product-profiles-migration.mjs --save-replay
 *   node scripts/verify-product-profiles-migration.mjs --cleanup
 *   node scripts/verify-product-profiles-migration.mjs --cleanup-verify
 */
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import {
  assertReadOnlySupabaseTarget,
  assertSafeSupabaseWriteTarget,
  describeSupabaseTarget,
  loadLocalEnv,
  PRODUCTION_PROJECT_REF,
} from './supabaseEnvGuard.mjs'

const DEV_REF = 'amyounxrsxgujsfutshx'
const TEST_PREFIX = 'gk-ga013-verify'
const TEST_BRAND = `${TEST_PREFIX}-brand`
const TEST_LINE = `${TEST_PREFIX}-line`
const TEST_NAME = `${TEST_PREFIX}-product`
const TEST_NPK = '14-28-10'

const config = loadLocalEnv()
const modes = new Set(process.argv.slice(2))
const results = []
const state = {
  testUsers: [],
  createdProfileIds: [],
  createdProductIds: [],
  createdCandidateIds: [],
  createdContainerIds: [],
  createdReceiptIds: [],
  verifiedProfileId: null,
}

function log(section, ok, detail) {
  results.push({ section, ok, detail })
  console.log(`${ok ? '✅' : '❌'} [${section}] ${detail}`)
}

function assertDevTarget() {
  const target = describeSupabaseTarget(config)
  if (config.projectRef !== DEV_REF) {
    throw new Error(`ABBRUCH: Erwartete Dev-Ref ${DEV_REF}, erhalten ${config.projectRef}`)
  }
  if (config.projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error('ABBRUCH: Production-Ref erkannt.')
  }
  return target
}

async function connectPg() {
  const password = config.dbPassword
  if (!password) throw new Error('SUPABASE_DB_PASSWORD fehlt.')
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

function buildRecognitionSnapshot(overrides = {}) {
  return {
    brand: { normalizedValue: TEST_BRAND, rawValue: TEST_BRAND, source: 'image', confidence: 0.95 },
    productLine: { normalizedValue: TEST_LINE, rawValue: TEST_LINE, source: 'image', confidence: 0.9 },
    productName: { normalizedValue: TEST_NAME, rawValue: TEST_NAME, source: 'image', confidence: 0.92 },
    variant: { normalizedValue: null, rawValue: null, source: 'image', confidence: 0 },
    manufacturer: { normalizedValue: null, rawValue: null, source: 'image', confidence: 0 },
    npk: {
      rawLabel: `NPK ${TEST_NPK}`,
      nitrogen: 14,
      phosphate: 28,
      potash: 10,
      source: 'image',
      confidence: 0.93,
    },
    form: { normalizedValue: 'granular', rawValue: 'granular', source: 'image', confidence: 0.9 },
    packageSize: { normalizedValue: 5, unit: 'kg', rawValue: '5 kg', source: 'image', confidence: 0.9 },
    ...overrides,
  }
}

function buildCandidatePayload(packageSizeValue = 5) {
  const snapshot = buildRecognitionSnapshot({
    packageSize: {
      normalizedValue: packageSizeValue,
      unit: 'kg',
      rawValue: `${packageSizeValue} kg`,
      source: 'image',
      confidence: 0.9,
    },
  })
  return {
    brand: TEST_BRAND,
    productLine: TEST_LINE,
    productName: TEST_NAME,
    variant: null,
    productDescriptor: null,
    manufacturer: null,
    npk: `NPK ${TEST_NPK}`,
    packageSizeValue,
    packageSizeUnit: 'kg',
    productForm: 'granular',
    identityConfidence: 1,
    dataCompleteness: 0.14,
    identityOrigin: 'image',
    recognitionSnapshot: snapshot,
    status: 'accepted',
  }
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = $1
    ) as exists`,
    [tableName],
  )
  return rows[0]?.exists === true
}

async function runPreCheck(client) {
  assertReadOnlySupabaseTarget(config)
  const target = assertDevTarget()
  log('env.projectRef', target.projectRef === DEV_REF, target.projectRef)
  log('env.isProduction', !target.isProduction, target.isProduction ? 'Production!' : 'Dev bestätigt')

  const hasProfiles = await tableExists(client, 'product_profiles')
  log('pre.product_profiles', !hasProfiles, hasProfiles ? 'bereits vorhanden' : 'noch nicht vorhanden')

  const { rows: productCols } = await client.query(
    `select column_name, data_type, is_nullable
     from information_schema.columns
     where table_schema = 'public' and table_name = 'products'
       and column_name in ('product_profile_id', 'soft_deleted_at')
     order by column_name`,
  )
  log(
    'pre.products.columns',
    true,
    productCols.map((r) => `${r.column_name}:${r.data_type}`).join(', ') || 'keine product_profile_id',
  )

  const { rows: candidateCols } = await client.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'fertilizer_recognition_candidates'
       and column_name = 'product_profile_id'`,
  )
  log(
    'pre.candidates.product_profile_id',
    candidateCols.length === 0,
    candidateCols.length === 0 ? 'noch nicht vorhanden' : 'bereits vorhanden',
  )

  const { rows: saveFn } = await client.query(
    `select pg_get_functiondef(p.oid) as def
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_fertilizer_capture'
     limit 1`,
  )
  const saveDef = saveFn[0]?.def ?? ''
  log(
    'pre.save_fertilizer_capture',
    saveDef.length > 0,
    saveDef.includes('ensure_product_profile_from_snapshot')
      ? 'enthält noch kein ensure (oder bereits migriert)'
      : 'Basisversion aus 20250731',
  )

  const { rows: triggers } = await client.query(
    `select event_object_table, trigger_name, action_timing, event_manipulation
     from information_schema.triggers
     where trigger_schema = 'public'
       and event_object_table in ('products', 'product_profiles')
     order by event_object_table, trigger_name`,
  )
  log('pre.triggers', true, triggers.map((t) => `${t.event_object_table}.${t.trigger_name}`).join(', ') || 'keine GA-013-Trigger')

  const { rows: priorMigrations } = await client.query(
    `select to_regclass('public.fertilizer_capture_receipts') is not null as inventory_ready,
            to_regclass('public.products') is not null as products_ready`,
  )
  log(
    'pre.dependencies',
    priorMigrations[0]?.inventory_ready && priorMigrations[0]?.products_ready,
    `inventory=${priorMigrations[0]?.inventory_ready}, products=${priorMigrations[0]?.products_ready}`,
  )
}

async function runPostSchema(client) {
  const { rows: cols } = await client.query(
    `select column_name, data_type, is_nullable, column_default
     from information_schema.columns
     where table_schema = 'public' and table_name = 'product_profiles'
     order by ordinal_position`,
  )
  const colNames = cols.map((c) => c.column_name)
  const expected = [
    'id', 'user_id', 'identity_fingerprint', 'brand', 'manufacturer', 'product_line',
    'official_name', 'variant', 'product_form', 'nitrogen', 'phosphate', 'potash',
    'npk_declaration', 'source', 'profile_status', 'verification_status', 'created_at', 'updated_at',
  ]
  log('schema.product_profiles.columns', expected.every((c) => colNames.includes(c)), colNames.join(', '))
  log(
    'schema.product_profiles.no_package',
    !colNames.some((c) => c.includes('package')),
    colNames.filter((c) => c.includes('package')).join(', ') || 'keine Gebindefelder',
  )

  const { rows: checks } = await client.query(
    `select conname from pg_constraint
     where conrelid = 'public.product_profiles'::regclass and contype = 'c'
     order by conname`,
  )
  log('schema.product_profiles.checks', checks.length >= 5, checks.map((r) => r.conname).join(', '))

  const { rows: indexes } = await client.query(
    `select indexname, indexdef from pg_indexes
     where schemaname = 'public' and tablename = 'product_profiles'
     order by indexname`,
  )
  const idxText = indexes.map((i) => i.indexdef).join('\n')
  log(
    'schema.product_profiles.partial_unique',
    idxText.includes('product_profiles_draft_user_fingerprint_idx') &&
      idxText.includes('product_profiles_verified_fingerprint_idx'),
    indexes.map((i) => i.indexname).join(', '),
  )

  const { rows: rls } = await client.query(
    `select relrowsecurity from pg_class where relname = 'product_profiles'`,
  )
  log('schema.product_profiles.rls', rls[0]?.relrowsecurity === true, String(rls[0]?.relrowsecurity))

  const { rows: policies } = await client.query(
    `select polname, polcmd from pg_policy p
     join pg_class c on c.oid = p.polrelid
     where c.relname = 'product_profiles'`,
  )
  log('schema.product_profiles.policies', policies.length >= 1, policies.map((p) => `${p.polname}:${p.polcmd}`).join(', '))

  const { rows: fk } = await client.query(
    `select conname, pg_get_constraintdef(oid) as def
     from pg_constraint
     where conrelid = 'public.products'::regclass and contype = 'f'
       and pg_get_constraintdef(oid) ilike '%product_profiles%'`,
  )
  log('schema.products.fk', fk.some((r) => r.def.includes('RESTRICT')), fk.map((r) => r.def).join('; '))

  const { rows: productTriggers } = await client.query(
    `select trigger_name, event_manipulation, action_timing
     from information_schema.triggers
     where event_object_schema = 'public' and event_object_table = 'products'
       and trigger_name = 'validate_products_product_profile_link'`,
  )
  log(
    'schema.products.link_trigger',
    productTriggers.some((t) => t.event_manipulation === 'INSERT') &&
      productTriggers.some((t) => t.event_manipulation === 'UPDATE'),
    productTriggers.map((t) => `${t.action_timing} ${t.event_manipulation}`).join(', '),
  )

  for (const fn of [
    'ensure_product_profile_from_snapshot',
    'is_global_verified_product_profile',
    'validate_products_product_profile_link',
    'prevent_catalog_linked_product_profile_invalidation',
    'resolve_product_profile_for_catalog',
    'save_fertilizer_capture',
  ]) {
    const { rows } = await client.query(
      `select p.prosecdef, pg_get_function_identity_arguments(p.oid) as args,
              coalesce(array_to_string(p.proconfig, ','), '') as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = $1 limit 1`,
      [fn],
    )
    const row = rows[0]
    log(
      `schema.fn.${fn}`,
      Boolean(row),
      row
        ? `security_definer=${row.prosecdef}, search_path=${row.config.includes('search_path=public')}`
        : 'fehlt',
    )
  }
}

function randomEmail(label) {
  return `${TEST_PREFIX}-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
}

async function createTestUser(label) {
  const admin = adminClient()
  const email = randomEmail(label)
  const password = 'GkGa013Verify123!'
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`Testnutzer ${label}: ${error.message}`)
  state.testUsers.push({ id: data.user.id, email, password, label })
  return { id: data.user.id, email, password }
}

async function userClient(email, password) {
  const client = anonClient()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Login ${email}: ${error.message}`)
  return client
}

async function ensureAsUser(client, snapshot) {
  const { data, error } = await client.rpc('ensure_product_profile_from_snapshot', {
    p_snapshot: snapshot,
  })
  if (error) throw error
  return data
}

async function insertTestCatalogProduct(client, { productProfileId = null, softDeletedAt = null } = {}) {
  const label = `${TEST_PREFIX}-catalog-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const { rows } = await client.query(
    `insert into public.products (
      manufacturer, official_name, product_profile_id, soft_deleted_at
    ) values ($1, $2, $3, $4)
    returning id`,
    [TEST_PREFIX, label, productProfileId, softDeletedAt],
  )
  state.createdProductIds.push(rows[0].id)
  return rows[0].id
}

async function purgeTestPrefixData(client) {
  await client.query(
    `delete from public.fertilizer_stock_movements where capture_idempotency_key like $1`,
    [`${TEST_PREFIX}%`],
  )
  await client.query(
    `delete from public.fertilizer_capture_receipts where idempotency_key like $1`,
    [`${TEST_PREFIX}%`],
  )
  await client.query(`delete from public.fertilizer_containers where label like $1`, [`${TEST_PREFIX}%`])
  await client.query(`delete from public.fertilizer_recognition_candidates where brand = $1`, [TEST_BRAND])
  await client.query(`delete from public.products where manufacturer = $1`, [TEST_PREFIX])
  await client.query(
    `delete from public.product_profiles where brand = $1 or identity_fingerprint like $2`,
    [TEST_BRAND, `%${TEST_PREFIX}%`],
  )
}

async function runIntegration(client) {
  assertSafeSupabaseWriteTarget(config)
  assertDevTarget()
  await purgeTestPrefixData(client)

  const userA = await createTestUser('user-a')
  const userB = await createTestUser('user-b')
  const clientA = await userClient(userA.email, userA.password)
  const clientB = await userClient(userB.email, userB.password)
  const snapshot = buildRecognitionSnapshot()

  const profileA1 = await ensureAsUser(clientA, snapshot)
  state.createdProfileIds.push(profileA1)

  const { rows: profileRow } = await client.query(
    `select user_id, profile_status, verification_status, source,
            nitrogen, phosphate, potash, npk_declaration
     from public.product_profiles
     where id = $1`,
    [profileA1],
  )

  const p = profileRow[0]
  log(
    'A.draft_created',
    p?.user_id === userA.id &&
      p?.profile_status === 'draft' &&
      p?.verification_status === 'unverified' &&
      p?.source === 'packaging_photo' &&
      Number(p?.nitrogen) === 14 &&
      Number(p?.phosphate) === 28 &&
      Number(p?.potash) === 10,
    JSON.stringify(p),
  )

  const profileA2 = await ensureAsUser(clientA, snapshot)
  log('B.idempotent', profileA1 === profileA2, `${profileA1} === ${profileA2}`)

  const profileB = await ensureAsUser(clientB, snapshot)
  state.createdProfileIds.push(profileB)
  log(
    'C.user_separation',
    profileA1 !== profileB,
    `A=${profileA1}, B=${profileB}`,
  )

  const { data: aReadsB, error: aReadBErr } = await clientA
    .from('product_profiles')
    .select('id')
    .eq('id', profileB)
    .maybeSingle()
  const { data: bReadsA, error: bReadAErr } = await clientB
    .from('product_profiles')
    .select('id')
    .eq('id', profileA1)
    .maybeSingle()
  log('C.rls_isolation', !aReadsB && !bReadsA && !aReadBErr && !bReadAErr, `A→B=${Boolean(aReadsB)}, B→A=${Boolean(bReadsA)}`)

  const [parallel1, parallel2] = await Promise.all([
    ensureAsUser(clientA, snapshot),
    ensureAsUser(clientA, snapshot),
  ])
  const { rows: draftCount } = await client.query(
    `select count(*)::int as count from public.product_profiles
     where user_id = $1 and profile_status = 'draft' and identity_fingerprint like $2`,
    [userA.id, `%${TEST_PREFIX}%`],
  )
  log(
    'D.parallel',
    parallel1 === parallel2 && draftCount[0]?.count === 1,
    `ids=${parallel1}/${parallel2}, drafts=${draftCount[0]?.count}`,
  )

  const { error: directInsertErr } = await clientA.from('product_profiles').insert({
    user_id: userA.id,
    identity_fingerprint: `${TEST_PREFIX}-direct`,
    source: 'packaging_photo',
    profile_status: 'draft',
    verification_status: 'unverified',
  })
  const { error: directUpdateErr } = await clientA
    .from('product_profiles')
    .update({ brand: 'hack' })
    .eq('id', profileA1)
  const { error: directDeleteErr } = await clientA
    .from('product_profiles')
    .delete()
    .eq('id', profileA1)
  const { data: ownDraftReadable } = await clientA
    .from('product_profiles')
    .select('id')
    .eq('id', profileA1)
    .maybeSingle()
  const { rows: verifiedReadProbe } = await client.query(
    `insert into public.product_profiles (
      user_id, identity_fingerprint, brand, source, profile_status, verification_status
    ) values (null, $1, $2, 'packaging_photo', 'verified', 'verified') returning id`,
    [`${TEST_PREFIX}-read-probe-${Date.now()}`, TEST_BRAND],
  )
  const readProbeId = verifiedReadProbe[0].id
  state.createdProfileIds.push(readProbeId)
  const { data: verifiedReadable } = await clientA
    .from('product_profiles')
    .select('id')
    .eq('id', readProbeId)
    .maybeSingle()
  log(
    'F.direct_writes_blocked',
    Boolean(directInsertErr) &&
      Boolean(directUpdateErr) &&
      Boolean(directDeleteErr) &&
      Boolean(ownDraftReadable) &&
      Boolean(verifiedReadable),
    `insert=${directInsertErr?.code}, update=${directUpdateErr?.code}, delete=${directDeleteErr?.code}, ownDraft=${Boolean(ownDraftReadable)}, verified=${Boolean(verifiedReadable)}`,
  )

  const sharedFingerprint = (
    await client.query(
      `select public.build_product_profile_fingerprint_from_snapshot($1::jsonb) as fp`,
      [JSON.stringify(snapshot)],
    )
  ).rows[0].fp

  await client.query(
    `delete from public.product_profiles
     where identity_fingerprint = $1 and profile_status = 'draft'`,
    [sharedFingerprint],
  )

  const { rows: verifiedInsert } = await client.query(
    `insert into public.product_profiles (
      user_id, identity_fingerprint, brand, product_line, official_name,
      npk_declaration, nitrogen, phosphate, potash,
      source, profile_status, verification_status
    ) values (
      null, $1, $2, $3, $4, $5, 14, 28, 10, 'packaging_photo', 'verified', 'verified'
    ) returning id`,
    [sharedFingerprint, TEST_BRAND, TEST_LINE, TEST_NAME, `NPK ${TEST_NPK}`],
  )
  const verifiedId = verifiedInsert[0].id
  state.verifiedProfileId = verifiedId
  state.createdProfileIds.push(verifiedId)

  const ensureVerifiedA = await ensureAsUser(clientA, snapshot)
  const ensureVerifiedB = await ensureAsUser(clientB, snapshot)
  const { rows: extraDrafts } = await client.query(
    `select count(*)::int as count from public.product_profiles
     where identity_fingerprint = $1 and profile_status = 'draft'`,
    [sharedFingerprint],
  )
  log(
    'E.verified_reuse',
    ensureVerifiedA === verifiedId &&
      ensureVerifiedB === verifiedId &&
      extraDrafts[0]?.count === 0,
    `A=${ensureVerifiedA}, B=${ensureVerifiedB}, verified=${verifiedId}, extraDrafts=${extraDrafts[0]?.count}`,
  )

  const draftId = (
    await client.query(
      `insert into public.product_profiles (
        user_id, identity_fingerprint, brand, source, profile_status, verification_status
      ) values ($1, $2, $3, 'packaging_photo', 'draft', 'unverified') returning id`,
      [userA.id, `${TEST_PREFIX}-catalog-draft-${Date.now()}`, TEST_BRAND],
    )
  ).rows[0].id
  state.createdProfileIds.push(draftId)

  let rejectedDraftLink = false
  try {
    await insertTestCatalogProduct(client, { productProfileId: draftId })
  } catch (error) {
    rejectedDraftLink = error.message.includes('CATALOG_PRODUCT_PROFILE_MUST_BE_VERIFIED_GLOBAL')
  }
  log('catalog.reject_draft', rejectedDraftLink, rejectedDraftLink ? 'abgelehnt' : 'unerwartet erlaubt')

  const catalogProductId = await insertTestCatalogProduct(client, { productProfileId: verifiedId })
  log('catalog.verified_link', true, catalogProductId)

  let rejectedDowngrade = false
  try {
    await client.query(
      `update public.product_profiles
       set profile_status = 'draft', verification_status = 'unverified', user_id = $1
       where id = $2`,
      [userA.id, verifiedId],
    )
  } catch (error) {
    rejectedDowngrade = error.message.includes('CATALOG_LINKED_PRODUCT_PROFILE_MUST_REMAIN_VERIFIED_GLOBAL')
  }
  log('catalog.reject_downgrade', rejectedDowngrade, rejectedDowngrade ? 'abgelehnt' : 'unerwartet erlaubt')

  await client.query(
    `update public.products set soft_deleted_at = timezone('utc', now()) where id = $1`,
    [catalogProductId],
  )

  await client.query(
    `update public.product_profiles
     set profile_status = 'draft', verification_status = 'unverified', user_id = $1
     where id = $2`,
    [userA.id, verifiedId],
  )
  log('catalog.soft_deleted_allows_downgrade', true, 'Profil downgrade bei nur soft-gelöschter Referenz')

  let rejectedReactivation = false
  try {
    await client.query(
      `update public.products set soft_deleted_at = null where id = $1`,
      [catalogProductId],
    )
  } catch (error) {
    rejectedReactivation = error.message.includes('CATALOG_PRODUCT_PROFILE_MUST_BE_VERIFIED_GLOBAL')
  }
  log('catalog.reject_reactivation', rejectedReactivation, rejectedReactivation ? 'abgelehnt' : 'unerwartet erlaubt')

  await client.query(
    `update public.product_profiles
     set profile_status = 'verified', verification_status = 'verified', user_id = null
     where id = $1`,
    [verifiedId],
  )
  await client.query(`update public.products set soft_deleted_at = null where id = $1`, [catalogProductId])
  log('catalog.reactivation_after_fix', true, 'Reaktivierung nach verified/global wieder erlaubt')

  let rejectedDelete = false
  try {
    await client.query(`delete from public.product_profiles where id = $1`, [verifiedId])
  } catch (error) {
    rejectedDelete = error.code === '23503'
  }
  log('catalog.fk_restrict_delete', rejectedDelete, rejectedDelete ? 'RESTRICT greift' : 'unerwartet gelöscht')

  await client.query(`update public.products set product_profile_id = null where id = $1`, [catalogProductId])
  await client.query(`delete from public.product_profiles where id = $1`, [verifiedId])
  state.createdProfileIds = state.createdProfileIds.filter((id) => id !== verifiedId)
  log('catalog.unlink_then_delete', true, 'Entkoppeln und Löschen möglich')

  const saveKey = `${TEST_PREFIX}-save-${Date.now()}`
  const candidate = buildCandidatePayload(5)
  const { data: save1, error: saveErr1 } = await clientA.rpc('save_fertilizer_capture', {
    p_idempotency_key: saveKey,
    p_catalog_product_id: null,
    p_candidate: candidate,
    p_purchase_quantity: 5,
    p_purchase_unit: 'kg',
    p_previous_remainder: 0,
    p_package_count: 1,
    p_product_label: `${TEST_PREFIX} Save Test`,
  })
  if (saveErr1) throw saveErr1
  state.createdReceiptIds.push(save1.receipt_id)
  state.createdContainerIds.push(save1.container_id)
  if (save1.recognition_candidate_id) state.createdCandidateIds.push(save1.recognition_candidate_id)
  if (save1.product_profile_id) state.createdProfileIds.push(save1.product_profile_id)

  const { rows: saveCounts } = await client.query(
    `select
      (select count(*) from public.product_profiles where id = $1) as profiles,
      (select count(*) from public.fertilizer_recognition_candidates where id = $2) as candidates,
      (select count(*) from public.fertilizer_containers where id = $3) as containers,
      (select count(*) from public.fertilizer_capture_receipts where id = $4) as receipts,
      (select count(*) from public.fertilizer_stock_movements where container_id = $3 and movement_type = 'purchase') as purchases`,
    [save1.product_profile_id, save1.recognition_candidate_id, save1.container_id, save1.receipt_id],
  )
  log(
    'save.initial',
    saveCounts[0]?.profiles === '1' &&
      saveCounts[0]?.candidates === '1' &&
      saveCounts[0]?.containers === '1' &&
      saveCounts[0]?.receipts === '1' &&
      saveCounts[0]?.purchases === '1',
    JSON.stringify(saveCounts[0]),
  )

  const { data: save2, error: saveErr2 } = await clientA.rpc('save_fertilizer_capture', {
    p_idempotency_key: saveKey,
    p_catalog_product_id: null,
    p_candidate: candidate,
    p_purchase_quantity: 5,
    p_purchase_unit: 'kg',
    p_previous_remainder: 0,
    p_package_count: 1,
    p_product_label: `${TEST_PREFIX} Save Test`,
  })
  if (saveErr2) throw saveErr2
  log(
    'save.idempotent',
    save2.idempotent_replay === true &&
      save1.receipt_id === save2.receipt_id &&
      save1.container_id === save2.container_id &&
      save1.product_profile_id === save2.product_profile_id &&
      save1.product_profile_id != null,
    JSON.stringify({
      save1: save1.receipt_id,
      save2: save2.receipt_id,
      replay: save2.idempotent_replay,
      profile1: save1.product_profile_id,
      profile2: save2.product_profile_id,
    }),
  )

  const { data: save3 } = await clientA.rpc('save_fertilizer_capture', {
    p_idempotency_key: saveKey,
    p_catalog_product_id: null,
    p_candidate: candidate,
    p_purchase_quantity: 5,
    p_purchase_unit: 'kg',
    p_previous_remainder: 0,
    p_package_count: 1,
    p_product_label: `${TEST_PREFIX} Save Test`,
  })
  const { data: save4 } = await clientA.rpc('save_fertilizer_capture', {
    p_idempotency_key: saveKey,
    p_catalog_product_id: null,
    p_candidate: candidate,
    p_purchase_quantity: 5,
    p_purchase_unit: 'kg',
    p_previous_remainder: 0,
    p_package_count: 1,
    p_product_label: `${TEST_PREFIX} Save Test`,
  })
  const { rows: replayCounts } = await client.query(
    `select
      (select count(*) from public.fertilizer_capture_receipts where idempotency_key = $1) as receipts,
      (select count(*) from public.fertilizer_stock_movements where capture_idempotency_key = $1) as movements`,
    [saveKey],
  )
  log(
    'save.multi_replay',
    save3?.idempotent_replay === true &&
      save4?.idempotent_replay === true &&
      save3?.product_profile_id === save1.product_profile_id &&
      save4?.product_profile_id === save1.product_profile_id &&
      replayCounts[0]?.receipts === '1' &&
      replayCounts[0]?.movements === '1',
    JSON.stringify({ save3: save3?.product_profile_id, save4: save4?.product_profile_id, counts: replayCounts[0] }),
  )

  const saveKey10 = `${TEST_PREFIX}-save-10kg-${Date.now()}`
  const candidate10 = buildCandidatePayload(10)
  const { data: save10, error: save10Err } = await clientA.rpc('save_fertilizer_capture', {
    p_idempotency_key: saveKey10,
    p_catalog_product_id: null,
    p_candidate: candidate10,
    p_purchase_quantity: 10,
    p_purchase_unit: 'kg',
    p_previous_remainder: 0,
    p_package_count: 1,
    p_product_label: `${TEST_PREFIX} Save 10kg`,
  })
  if (save10Err) throw save10Err
  log(
    'save.package_variant_same_profile',
    save10.product_profile_id === save1.product_profile_id,
    `${save10.product_profile_id} vs ${save1.product_profile_id}`,
  )
}

async function runSaveReplayOnly(client) {
  assertSafeSupabaseWriteTarget(config)
  assertDevTarget()
  await purgeTestPrefixData(client)
  const userA = await createTestUser('replay-only')
  const clientA = await userClient(userA.email, userA.password)
  const saveKey = `${TEST_PREFIX}-replay-${Date.now()}`
  const candidate = buildCandidatePayload(5)

  const { data: save1, error: saveErr1 } = await clientA.rpc('save_fertilizer_capture', {
    p_idempotency_key: saveKey,
    p_catalog_product_id: null,
    p_candidate: candidate,
    p_purchase_quantity: 5,
    p_purchase_unit: 'kg',
    p_previous_remainder: 0,
    p_package_count: 1,
    p_product_label: `${TEST_PREFIX} Replay Test`,
  })
  if (saveErr1) throw saveErr1
  if (save1.product_profile_id) state.createdProfileIds.push(save1.product_profile_id)
  if (save1.recognition_candidate_id) state.createdCandidateIds.push(save1.recognition_candidate_id)
  if (save1.container_id) state.createdContainerIds.push(save1.container_id)
  if (save1.receipt_id) state.createdReceiptIds.push(save1.receipt_id)

  log('replay.initial_profile', save1.product_profile_id != null, String(save1.product_profile_id))

  const replays = []
  for (let i = 0; i < 3; i += 1) {
    const { data, error } = await clientA.rpc('save_fertilizer_capture', {
      p_idempotency_key: saveKey,
      p_catalog_product_id: null,
      p_candidate: candidate,
      p_purchase_quantity: 5,
      p_purchase_unit: 'kg',
      p_previous_remainder: 0,
      p_package_count: 1,
      p_product_label: `${TEST_PREFIX} Replay Test`,
    })
    if (error) throw error
    replays.push(data)
  }

  const allMatch =
    replays.every(
      (r) =>
        r.idempotent_replay === true &&
        r.receipt_id === save1.receipt_id &&
        r.container_id === save1.container_id &&
        r.product_profile_id === save1.product_profile_id,
    )
  log('replay.three_calls', allMatch, replays.map((r) => r.product_profile_id).join(', '))
}

async function runMigrationState(client) {
  assertReadOnlySupabaseTarget(config)
  const target = assertDevTarget()
  log('state.projectRef', target.projectRef === DEV_REF, target.projectRef)

  const hasProfiles = await tableExists(client, 'product_profiles')
  log('state.20250801', hasProfiles, hasProfiles ? 'product_profiles vorhanden' : 'fehlt')

  const { rows: fnDef } = await client.query(
    `select pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'save_fertilizer_capture'`,
  )
  const def = fnDef[0]?.def ?? ''
  const hasReplayProfile =
    def.includes('idempotent_replay') &&
    def.includes('v_existing.recognition_candidate_id is not null') &&
    def.includes('frc.product_profile_id')
  log('state.20250802', hasReplayProfile, hasReplayProfile ? 'Replay liefert product_profile_id' : 'Replay-Fix fehlt')

  const { rows: supabaseMigrations } = await client.query(
    `select exists (
      select 1 from information_schema.tables
      where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'
    ) as exists`,
  )
  log(
    'state.supabase_cli_table',
    true,
    supabaseMigrations[0]?.exists
      ? 'supabase_migrations.schema_migrations vorhanden (CLI)'
      : 'nicht vorhanden — Greenkeeper nutzt schema.sql + Datei-Migrationen',
  )
}

async function runRasendoktorReadonly(client) {
  assertReadOnlySupabaseTarget(config)
  const { rows } = await client.query(
    `select frc.id as candidate_id,
            frc.product_profile_id,
            frc.brand,
            frc.product_line,
            frc.product_name,
            frc.npk,
            frc.identity_fingerprint,
            fc.id as container_id,
            fc.package_size_value,
            fc.package_size_unit,
            fcr.id as receipt_id,
            fcr.resulting_balance,
            (select count(*) from public.fertilizer_stock_movements m
             where m.container_id = fc.id and m.movement_type = 'purchase') as purchase_movements,
            (select count(*) from public.product_profiles pp
             where pp.identity_fingerprint = frc.identity_fingerprint) as matching_profiles
     from public.fertilizer_recognition_candidates frc
     left join public.fertilizer_containers fc
       on fc.recognition_candidate_id = frc.id and fc.archived_at is null
     left join public.fertilizer_capture_receipts fcr
       on fcr.recognition_candidate_id = frc.id
     where lower(coalesce(frc.brand, '')) like '%rasendoktor%'
       and lower(coalesce(frc.product_name, '')) like '%frühjahr%'
     order by frc.created_at desc`,
  )
  if (rows.length === 0) {
    log('rasendoktor.found', true, 'Kein passender Datensatz in Dev')
    return
  }
  if (rows.length > 1) {
    log('rasendoktor.single_candidate', false, `${rows.length} Treffer`)
    return
  }
  const row = rows[0]
  const balanceOk = Number(row.resulting_balance) === 5
  const packageOk = Number(row.package_size_value) === 5 && row.package_size_unit === 'kg'
  const npkOk = String(row.npk ?? '').includes('14')
  log(
    'rasendoktor.unchanged',
    row.product_profile_id == null &&
      row.purchase_movements === '1' &&
      row.matching_profiles === '0' &&
      balanceOk &&
      packageOk &&
      npkOk,
    `candidate=${row.candidate_id}, container=${row.container_id}, receipt=${row.receipt_id}, profile=${row.product_profile_id}, balance=${row.resulting_balance}, npk=${row.npk}`,
  )
}

async function runCleanupVerify(client) {
  assertReadOnlySupabaseTarget(config)
  const checks = [
    ['product_profiles', `select count(*)::int as c from public.product_profiles where brand = $1 or identity_fingerprint like $2`, [TEST_BRAND, `%${TEST_PREFIX}%`]],
    ['candidates', `select count(*)::int as c from public.fertilizer_recognition_candidates where brand = $1`, [TEST_BRAND]],
    ['containers', `select count(*)::int as c from public.fertilizer_containers where label like $1`, [`${TEST_PREFIX}%`]],
    ['receipts', `select count(*)::int as c from public.fertilizer_capture_receipts where idempotency_key like $1`, [`${TEST_PREFIX}%`]],
    ['movements', `select count(*)::int as c from public.fertilizer_stock_movements where capture_idempotency_key like $1`, [`${TEST_PREFIX}%`]],
    ['products', `select count(*)::int as c from public.products where manufacturer = $1`, [TEST_PREFIX]],
  ]
  for (const [name, sql, params] of checks) {
    const { rows } = await client.query(sql, params)
    log(`cleanup.verify.${name}`, rows[0]?.c === 0, `count=${rows[0]?.c}`)
  }
}

async function runCleanup(client) {
  assertSafeSupabaseWriteTarget(config)
  console.log(`Cleanup-Selektion: Präfix=${TEST_PREFIX}, brand=${TEST_BRAND}, manufacturer=${TEST_PREFIX}`)
  console.log('Tabellen: fertilizer_stock_movements, fertilizer_capture_receipts, fertilizer_containers, fertilizer_recognition_candidates, products, product_profiles, auth.users')

  await purgeTestPrefixData(client)

  const admin = adminClient()
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 })
  const testUsers = (users?.users ?? []).filter((u) => u.email?.startsWith(`${TEST_PREFIX}`))
  for (const user of testUsers) {
    await admin.auth.admin.deleteUser(user.id)
  }
  log('cleanup', true, `Auth-Nutzer entfernt=${testUsers.length}, Präfix=${TEST_PREFIX}`)
}

async function main() {
  const client = await connectPg()
  try {
    if (modes.has('--pre-check')) await runPreCheck(client)
    if (modes.has('--post-schema')) await runPostSchema(client)
    if (modes.has('--migration-state')) await runMigrationState(client)
    if (modes.has('--integration')) await runIntegration(client)
    if (modes.has('--save-replay')) await runSaveReplayOnly(client)
    if (modes.has('--rasendoktor-readonly')) await runRasendoktorReadonly(client)
    if (modes.has('--cleanup')) await runCleanup(client)
    if (modes.has('--cleanup-verify')) await runCleanupVerify(client)
    if (modes.size === 0) {
      throw new Error(
        'Modus fehlt: --pre-check | --post-schema | --migration-state | --integration | --save-replay | --rasendoktor-readonly | --cleanup | --cleanup-verify',
      )
    }
  } finally {
    await client.end()
  }

  const failed = results.filter((r) => !r.ok)
  console.log(`\nErgebnis: ${results.length - failed.length}/${results.length} OK`)
  if (failed.length > 0) {
    console.error('Fehlgeschlagen:', failed.map((f) => f.section).join(', '))
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error)
  process.exit(1)
})
