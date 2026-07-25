/**
 * Verifikation nach Migration 20250725_onboarding_care_groups.sql (nur Dev).
 *
 * Ausführung:
 *   ALLOW_SUPABASE_WRITE_TESTS=true node scripts/verify-onboarding-migration.mjs
 *
 * Voraussetzungen:
 *   - .env.local zeigt auf Dev (≠ keoxzyzdkvebedgdswah)
 *   - ALLOW_SUPABASE_WRITE_TESTS=true
 */
import { createClient } from '@supabase/supabase-js'
import {
  assertSafeSupabaseWriteTarget,
  describeSupabaseTarget,
  loadLocalEnv,
} from './supabaseEnvGuard.mjs'

const config = loadLocalEnv()
const target = assertSafeSupabaseWriteTarget(config)

console.log(`Supabase-Ziel: ${target.projectRef} (${target.supabaseUrl})`)

const supabaseUrl = config.supabaseUrl
const serviceRoleKey = config.serviceRoleKey
const anonKey = config.anonKey

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const results = []
const testUsers = []
const cleanupOnly = process.argv.includes('--cleanup-only')

function log(section, ok, detail) {
  results.push({ section, ok, detail })
  console.log(`${ok ? '✅' : '❌'} [${section}] ${detail}`)
}

async function migrationApplied() {
  const { error } = await admin.from('care_groups').select('id').limit(1)
  if (error?.code === 'PGRST205') return false
  const { error: profileError } = await admin
    .from('profiles')
    .select('onboarding_completed_at')
    .limit(1)
  return !profileError
}

async function verifySchema() {
  const { data: profileSample, error: profileError } = await admin
    .from('profiles')
    .select('onboarding_completed_at')
    .limit(1)

  if (profileError) {
    log('schema.profiles', false, profileError.message)
    return false
  }

  log(
    'schema.profiles',
    true,
    `onboarding_completed_at abfragbar (Sample: ${profileSample?.[0]?.onboarding_completed_at ?? 'NULL'})`,
  )

  for (const table of ['care_groups', 'care_group_areas']) {
    const { error } = await admin.from(table).select('*').limit(0)
    log(`schema.${table}`, !error, error?.message ?? 'Tabelle vorhanden')
  }

  const { error: rpcProbe } = await admin.rpc('complete_onboarding', {
    payload: { areas: [{ name: 'Probe' }], care_mode: 'single' },
  })
  const rpcExists = rpcProbe && !rpcProbe.message.includes('Could not find the function')
  log(
    'schema.rpc',
    rpcExists,
    rpcExists ? `RPC antwortet: ${rpcProbe.message}` : rpcProbe?.message ?? 'RPC fehlt',
  )

  return true
}

function randomEmail(label) {
  return `gk-verify-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
}

async function createTestUser(label, password = 'GkVerifyTest123!') {
  const email = randomEmail(label)
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw new Error(`Testnutzer ${label}: ${error.message}`)
  testUsers.push({ id: data.user.id, email, password, label })
  return { id: data.user.id, email, password }
}

async function userClient(email, password) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Login ${email}: ${error.message}`)
  return client
}

async function getProfileState(userId) {
  const { data, error } = await admin
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function countUserEntities(userId) {
  const [areas, groups, memberships] = await Promise.all([
    admin.from('areas').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('care_groups').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin
      .from('care_group_areas')
      .select('care_group_id', { count: 'exact', head: true })
      .in(
        'care_group_id',
        (
          await admin.from('care_groups').select('id').eq('user_id', userId)
        ).data?.map((row) => row.id) ?? ['00000000-0000-0000-0000-000000000000'],
      ),
  ])
  return {
    areas: areas.count ?? 0,
    groups: groups.count ?? 0,
    memberships: memberships.count ?? 0,
  }
}

async function callComplete(client, payload) {
  return client.rpc('complete_onboarding', { payload })
}

async function runRpcTests() {
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: unauthError } = await callComplete(anonClient, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: 10 }],
    care_mode: 'single',
  })
  log(
    'rpc.A unauth',
    unauthError?.message?.includes('NOT_AUTHENTICATED') ?? false,
    unauthError?.message ?? 'kein Fehler',
  )

  const userB = await createTestUser('single-size')
  const clientB = await userClient(userB.email, userB.password)
  const { data: singleData, error: singleError } = await callComplete(clientB, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: 42 }],
    care_mode: 'single',
  })
  const countsB = await countUserEntities(userB.id)
  const profileB = await getProfileState(userB.id)
  log(
    'rpc.B single+size',
    !singleError &&
      countsB.areas === 1 &&
      countsB.groups === 1 &&
      countsB.memberships === 1 &&
      profileB?.onboarding_completed_at,
    singleError?.message ??
      `areas=${countsB.areas}, groups=${countsB.groups}, memberships=${countsB.memberships}, completed=${Boolean(profileB?.onboarding_completed_at)}`,
  )

  const userC = await createTestUser('single-no-size')
  const clientC = await userClient(userC.email, userC.password)
  const { error: noSizeError } = await callComplete(clientC, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: null }],
    care_mode: 'single',
  })
  const { data: areaC } = await admin
    .from('areas')
    .select('size_sqm')
    .eq('user_id', userC.id)
    .maybeSingle()
  log(
    'rpc.C single null size',
    !noSizeError && areaC?.size_sqm === null,
    noSizeError?.message ?? `size_sqm=${areaC?.size_sqm}`,
  )

  const userD = await createTestUser('together')
  const clientD = await userClient(userD.email, userD.password)
  const { error: togetherError } = await callComplete(clientD, {
    areas: [
      { name: 'Rasenfläche 1', size_sqm: 10 },
      { name: 'Rasenfläche 2', size_sqm: 20 },
    ],
    care_mode: 'together',
  })
  const countsD = await countUserEntities(userD.id)
  log(
    'rpc.D together',
    !togetherError && countsD.areas === 2 && countsD.groups === 1 && countsD.memberships === 2,
    togetherError?.message ??
      `areas=${countsD.areas}, groups=${countsD.groups}, memberships=${countsD.memberships}`,
  )

  const userE = await createTestUser('separate')
  const clientE = await userClient(userE.email, userE.password)
  const { error: separateError } = await callComplete(clientE, {
    areas: [
      { name: 'Rasenfläche 1', size_sqm: 10 },
      { name: 'Rasenfläche 2', size_sqm: null },
    ],
    care_mode: 'separate',
  })
  const countsE = await countUserEntities(userE.id)
  log(
    'rpc.E separate',
    !separateError && countsE.areas === 2 && countsE.groups === 2 && countsE.memberships === 2,
    separateError?.message ??
      `areas=${countsE.areas}, groups=${countsE.groups}, memberships=${countsE.memberships}`,
  )

  const invalidCases = [
    ['1+together', { areas: [{ name: 'Rasenfläche 1' }], care_mode: 'together' }, 'INVALID_CARE_MODE_FOR_COUNT'],
    ['2+single', { areas: [{ name: 'A' }, { name: 'B' }], care_mode: 'single' }, 'INVALID_CARE_MODE_FOR_COUNT'],
    ['0 areas', { areas: [], care_mode: 'single' }, 'INVALID_AREA_COUNT'],
    ['21 areas', {
      areas: Array.from({ length: 21 }, (_, i) => ({ name: `Rasenfläche ${i + 1}` })),
      care_mode: 'together',
    }, 'INVALID_AREA_COUNT'],
    ['empty name', { areas: [{ name: '   ' }], care_mode: 'single' }, 'EMPTY_AREA_NAME'],
    ['negative size', { areas: [{ name: 'Rasenfläche 1', size_sqm: -5 }], care_mode: 'single' }, 'INVALID_AREA_SIZE'],
    ['bad care_mode', { areas: [{ name: 'Rasenfläche 1' }], care_mode: 'joint' }, 'INVALID_CARE_MODE'],
  ]

  for (const [label, payload, expected] of invalidCases) {
    const user = await createTestUser(`invalid-${label.replace(/\W+/g, '-')}`)
    const client = await userClient(user.email, user.password)
    const { error } = await callComplete(client, payload)
    const profile = await getProfileState(user.id)
    const counts = await countUserEntities(user.id)
    const ok =
      Boolean(error?.message?.includes(expected)) &&
      !profile?.onboarding_completed_at &&
      counts.areas === 0 &&
      counts.groups === 0
    log(`rpc.F ${label}`, ok, error?.message ?? 'unerwartet erfolgreich')
  }

  const userG = await createTestUser('duplicate')
  const clientG = await userClient(userG.email, userG.password)
  await callComplete(clientG, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: 15 }],
    care_mode: 'single',
  })
  const beforeDup = await countUserEntities(userG.id)
  const { error: dupError } = await callComplete(clientG, {
    areas: [{ name: 'Rasenfläche 2', size_sqm: 20 }],
    care_mode: 'single',
  })
  const afterDup = await countUserEntities(userG.id)
  log(
    'rpc.G duplicate',
    dupError?.message?.includes('ONBOARDING_ALREADY_COMPLETED') &&
      afterDup.areas === beforeDup.areas &&
      afterDup.groups === beforeDup.groups,
    dupError?.message ?? 'kein Duplicate-Fehler',
  )

  const userH = await createTestUser('active-areas')
  await admin.from('areas').insert({
    user_id: userH.id,
    name: 'Bestehende Fläche',
    sort_order: 0,
  })
  const clientH = await userClient(userH.email, userH.password)
  const { error: activeError } = await callComplete(clientH, {
    areas: [{ name: 'Neue Fläche', size_sqm: 10 }],
    care_mode: 'single',
  })
  const profileH = await getProfileState(userH.id)
  log(
    'rpc.H active areas',
    activeError?.message?.includes('ACTIVE_AREAS_EXIST') && !profileH?.onboarding_completed_at,
    activeError?.message ?? 'unerwartet erfolgreich',
  )

  const userRollback = await createTestUser('rollback')
  const clientRollback = await userClient(userRollback.email, userRollback.password)
  const { error: rollbackError } = await callComplete(clientRollback, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: 0 }],
    care_mode: 'single',
  })
  const rollbackProfile = await getProfileState(userRollback.id)
  const rollbackCounts = await countUserEntities(userRollback.id)
  log(
    'rpc.rollback INVALID_AREA_SIZE',
    rollbackError?.message?.includes('INVALID_AREA_SIZE') &&
      !rollbackProfile?.onboarding_completed_at &&
      rollbackCounts.areas === 0 &&
      rollbackCounts.groups === 0,
    `${rollbackError?.message ?? 'ok'} | areas=${rollbackCounts.areas}, completed=${Boolean(rollbackProfile?.onboarding_completed_at)}`,
  )
}

async function runRlsTests() {
  const userA = await createTestUser('rls-a')
  const userB = await createTestUser('rls-b')
  const clientA = await userClient(userA.email, userA.password)
  const clientB = await userClient(userB.email, userB.password)

  await callComplete(clientA, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: 30 }],
    care_mode: 'single',
  })
  await callComplete(clientB, {
    areas: [{ name: 'Rasenfläche 1', size_sqm: 40 }],
    care_mode: 'single',
  })

  const { data: ownGroups } = await clientA.from('care_groups').select('id,user_id')
  const { data: foreignGroups } = await clientA
    .from('care_groups')
    .select('id,user_id')
    .eq('user_id', userB.id)
  const { data: ownMemberships } = await clientA.from('care_group_areas').select('care_group_id,area_id')
  const bArea = (
    await admin.from('areas').select('id').eq('user_id', userB.id).maybeSingle()
  ).data
  const aGroup = (
    await admin.from('care_groups').select('id').eq('user_id', userA.id).maybeSingle()
  ).data

  const { error: crossInsertError } = await clientA.from('care_group_areas').insert({
    care_group_id: aGroup?.id,
    area_id: bArea?.id,
  })

  const { error: foreignUpdateError } = await clientA
    .from('care_groups')
    .update({ name: 'Hijacked' })
    .eq('user_id', userB.id)

  const { data: bOwnGroups } = await clientB.from('care_groups').select('id,user_id')

  log(
    'rls own read',
    (ownGroups?.length ?? 0) === 1 && (ownMemberships?.length ?? 0) === 1,
    `A groups=${ownGroups?.length}, memberships=${ownMemberships?.length}`,
  )
  log(
    'rls foreign read',
    (foreignGroups?.length ?? 0) === 0,
    `A sieht B groups=${foreignGroups?.length ?? 0}`,
  )
  log(
    'rls cross insert',
    Boolean(crossInsertError),
    crossInsertError?.message ?? 'Insert unerwartet erlaubt',
  )
  log(
    'rls foreign update',
    (foreignUpdateError?.details ?? foreignUpdateError?.message ?? 'ok') !== undefined &&
      (await admin.from('care_groups').select('name').eq('user_id', userB.id).maybeSingle()).data
        ?.name !== 'Hijacked',
    foreignUpdateError?.message ?? 'Update unerwartet erlaubt',
  )
  log(
    'rls B isolation',
    (bOwnGroups?.length ?? 0) === 1 && bOwnGroups?.every((row) => row.user_id === userB.id),
    `B groups=${bOwnGroups?.length ?? 0}`,
  )
}

async function cleanupTestUsers() {
  for (const user of testUsers) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    log(`cleanup ${user.label}`, !error, error?.message ?? user.email)
  }
}

async function main() {
  if (cleanupOnly) {
    assertSafeSupabaseWriteTarget(config)
    console.log('Cleanup-only Modus: keine Testnutzer-Liste im Skript gespeichert.')
    console.log(`Ziel: ${describeSupabaseTarget(config).projectRef}`)
    return
  }

  const applied = await migrationApplied()
  if (!applied) {
    console.error('\nMigration noch nicht angewendet.')
    console.error('Bitte zuerst supabase/migrations/20250725_onboarding_care_groups.sql im SQL Editor ausführen.\n')
    process.exit(2)
  }

  console.log('\n=== Schema ===')
  await verifySchema()

  console.log('\n=== RPC ===')
  await runRpcTests()

  console.log('\n=== RLS ===')
  await runRlsTests()

  console.log('\n=== Cleanup ===')
  await cleanupTestUsers()

  const failed = results.filter((entry) => !entry.ok)
  console.log(`\nErgebnis: ${results.length - failed.length}/${results.length} OK`)
  if (failed.length) {
    failed.forEach((entry) => console.log(`  - ${entry.section}: ${entry.detail}`))
    process.exit(1)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
