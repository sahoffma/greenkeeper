/**
 * Supabase-Hilfen für E2E-Tests (nur Dev, mit Environment-Guard).
 */
import { createClient } from '@supabase/supabase-js'
import {
  assertSafeSupabaseWriteTarget,
  loadLocalEnv,
} from '../../scripts/supabaseEnvGuard.mjs'

export const DEV_PROJECT_REF = 'amyounxrsxgujsfutshx'
export const TEST_PASSWORD = 'GkE2eTest123!'

let adminClient
let envConfig

export function loadE2eEnv() {
  if (!envConfig) {
    envConfig = loadLocalEnv()
    assertSafeSupabaseWriteTarget(envConfig)

    if (envConfig.projectRef !== DEV_PROJECT_REF) {
      throw new Error(
        `ABBRUCH: E2E erlaubt nur Dev-Ref ${DEV_PROJECT_REF}, erhalten: ${envConfig.projectRef}`,
      )
    }
  }

  return envConfig
}

export function getAdminClient() {
  loadE2eEnv()

  if (!adminClient) {
    adminClient = createClient(envConfig.supabaseUrl, envConfig.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  }

  return adminClient
}

export function randomE2eEmail(label) {
  return `gk-e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.com`
}

export async function createUserWithCredentials(email, password = TEST_PASSWORD) {
  assertSafeSupabaseWriteTarget(loadE2eEnv())
  const admin = getAdminClient()

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    throw new Error(`Testnutzer ${email}: ${error.message}`)
  }

  return { id: data.user.id, email, password }
}

export async function createConfirmedUser(label, password = TEST_PASSWORD) {
  assertSafeSupabaseWriteTarget(loadE2eEnv())
  const admin = getAdminClient()
  const email = randomE2eEmail(label)

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (error) {
    throw new Error(`Testnutzer ${label}: ${error.message}`)
  }

  return { id: data.user.id, email, password }
}

export async function deleteUser(userId) {
  assertSafeSupabaseWriteTarget(loadE2eEnv())
  const admin = getAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)

  if (error) {
    throw new Error(`Cleanup Nutzer ${userId}: ${error.message}`)
  }
}

export async function countUserEntities(userId) {
  const admin = getAdminClient()

  const [areas, groups, groupRows] = await Promise.all([
    admin.from('areas').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('care_groups').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    admin.from('care_groups').select('id').eq('user_id', userId),
  ])

  const groupIds = groupRows.data?.map((row) => row.id) ?? []

  let memberships = 0

  if (groupIds.length > 0) {
    const { count } = await admin
      .from('care_group_areas')
      .select('care_group_id', { count: 'exact', head: true })
      .in('care_group_id', groupIds)
    memberships = count ?? 0
  }

  return {
    areas: areas.count ?? 0,
    groups: groups.count ?? 0,
    memberships,
  }
}

export async function getUserAreas(userId) {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('areas')
    .select('id, name, size_sqm')
    .eq('user_id', userId)
    .order('sort_order')

  if (error) {
    throw new Error(error.message)
  }

  return data ?? []
}

export async function getProfileOnboardingState(userId) {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data
}

export async function findUserIdByEmail(email) {
  assertSafeSupabaseWriteTarget(loadE2eEnv())
  const admin = getAdminClient()
  let page = 1

  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })

    if (error) {
      throw new Error(error.message)
    }

    const match = data.users.find((user) => user.email === email)

    if (match) {
      return match.id
    }

    if (data.users.length < 200) {
      break
    }

    page += 1
  }

  throw new Error(`Nutzer nicht gefunden: ${email}`)
}

export async function userClient(email, password = TEST_PASSWORD) {
  loadE2eEnv()
  const client = createClient(envConfig.supabaseUrl, envConfig.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })

  if (error) {
    throw new Error(`Login ${email}: ${error.message}`)
  }

  return client
}

export async function completeOnboardingForUser(user, payload) {
  const client = await userClient(user.email, user.password)
  const { error } = await client.rpc('complete_onboarding', { payload })

  if (error) {
    throw new Error(`complete_onboarding ${user.email}: ${error.message}`)
  }
}

export async function confirmUserEmail(email) {
  assertSafeSupabaseWriteTarget(loadE2eEnv())
  const admin = getAdminClient()
  const userId = await findUserIdByEmail(email)
  const { error } = await admin.auth.admin.updateUserById(userId, { email_confirm: true })

  if (error) {
    throw new Error(`E-Mail-Bestätigung für ${email}: ${error.message}`)
  }
}

export async function cleanupE2eUsers(users) {
  for (const user of users) {
    try {
      await deleteUser(user.id)
    } catch (error) {
      console.warn(`Cleanup fehlgeschlagen für ${user.email}: ${error.message}`)
    }
  }
}
