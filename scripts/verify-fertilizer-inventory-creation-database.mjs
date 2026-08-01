/**
 * GA-014 Phase 7B — Real PostgreSQL integration checks for atomic inventory creation.
 *
 * Runs the Vitest database integration suite when the dev Supabase write gate is open.
 *
 *   ALLOW_SUPABASE_WRITE_TESTS=true node scripts/verify-fertilizer-inventory-creation-database.mjs
 */
import { spawnSync } from 'node:child_process'
import { loadLocalEnv, describeSupabaseTarget } from './supabaseEnvGuard.mjs'

if (process.env.ALLOW_SUPABASE_WRITE_TESTS !== 'true') {
  console.error('ABBRUCH: ALLOW_SUPABASE_WRITE_TESTS=true fehlt in der Prozessumgebung.')
  process.exit(1)
}

const config = loadLocalEnv()
const target = describeSupabaseTarget(config)

if (target.isProduction) {
  console.error('ABBRUCH: Production-Ziel erkannt — Datenbankintegrationstests sind gesperrt.')
  process.exit(1)
}

console.log(`Supabase-Ziel: ${target.projectRef} (${config.supabaseUrl})`)
console.log('→ vitest run src/lib/fertilizerInventoryCreationDatabase.test.ts')

const result = spawnSync(
  'npx',
  ['vitest', 'run', 'src/lib/fertilizerInventoryCreationDatabase.test.ts'],
  {
    stdio: 'inherit',
    env: process.env,
  },
)

process.exit(result.status ?? 1)
