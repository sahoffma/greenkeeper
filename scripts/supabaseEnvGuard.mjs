/**
 * Schutz vor Schreibtests gegen die Production-Supabase-Umgebung.
 *
 * Schreibende Skripte müssen:
 *   1. assertSafeSupabaseWriteTarget(env) aufrufen
 *   2. ALLOW_SUPABASE_WRITE_TESTS=true setzen
 *   3. eine Dev-Project-Ref (≠ Production) in .env.local verwenden
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const PRODUCTION_PROJECT_REF = 'keoxzyzdkvebedgdswah'
export const PRODUCTION_SUPABASE_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`

export function loadLocalEnv(envPath = resolve(process.cwd(), '.env.local')) {
  const values = Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      }),
  )

  if (values.ALLOW_SUPABASE_WRITE_TESTS?.trim() === 'true') {
    process.env.ALLOW_SUPABASE_WRITE_TESTS = 'true'
  }

  const supabaseUrl = (values.SUPABASE_URL ?? values.VITE_SUPABASE_URL ?? '').trim()
  const projectRef =
    supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1]?.toLowerCase() ?? ''

  return {
    envPath,
    supabaseUrl,
    projectRef,
    anonKey: values.VITE_SUPABASE_ANON_KEY?.trim() ?? '',
    serviceRoleKey: values.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '',
    dbPassword: values.SUPABASE_DB_PASSWORD?.trim() ?? '',
    accessToken: values.SUPABASE_ACCESS_TOKEN?.trim() ?? '',
  }
}

export function describeSupabaseTarget(config = loadLocalEnv()) {
  return {
    projectRef: config.projectRef || '(missing)',
    supabaseUrl: config.supabaseUrl || '(missing)',
    isProduction:
      config.projectRef === PRODUCTION_PROJECT_REF ||
      config.supabaseUrl === PRODUCTION_SUPABASE_URL,
    writeTestsAllowed: process.env.ALLOW_SUPABASE_WRITE_TESTS === 'true',
  }
}

export function assertSafeSupabaseWriteTarget(config = loadLocalEnv()) {
  const target = describeSupabaseTarget(config)

  if (config.projectRef === 'keoxzyzdkvebedgdswah' || config.projectRef === 'greenkeeper-prod') {
    throw new Error(`ABBRUCH: Gesperrte Project-Ref (${config.projectRef}).`)
  }

  if (!config.supabaseUrl || !config.projectRef) {
    throw new Error(
      'Supabase-Ziel unvollständig: SUPABASE_URL oder VITE_SUPABASE_URL in .env.local fehlt.',
    )
  }

  if (target.isProduction) {
    throw new Error(
      `ABBRUCH: .env.local zeigt auf Production (${PRODUCTION_PROJECT_REF}). Schreibende Tests sind gesperrt.`,
    )
  }

  if (!target.writeTestsAllowed) {
    throw new Error(
      'ABBRUCH: ALLOW_SUPABASE_WRITE_TESTS=true fehlt. Schreibende Supabase-Tests sind nicht freigegeben.',
    )
  }

  if (!config.serviceRoleKey || !config.anonKey) {
    throw new Error(
      'ABBRUCH: VITE_SUPABASE_ANON_KEY oder SUPABASE_SERVICE_ROLE_KEY fehlt in .env.local.',
    )
  }

  return target
}

export function assertReadOnlySupabaseTarget(config = loadLocalEnv()) {
  if (!config.supabaseUrl || !config.projectRef) {
    throw new Error('Supabase-URL fehlt in .env.local.')
  }

  if (
    config.projectRef === PRODUCTION_PROJECT_REF ||
    config.supabaseUrl === PRODUCTION_SUPABASE_URL
  ) {
    console.warn(
      `[WARN] Lesender Zugriff auf Production (${PRODUCTION_PROJECT_REF}). Keine Schreiboperationen ausführen.`,
    )
  }

  return describeSupabaseTarget(config)
}
