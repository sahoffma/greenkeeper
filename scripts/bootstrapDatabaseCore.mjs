/**
 * Gemeinsame Logik für Datenbank-Neuaufbau: schema.sql + Migrationen chronologisch.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export const SCHEMA_PATH = resolve('supabase/schema.sql')
export const MIGRATIONS_DIR = resolve('supabase/migrations')

/** Entfernt nur äußere begin/commit-Wrapper einer Migrationsdatei (nicht PL/pgSQL-intern). */
export function stripTransactionWrappers(sql) {
  let result = sql.trim()
  result = result.replace(/^\s*begin\s*;\s*\r?\n/i, '')
  result = result.replace(/\r?\n\s*commit\s*;\s*$/i, '')
  return result
}

export function listMigrationsChronological(migrationDir = MIGRATIONS_DIR) {
  return readdirSync(migrationDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
}

export function readSqlFile(path, { stripTransactions = false } = {}) {
  const sql = readFileSync(path, 'utf8')
  return stripTransactions ? stripTransactionWrappers(sql) : sql
}

export async function applyBootstrap(client, options = {}) {
  const {
    schemaPath = SCHEMA_PATH,
    migrationDir = MIGRATIONS_DIR,
    stripTransactions = false,
    onFile,
  } = options

  const run = async (label, sql) => {
    if (onFile) onFile(label)
    await client.query(sql)
  }

  await run(schemaPath, readSqlFile(schemaPath, { stripTransactions }))

  for (const file of listMigrationsChronological(migrationDir)) {
    const path = resolve(migrationDir, file)
    await run(path, readSqlFile(path, { stripTransactions }))
  }
}

export async function verifyBootstrapObjects(client) {
  const checks = [
    {
      name: 'profiles.role → app_user_role',
      sql: `select udt_name from information_schema.columns
            where table_schema='public' and table_name='profiles' and column_name='role'`,
      expect: (rows) => rows[0]?.udt_name === 'app_user_role',
    },
    {
      name: 'products.verification_status → product_verification_status',
      sql: `select udt_name from information_schema.columns
            where table_schema='public' and table_name='products' and column_name='verification_status'`,
      expect: (rows) => rows[0]?.udt_name === 'product_verification_status',
    },
    {
      name: 'enum legacy_imported vorhanden',
      sql: `select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid
            where t.typname='product_verification_status' and e.enumlabel='legacy_imported'`,
      expect: (rows) => rows.length > 0,
    },
    {
      name: 'user_app_role()',
      sql: `select 1 from pg_proc where proname='user_app_role'`,
      expect: (rows) => rows.length > 0,
    },
    {
      name: 'product_source_snapshots',
      sql: `select 1 from information_schema.tables where table_name='product_source_snapshots'`,
      expect: (rows) => rows.length > 0,
    },
    {
      name: 'product_review_queue View',
      sql: `select 1 from information_schema.views where table_name='product_review_queue'`,
      expect: (rows) => rows.length > 0,
    },
    {
      name: 'complete_onboarding RPC',
      sql: `select 1 from pg_proc where proname='complete_onboarding'`,
      expect: (rows) => rows.length > 0,
    },
    {
      name: 'care_groups',
      sql: `select 1 from information_schema.tables where table_name='care_groups'`,
      expect: (rows) => rows.length > 0,
    },
  ]

  const results = []
  for (const check of checks) {
    const { rows } = await client.query(check.sql)
    const ok = check.expect(rows)
    results.push({ name: check.name, ok })
  }

  return results
}
