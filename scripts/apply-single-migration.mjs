/**
 * Wendet genau eine Migration auf die bestätigte Dev-DB an.
 *
 * Dev-Hilfswerkzeug für inkrementelle Schema-Änderungen nach dem Erst-Bootstrap.
 * Ersetzt nicht `schema.sql` + chronologischen Vollaufbau (`apply-dev-schema.mjs`).
 * Registriert Migrationen nicht in Supabase CLI — verbindlicher Stand ergibt sich aus
 * Schema-Verifikation (siehe docs/database-bootstrap.md).
 *
 *   node scripts/apply-single-migration.mjs supabase/migrations/20250729_onboarding_custom_care_groups.sql
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { assertSafeSupabaseWriteTarget, loadLocalEnv } from './supabaseEnvGuard.mjs'

const DEV_REF = 'amyounxrsxgujsfutshx'
const BLOCKED_REFS = new Set(['keoxzyzdkvebedgdswah', 'greenkeeper-prod', 'production'])

async function connect(config) {
  const password = config.dbPassword
  if (!password) {
    throw new Error('SUPABASE_DB_PASSWORD fehlt in .env.local.')
  }

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

async function main() {
  const migrationArg = process.argv[2]
  if (!migrationArg) {
    throw new Error('Migration-Pfad fehlt.')
  }

  const config = loadLocalEnv()
  assertSafeSupabaseWriteTarget(config)

  if (config.projectRef !== DEV_REF || BLOCKED_REFS.has(config.projectRef)) {
    throw new Error(`ABBRUCH: Unerwartete Project-Ref ${config.projectRef}`)
  }

  const migrationPath = resolve(process.cwd(), migrationArg)
  const sql = readFileSync(migrationPath, 'utf8')
  const client = await connect(config)

  try {
    console.log(`Ziel: ${DEV_REF}`)
    console.log(`→ ${migrationArg}`)
    await client.query(sql)
    console.log('Migration erfolgreich angewendet.')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
