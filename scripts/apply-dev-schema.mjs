/**
 * Wendet schema.sql + Migrationen chronologisch auf die bestätigte Dev-DB an.
 * Voraussetzung: SUPABASE_DB_PASSWORD in .env.local, ALLOW_SUPABASE_WRITE_TESTS=true
 *
 * Reihenfolge: schema.sql, dann supabase/migrations/*.sql sortiert (Dateiname).
 * Siehe docs/database-bootstrap.md
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import {
  assertSafeSupabaseWriteTarget,
  loadLocalEnv,
} from './supabaseEnvGuard.mjs'
import { applyBootstrap } from './bootstrapDatabaseCore.mjs'

const DEV_REF = 'amyounxrsxgujsfutshx'
const BLOCKED_REFS = new Set(['keoxzyzdkvebedgdswah', 'greenkeeper-prod', 'production'])

function loadDotEnvAllowFlag() {
  const lines = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8').split('\n')
  for (const line of lines) {
    if (line.startsWith('ALLOW_SUPABASE_WRITE_TESTS=')) {
      const value = line.slice('ALLOW_SUPABASE_WRITE_TESTS='.length).trim()
      if (value === 'true') process.env.ALLOW_SUPABASE_WRITE_TESTS = 'true'
    }
  }
}

async function connect(config) {
  const password = config.dbPassword
  if (!password) {
    throw new Error(
      'SUPABASE_DB_PASSWORD fehlt in .env.local (Dashboard → Settings → Database).',
    )
  }

  const hosts = [
    `db.${DEV_REF}.supabase.co`,
    `aws-0-eu-central-1.pooler.supabase.com`,
  ]

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
  loadDotEnvAllowFlag()
  const config = loadLocalEnv()
  assertSafeSupabaseWriteTarget(config)

  if (config.projectRef !== DEV_REF || BLOCKED_REFS.has(config.projectRef)) {
    throw new Error(`ABBRUCH: Unerwartete Project-Ref ${config.projectRef}`)
  }

  const client = await connect(config)

  try {
    await applyBootstrap(client, {
      onFile: (path) => console.log(`→ ${path}`),
    })
    console.log('Schema und Migrationen (chronologisch) erfolgreich angewendet.')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
