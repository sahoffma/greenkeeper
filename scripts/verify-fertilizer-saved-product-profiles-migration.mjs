/**
 * GA-014 Phase 5 — Static schema validation for saved product profile migration.
 *
 *   node scripts/verify-fertilizer-saved-product-profiles-migration.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = join(
  __dirname,
  '../supabase/migrations/20250804_fertilizer_saved_product_profiles.sql',
)

const sql = readFileSync(migrationPath, 'utf8')
const results = []

function log(section, ok, detail) {
  results.push({ section, ok, detail })
  console.log(`${ok ? '✅' : '❌'} [${section}] ${detail}`)
}

function includesAll(section, requiredSnippets) {
  const missing = requiredSnippets.filter((snippet) => !sql.includes(snippet))
  log(section, missing.length === 0, missing.length === 0 ? 'present' : `missing: ${missing.join(', ')}`)
}

includesAll('M-1 profile_status saved', ["profile_status in ('draft', 'verified', 'saved')"])
includesAll('M-2 enrichment source', ["source in ('packaging_photo', 'enrichment')"])
includesAll('M-3 composition columns', [
  'composition_fingerprint_version',
  'composition_fingerprint',
  'product_family_key',
  'nutrient_matrix',
  'session_access_hash',
  'save_idempotency_key',
])
includesAll('M-4 unique version indexes', [
  'product_profiles_saved_auth_version_idx',
  'product_profiles_saved_session_version_idx',
])
includesAll('M-5 unique idempotency indexes', [
  'product_profiles_saved_auth_idempotency_idx',
  'product_profiles_saved_session_idempotency_idx',
])
includesAll('M-6 immutability trigger', [
  'prevent_saved_product_profile_mutation',
  'SAVED_PRODUCT_PROFILE_IMMUTABLE',
])

const failed = results.filter((entry) => !entry.ok)
if (failed.length > 0) {
  process.exitCode = 1
  console.error(`\n${failed.length} migration verification check(s) failed.`)
} else {
  console.log(`\nAll ${results.length} migration verification checks passed.`)
}
