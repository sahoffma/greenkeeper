/**
 * DL-030 — Static schema validation for atomic fertilizer application migration.
 *
 *   node scripts/verify-fertilizer-application-atomic-migration.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = join(
  __dirname,
  '../supabase/migrations/20250808_fertilizer_application_atomic.sql',
)
const coreMigrationPath = join(
  __dirname,
  '../supabase/migrations/20250805_fertilizer_inventory_core.sql',
)

const sql = readFileSync(migrationPath, 'utf8')
const coreSql = readFileSync(coreMigrationPath, 'utf8')
const results = []

function log(section, ok, detail) {
  results.push({ section, ok, detail })
  console.log(`${ok ? '✅' : '❌'} [${section}] ${detail}`)
}

function includesAll(section, source, requiredSnippets) {
  const missing = requiredSnippets.filter((snippet) => !source.includes(snippet))
  log(
    section,
    missing.length === 0,
    missing.length === 0 ? 'present' : `missing: ${missing.join(', ')}`,
  )
}

function excludesAll(section, source, forbiddenSnippets) {
  const present = forbiddenSnippets.filter((snippet) => source.includes(snippet))
  log(
    section,
    present.length === 0,
    present.length === 0 ? 'absent' : `must not appear: ${present.join(', ')}`,
  )
}

includesAll('FA-1 migration file exists', sql, ['fertilizer_application_receipts'])

includesAll('FA-2 receipt table columns', sql, [
  'user_id uuid not null',
  'idempotency_key text not null',
  'payload_fingerprint text not null',
  'inventory_item_id uuid not null',
  'saved_product_profile_id uuid not null',
  'area_id uuid not null',
  'application_amount numeric(18, 4) not null',
  'application_unit text not null',
  'applied_at timestamptz not null',
  'activity_id uuid null',
  'movement_id uuid null',
  'result_jsonb jsonb null',
  'completed_at timestamptz null',
])

includesAll('FA-3 application RPC exists', sql, [
  'apply_fertilizer_inventory_item_to_area',
])

includesAll('FA-4 journal and movement in same RPC', sql, [
  'insert into public.activities',
  'insert into public.fertilization_details',
  'insert into public.fertilizer_stock_movements',
])

includesAll('FA-5 inventory item locked', sql, [
  'for update',
  'from public.fertilizer_containers fc',
  'where fc.id = p_inventory_item_id',
])

includesAll('FA-6 balance checked inside transaction', sql, [
  'coalesce(sum(fsm.quantity_delta), 0)',
  'FERTILIZER_APPLICATION_INSUFFICIENT_STOCK',
])

excludesAll('FA-7 no stored current quantity', sql, [
  'current_quantity',
  'remaining_amount',
  'add column if not exists balance',
])

excludesAll('FA-8 no unit conversion', sql, [
  '* 1000',
  '/ 1000',
  'convert_unit',
  'kg_to_ml',
  'ml_to_kg',
])

includesAll('FA-9 only kg and ml units', sql, [
  "application_unit in ('kg', 'ml')",
  "p_application_unit not in ('kg', 'ml')",
])

includesAll('FA-10 amount must be positive', sql, [
  'application_amount > 0',
  'p_application_amount <= 0',
])

includesAll('FA-11 max four decimal places', sql, [
  'round(p_application_amount, 4)',
  'FERTILIZER_APPLICATION_AMOUNT_PRECISION_INVALID',
])

excludesAll('FA-12 no session_replication_role', sql, ['session_replication_role'])

excludesAll('FA-13 no trigger disable', sql, [
  'disable trigger',
  'ALTER TABLE ... DISABLE',
])

excludesAll('FA-14 no superuser assumption', sql, ['superuser', 'rolsuper'])

includesAll('FA-15 secure search_path on RPC', sql, [
  'security definer',
  'set search_path = public',
])

includesAll('FA-16 PUBLIC revoked on RPC', sql, [
  'revoke all on function public.apply_fertilizer_inventory_item_to_area',
])

includesAll('FA-17 authenticated grant', sql, [
  'grant execute on function public.apply_fertilizer_inventory_item_to_area',
  'to authenticated',
])

includesAll('FA-18 idempotency receipt and fingerprint', sql, [
  'fertilizer_application_receipts_user_idempotency_idx',
  '_inventory_creation_compute_fingerprint',
  'FERTILIZER_APPLICATION_IDEMPOTENCY_CONFLICT',
])

includesAll('FA-19 journal movement linkage', sql, [
  'activity_id',
  "'journal'::public.fertilizer_movement_origin",
  "'fertilization'::public.fertilizer_movement_type",
])

includesAll('FA-20 advisory lock for idempotency', sql, [
  'pg_advisory_xact_lock',
  '_fertilizer_application_advisory_lock_key',
])

includesAll('FA-21 historical area snapshot', sql, ['area_name_snapshot'])

includesAll('FA-22 inventory-coupled immutability triggers', sql, [
  'prevent_inventory_coupled_activity_mutation',
  'prevent_inventory_coupled_fertilization_details_mutation',
  'FERTILIZER_APPLICATION_ACTIVITY_IMMUTABLE',
])

excludesAll('FA-23 no automatic data migration', sql, [
  'update public.fertilizer_stock_movements set',
  'insert into public.activities select',
])

excludesAll('FA-24 no FIFO or multi-item distribution', sql, [
  'fifo',
  'lifo',
  'for each container',
  'multiple inventory',
])

log(
  'FA-25 published core migration unchanged on disk',
  coreSql.includes('append_fertilizer_inventory_core_movement'),
  coreSql.includes('append_fertilizer_inventory_core_movement')
    ? '20250805 still contains append RPC only'
    : '20250805 missing expected content',
)

function extractApplicationRpcBody(source) {
  const fnStart = source.indexOf(
    'create or replace function public.apply_fertilizer_inventory_item_to_area',
  )
  if (fnStart < 0) {
    return ''
  }

  const bodyStart = source.indexOf('as $$', fnStart)
  const bodyEnd = source.indexOf('$$;', bodyStart + 4)
  if (bodyStart < 0 || bodyEnd < 0) {
    return ''
  }

  return source.slice(bodyStart, bodyEnd)
}

function positionOf(body, needle) {
  const index = body.indexOf(needle)
  return index >= 0 ? index : Number.POSITIVE_INFINITY
}

const rpcBody = extractApplicationRpcBody(sql)
const advisoryLockPos = positionOf(rpcBody, 'pg_advisory_xact_lock')
const receiptSelectPos = positionOf(rpcBody, 'from public.fertilizer_application_receipts far')
const containerLockPos = positionOf(rpcBody, 'from public.fertilizer_containers fc')
const profileLoadPos = positionOf(rpcBody, 'from public.product_profiles pp')
const areaLoadPos = positionOf(rpcBody, 'from public.areas a')
const areaNotFoundPos = positionOf(
  rpcBody,
  'FERTILIZER_APPLICATION_APPLICATION_TARGET_NOT_FOUND',
)
const profileMismatchPos = positionOf(rpcBody, 'FERTILIZER_APPLICATION_PRODUCT_PROFILE_MISMATCH')
const receiptInsertPos = positionOf(rpcBody, 'insert into public.fertilizer_application_receipts')
const orderMarkerPos = positionOf(rpcBody, 'dl-030-rpc-order: receipt-after-reference-validation')
const receiptGuardPos = positionOf(rpcBody, 'if not v_receipt_exists then')

log(
  'FA-26 RPC order marker present',
  orderMarkerPos < Number.POSITIVE_INFINITY,
  orderMarkerPos < Number.POSITIVE_INFINITY
    ? 'receipt-after-reference-validation marker found'
    : 'missing dl-030-rpc-order marker',
)

log(
  'FA-27 advisory lock before idempotency path',
  advisoryLockPos < receiptSelectPos && advisoryLockPos < receiptInsertPos,
  advisoryLockPos < receiptSelectPos && advisoryLockPos < receiptInsertPos
    ? 'advisory lock precedes receipt read and insert'
    : 'advisory lock must precede receipt handling',
)

log(
  'FA-28 existing receipt checked before new insert',
  receiptSelectPos < receiptInsertPos,
  receiptSelectPos < receiptInsertPos
    ? 'receipt select precedes receipt insert'
    : 'receipt must be read before insert',
)

log(
  'FA-29 inventory item validation before receipt insert',
  containerLockPos < receiptInsertPos,
  containerLockPos < receiptInsertPos
    ? 'container lock precedes receipt insert'
    : 'inventory item must be validated before receipt insert',
)

log(
  'FA-30 product profile validation before receipt insert',
  profileLoadPos < receiptInsertPos && profileMismatchPos < receiptInsertPos,
  profileLoadPos < receiptInsertPos && profileMismatchPos < receiptInsertPos
    ? 'profile load and mismatch precede receipt insert'
    : 'product profile must be validated before receipt insert',
)

log(
  'FA-31 area validation before receipt insert',
  areaLoadPos < receiptInsertPos && areaNotFoundPos < receiptInsertPos,
  areaLoadPos < receiptInsertPos && areaNotFoundPos < receiptInsertPos
    ? 'area load and not-found precede receipt insert'
    : 'area must be validated before receipt insert',
)

log(
  'FA-32 receipt insert only after reference validation',
  receiptGuardPos < receiptInsertPos && orderMarkerPos < receiptInsertPos,
  receiptGuardPos < receiptInsertPos && orderMarkerPos < receiptInsertPos
    ? 'receipt insert guarded and ordered after validation'
    : 'receipt insert must follow reference validation guard',
)

log(
  'FA-33 invalid area/profile cannot hit receipt FK first',
  areaNotFoundPos < receiptInsertPos && profileMismatchPos < receiptInsertPos,
  areaNotFoundPos < receiptInsertPos && profileMismatchPos < receiptInsertPos
    ? 'domain errors precede receipt insert'
    : 'domain errors must precede receipt insert to avoid FK failures',
)

const failed = results.filter((entry) => !entry.ok)
if (failed.length > 0) {
  process.exitCode = 1
  console.error(`\n${failed.length} migration verification check(s) failed.`)
} else {
  console.log(`\nAll ${results.length} migration verification checks passed.`)
}
