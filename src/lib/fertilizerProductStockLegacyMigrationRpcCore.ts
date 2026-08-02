export const ANALYZE_FERTILIZER_PRODUCT_STOCK_LEGACY_MIGRATION_RPC =
  'analyze_fertilizer_product_stock_legacy_migration' as const

export const MIGRATE_FERTILIZER_PRODUCT_STOCK_LEGACY_GROUP_RPC =
  'migrate_fertilizer_product_stock_legacy_group' as const

export const PRODUCT_STOCK_LEGACY_MIGRATION_MOVEMENT_IDEMPOTENCY_KEY_PREFIX =
  'product-stock-legacy-migration:' as const

export const FERTILIZER_PRODUCT_STOCK_LEGACY_MIGRATION_CLASSIFICATIONS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
] as const

export type FertilizerProductStockLegacyMigrationClassification =
  (typeof FERTILIZER_PRODUCT_STOCK_LEGACY_MIGRATION_CLASSIFICATIONS)[number]

export const FERTILIZER_PRODUCT_STOCK_LEGACY_MIGRATION_RPC_ERROR_CODES = [
  'PRODUCT_STOCK_LEGACY_MIGRATION_ACCESS_DENIED',
  'PRODUCT_STOCK_LEGACY_MIGRATION_IDEMPOTENCY_INVALID',
  'PRODUCT_STOCK_LEGACY_MIGRATION_IDEMPOTENCY_CONFLICT',
  'PRODUCT_STOCK_LEGACY_MIGRATION_FINGERPRINT_INVALID',
  'PRODUCT_STOCK_LEGACY_MIGRATION_FINGERPRINT_MISMATCH',
  'PRODUCT_STOCK_LEGACY_MIGRATION_CUTOFF_INVALID',
  'PRODUCT_STOCK_LEGACY_MIGRATION_GROUP_BLOCKED',
  'PRODUCT_STOCK_LEGACY_MIGRATION_LEGACY_IDS_MISMATCH',
  'PRODUCT_STOCK_LEGACY_MIGRATION_GROUP_ALREADY_COMPLETED',
  'PRODUCT_STOCK_LEGACY_MIGRATION_FAILED',
  'PRODUCT_STOCK_LEGACY_MIGRATION_BALANCE_INVALID',
  'INVENTORY_ITEM_SUPERSEDED',
  'INVENTORY_MOVEMENT_TYPE_NOT_ALLOWED',
] as const

export type FertilizerProductStockLegacyMigrationRpcErrorCode =
  (typeof FERTILIZER_PRODUCT_STOCK_LEGACY_MIGRATION_RPC_ERROR_CODES)[number]

export interface LegacyMigrationGroupAnalysis {
  migrationGroupKey: string
  userId: string
  savedProductProfileId: string
  baseUnit: 'kg' | 'ml'
  legacyContainerIds: string[]
  canonicalContainerId: string | null
  legacyItemCount: number
  effectiveMovementCount: number
  movementsWithoutMovementAt: number
  effectiveBalance: number
  movementChecksum: string | null
  classification: FertilizerProductStockLegacyMigrationClassification
  autoMigratable: boolean
  blockingReasons: string[]
  expectedTakeoverMovement: boolean
  expectedSupersedeCount: number
  recommendedTreatment: string
}

export interface LegacyMigrationDryRunSummary {
  legacyItemCount: number
  canonicalItemCount: number
  migrationGroupCount: number
  autoMigratableGroups: number
  blockedGroups: number
  itemsWithoutSavedProfile: number
  unitConflicts: number
  formUnitConflicts: number
  negativeBalances: number
  zeroBalanceGroups: number
  groupsWithExistingCanonical: number
  movementsWithoutMovementAt: number
  expectedTakeoverMovements: number
  expectedSupersededItems: number
}

export interface LegacyMigrationDryRunResult {
  migrationCutoffAt: string
  summary: LegacyMigrationDryRunSummary
  groups: LegacyMigrationGroupAnalysis[]
}

export interface MigrateLegacyGroupRpcParams {
  p_saved_product_profile_id: string
  p_base_unit: 'kg' | 'ml'
  p_idempotency_key: string
  p_payload_fingerprint: string
  p_migration_cutoff_at: string
  p_legacy_container_ids?: string[] | null
}

export interface MigrateLegacyGroupRpcResult {
  receipt_id: string
  idempotency_key: string
  migration_group_key: string
  classification: FertilizerProductStockLegacyMigrationClassification
  canonical_container_id: string
  legacy_container_ids: string[]
  takeover_movement_id: string | null
  effective_balance: number
  movement_checksum: string
  migration_cutoff_at: string
  idempotency_replay: boolean
}

export function buildLegacyMigrationMovementIdempotencyKey(receiptId: string): string {
  return `${PRODUCT_STOCK_LEGACY_MIGRATION_MOVEMENT_IDEMPOTENCY_KEY_PREFIX}${receiptId}`
}

export function mapLegacyMigrationDryRunResult(raw: unknown): LegacyMigrationDryRunResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid legacy migration dry-run result.')
  }

  const payload = raw as Record<string, unknown>
  const summary = payload.summary as Record<string, unknown>
  const groups = Array.isArray(payload.groups) ? payload.groups : []

  return {
    migrationCutoffAt: String(payload.migrationCutoffAt ?? ''),
    summary: {
      legacyItemCount: Number(summary?.legacyItemCount ?? 0),
      canonicalItemCount: Number(summary?.canonicalItemCount ?? 0),
      migrationGroupCount: Number(summary?.migrationGroupCount ?? 0),
      autoMigratableGroups: Number(summary?.autoMigratableGroups ?? 0),
      blockedGroups: Number(summary?.blockedGroups ?? 0),
      itemsWithoutSavedProfile: Number(summary?.itemsWithoutSavedProfile ?? 0),
      unitConflicts: Number(summary?.unitConflicts ?? 0),
      formUnitConflicts: Number(summary?.formUnitConflicts ?? 0),
      negativeBalances: Number(summary?.negativeBalances ?? 0),
      zeroBalanceGroups: Number(summary?.zeroBalanceGroups ?? 0),
      groupsWithExistingCanonical: Number(summary?.groupsWithExistingCanonical ?? 0),
      movementsWithoutMovementAt: Number(summary?.movementsWithoutMovementAt ?? 0),
      expectedTakeoverMovements: Number(summary?.expectedTakeoverMovements ?? 0),
      expectedSupersededItems: Number(summary?.expectedSupersededItems ?? 0),
    },
    groups: groups.map(mapLegacyMigrationGroupAnalysis),
  }
}

export function mapLegacyMigrationGroupAnalysis(raw: unknown): LegacyMigrationGroupAnalysis {
  const group = raw as Record<string, unknown>
  const legacyIds = Array.isArray(group.legacyContainerIds)
    ? group.legacyContainerIds.map(String)
    : []

  return {
    migrationGroupKey: String(group.migrationGroupKey ?? ''),
    userId: String(group.userId ?? ''),
    savedProductProfileId: String(group.savedProductProfileId ?? ''),
    baseUnit: group.baseUnit === 'ml' ? 'ml' : 'kg',
    legacyContainerIds: legacyIds,
    canonicalContainerId: group.canonicalContainerId
      ? String(group.canonicalContainerId)
      : null,
    legacyItemCount: Number(group.legacyItemCount ?? 0),
    effectiveMovementCount: Number(group.effectiveMovementCount ?? 0),
    movementsWithoutMovementAt: Number(group.movementsWithoutMovementAt ?? 0),
    effectiveBalance: Number(group.effectiveBalance ?? 0),
    movementChecksum: group.movementChecksum ? String(group.movementChecksum) : null,
    classification: String(group.classification ?? 'H') as FertilizerProductStockLegacyMigrationClassification,
    autoMigratable: Boolean(group.autoMigratable),
    blockingReasons: Array.isArray(group.blockingReasons)
      ? group.blockingReasons.map(String)
      : [],
    expectedTakeoverMovement: Boolean(group.expectedTakeoverMovement),
    expectedSupersedeCount: Number(group.expectedSupersedeCount ?? 0),
    recommendedTreatment: String(group.recommendedTreatment ?? ''),
  }
}

export function mapMigrateLegacyGroupRpcResult(raw: unknown): MigrateLegacyGroupRpcResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid legacy migration RPC result.')
  }

  const payload = raw as Record<string, unknown>
  const legacyIds = Array.isArray(payload.legacy_container_ids)
    ? payload.legacy_container_ids.map(String)
    : []

  return {
    receipt_id: String(payload.receipt_id ?? ''),
    idempotency_key: String(payload.idempotency_key ?? ''),
    migration_group_key: String(payload.migration_group_key ?? ''),
    classification: String(payload.classification ?? 'H') as FertilizerProductStockLegacyMigrationClassification,
    canonical_container_id: String(payload.canonical_container_id ?? ''),
    legacy_container_ids: legacyIds,
    takeover_movement_id: payload.takeover_movement_id
      ? String(payload.takeover_movement_id)
      : null,
    effective_balance: Number(payload.effective_balance ?? 0),
    movement_checksum: String(payload.movement_checksum ?? ''),
    migration_cutoff_at: String(payload.migration_cutoff_at ?? ''),
    idempotency_replay: Boolean(payload.idempotency_replay),
  }
}

export function extractLegacyMigrationRpcErrorCode(message: string): string | null {
  for (const code of FERTILIZER_PRODUCT_STOCK_LEGACY_MIGRATION_RPC_ERROR_CODES) {
    if (message.includes(code)) {
      return code
    }
  }

  return null
}
