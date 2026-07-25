/**
 * Verifiziert den chronologischen Neuaufbau (schema.sql + Migrationen sortiert)
 * auf der Dev-Datenbank in einer Transaktion mit ROLLBACK — ohne dauerhafte Änderungen.
 *
 * Voraussetzung: SUPABASE_DB_PASSWORD, ALLOW_SUPABASE_WRITE_TESTS=true, Dev-Ref in .env.local
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import {
  assertSafeSupabaseWriteTarget,
  loadLocalEnv,
} from './supabaseEnvGuard.mjs'
import {
  applyBootstrap,
  listMigrationsChronological,
  verifyBootstrapObjects,
} from './bootstrapDatabaseCore.mjs'

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
    throw new Error('SUPABASE_DB_PASSWORD fehlt in .env.local.')
  }

  const client = new pg.Client({
    host: `db.${DEV_REF}.supabase.co`,
    port: 5432,
    user: 'postgres',
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  return client
}

async function resetPublicSchema(client) {
  await client.query(`
    drop schema if exists public cascade;
    create schema public;
    grant all on schema public to postgres;
    grant all on schema public to public;
    grant all on schema public to anon;
    grant all on schema public to authenticated;
    grant all on schema public to service_role;
    create extension if not exists pgcrypto with schema public;
  `)
}

async function main() {
  loadDotEnvAllowFlag()
  const config = loadLocalEnv()
  assertSafeSupabaseWriteTarget(config)

  if (config.projectRef !== DEV_REF || BLOCKED_REFS.has(config.projectRef)) {
    throw new Error(`ABBRUCH: Nur Dev-Ref ${DEV_REF} erlaubt, erhalten: ${config.projectRef}`)
  }

  const migrations = listMigrationsChronological()
  console.log(`Supabase-Ziel: ${config.projectRef} (transaktionaler Neuaufbau-Test)`)
  console.log(`Migrationen chronologisch (${migrations.length}):`)
  for (const file of migrations) console.log(`  - ${file}`)
  console.log('')

  const client = await connect(config)

  try {
    await client.query('begin')
    await resetPublicSchema(client)

    const applied = []
    await applyBootstrap(client, {
      stripTransactions: true,
      onFile: (path) => {
        applied.push(path)
        console.log(`→ ${path}`)
      },
    })

    const results = await verifyBootstrapObjects(client)
    const failed = results.filter((r) => !r.ok)

    for (const result of results) {
      console.log(`${result.ok ? '✅' : '❌'} ${result.name}`)
    }

    await client.query('rollback')
    console.log('\nROLLBACK — Dev-Datenbank unverändert.')

    if (failed.length > 0) {
      console.error(`\nFehler: ${failed.length}/${results.length} Checks fehlgeschlagen.`)
      process.exit(1)
    }

    console.log(`\nErgebnis: Chronologischer Neuaufbau OK (${results.length}/${results.length} Checks).`)
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
