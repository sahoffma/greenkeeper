import type { ProductProfileForm } from '../types/productProfile'
import {
  FERTILIZER_INVENTORY_MOVEMENT_TYPES,
  isFertilizerInventoryBaseUnit,
  resolveInventoryBaseUnitFromProductForm,
  type FertilizerInventoryAccessKind,
  type FertilizerInventoryBaseUnit,
  type FertilizerInventoryMovement,
  type FertilizerInventoryMovementOrigin,
  type FertilizerInventoryMovementType,
} from '../types/fertilizerInventoryCore'
import type { FertilizerInventoryCreationReason } from './fertilizerInventoryCreationCore'
import { computeInventoryItemBalance } from './fertilizerInventoryBalanceCore'
import {
  assertInventoryQuantityPrecision,
  normalizeInventoryQuantity,
} from './fertilizerInventoryQuantityCore'

// ---------------------------------------------------------------------------
// Status and reason codes
// ---------------------------------------------------------------------------

export const FERTILIZER_INVENTORY_LEGACY_MIGRATION_STATUSES = [
  'already_migrated',
  'ready',
  'needs_profile_uplift',
  'needs_manual_review',
  'blocked_invalid_data',
] as const

export type FertilizerInventoryLegacyMigrationStatus =
  (typeof FERTILIZER_INVENTORY_LEGACY_MIGRATION_STATUSES)[number]

export const FERTILIZER_INVENTORY_LEGACY_MIGRATION_REASON_CODES = [
  'CORE_BINDING_ALREADY_COMPLETE',
  'SAVED_PROFILE_AVAILABLE',
  'PROFILE_UPLIFT_REQUIRED',
  'UNKNOWN_PRODUCT_FORM',
  'UNSUPPORTED_PACKAGE_UNIT',
  'MISSING_PACKAGE_SIZE',
  'AMBIGUOUS_PRODUCT_BINDING',
  'AGGREGATED_LEGACY_CONTAINER',
  'CONFLICTING_MOVEMENT_UNITS',
  'INVALID_PACKAGE_VALUE',
  'INVALID_ACCESS_BINDING',
  'INVALID_MOVEMENT',
  'NEGATIVE_BALANCE',
  'MULTIPLE_SAVED_PROFILES',
  'LEGACY_AND_CORE_BINDING_CONFLICT',
  'INVALID_CONTAINER_ID',
  'AMBIGUOUS_CREATION_REASON',
  'MIGRATION_CREATION_REASON_FALLBACK',
  'UNSUPPORTED_PRODUCT_FORM',
  'INVALID_MOVEMENT_QUANTITY',
  'EXCESSIVE_PACKAGE_PRECISION',
] as const

export type FertilizerInventoryLegacyMigrationReasonCode =
  (typeof FERTILIZER_INVENTORY_LEGACY_MIGRATION_REASON_CODES)[number]

export const LEGACY_MIGRATION_IDEMPOTENCY_KEY_PREFIX = 'migration:fertilizer-container:' as const
export const LEGACY_MIGRATION_SOURCE_EVENT_PREFIX = 'legacy:container:' as const
export const LEGACY_MIGRATION_MOVEMENT_SOURCE_PREFIX = 'legacy:movement:' as const
export const LEGACY_MIGRATION_MOVEMENT_IDEMPOTENCY_PREFIX = 'migration:movement:' as const

const CONTAINER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SESSION_HASH_PATTERN = /^[0-9a-f]{64}$/i

const INBOUND_CREATION_MOVEMENT_TYPES = [
  'purchase',
  'initial_stock',
  'gift_received',
] as const satisfies readonly FertilizerInventoryCreationReason[]

const PACKAGE_COUNT_NOTE_PATTERN = /\(\s*\d+\s+Gebinde\s*\)/i

// ---------------------------------------------------------------------------
// Input model
// ---------------------------------------------------------------------------

export interface LegacyMigrationCaptureMetadata {
  packageCount?: number | null
  distinctCaptureIdempotencyKeys?: readonly string[]
}

export interface LegacyMigrationProductProfileInput {
  id: string
  profileStatus: 'draft' | 'verified' | 'saved'
  source: 'packaging_photo' | 'enrichment'
  productForm: ProductProfileForm | 'unknown' | null
}

export interface LegacyMigrationCatalogProductInput {
  productId: string
  productForm?: ProductProfileForm | 'unknown' | null
  linkedSavedProfileId?: string | null
  linkedVerifiedProfileId?: string | null
}

export interface LegacyMigrationCandidateInput {
  candidateId: string
  productForm?: ProductProfileForm | 'unknown' | null
  linkedProductProfileId?: string | null
}

export interface LegacyMigrationContainerInput {
  containerId: string
  userId: string | null
  createdAt: string
  archivedAt?: string | null
  label?: string | null
  productId?: string | null
  recognitionCandidateId?: string | null
  savedProductProfileId?: string | null
  accessKind?: FertilizerInventoryAccessKind | null
  sessionAccessHash?: string | null
  baseUnit?: FertilizerInventoryBaseUnit | null
  packageSizeValue?: number | null
  packageSizeUnit?: string | null
  productForm?: ProductProfileForm | 'unknown' | null
}

export interface LegacyMigrationMovementInput {
  movementId: string
  movementType: FertilizerInventoryMovementType
  quantityDelta: number
  unit: string
  movementAt?: string | null
  movementDate?: string | null
  createdAt: string
  captureIdempotencyKey?: string | null
  inventoryIdempotencyKey?: string | null
  accessKind?: FertilizerInventoryAccessKind | null
  movementOrigin?: FertilizerInventoryMovementOrigin | null
  sourceEventRef?: string | null
  note?: string | null
}

export interface LegacyContainerMigrationInput {
  container: LegacyMigrationContainerInput
  movements: readonly LegacyMigrationMovementInput[]
  savedProfiles?: readonly LegacyMigrationProductProfileInput[]
  catalogProduct?: LegacyMigrationCatalogProductInput | null
  candidate?: LegacyMigrationCandidateInput | null
  captureMetadata?: LegacyMigrationCaptureMetadata | null
}

// ---------------------------------------------------------------------------
// Output model
// ---------------------------------------------------------------------------

export interface LegacyMigrationProfileUpliftInput {
  sourceKind: 'catalog_product' | 'recognition_candidate' | 'draft_profile' | 'verified_profile'
  sourceId: string
  productForm: ProductProfileForm | null
  linkedProfileId: string | null
}

export interface LegacyMigrationMovementUpgrade {
  movementId: string
  quantityDelta: number
  unit: FertilizerInventoryBaseUnit
  movementType: FertilizerInventoryMovementType
  movementAt: string
  movementOrigin: FertilizerInventoryMovementOrigin
  inventoryIdempotencyKey: string
  sourceEventRef: string
  note: string | null
}

export interface LegacyContainerMigrationUpgradePlan {
  containerId: string
  savedProductProfileId: string
  accessKind: FertilizerInventoryAccessKind
  userId: string | null
  sessionAccessHash: string | null
  productId: null
  recognitionCandidateId: null
  packageSizeValue: number
  packageSizeUnit: FertilizerInventoryBaseUnit
  productForm: ProductProfileForm
  baseUnit: FertilizerInventoryBaseUnit
  label: string | null
  createdAt: string
  creationReason: FertilizerInventoryCreationReason
  creationReasonUsedMigrationFallback: boolean
  sourceEventRef: string
  migrationIdempotencyKey: string
  canonicalFingerprintInput: string
  movementUpgrades: readonly LegacyMigrationMovementUpgrade[]
}

export interface LegacyContainerMigrationResult {
  status: FertilizerInventoryLegacyMigrationStatus
  containerId: string
  reasons: readonly FertilizerInventoryLegacyMigrationReasonCode[]
  warnings: readonly FertilizerInventoryLegacyMigrationReasonCode[]
  blockingIssues: readonly FertilizerInventoryLegacyMigrationReasonCode[]
  requiresProfileUplift: boolean
  requiresManualReview: boolean
  isAlreadyMigrated: boolean
  profileUpliftInput: LegacyMigrationProfileUpliftInput | null
  upgradePlan: LegacyContainerMigrationUpgradePlan | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeUnitToken(unit: string): string {
  return unit.trim().toLowerCase()
}

function isValidContainerId(containerId: string): boolean {
  return CONTAINER_ID_PATTERN.test(containerId)
}

function isSavedEnrichmentProfile(profile: LegacyMigrationProductProfileInput): boolean {
  return profile.profileStatus === 'saved' && profile.source === 'enrichment'
}

function resolveCoreProductForm(
  container: LegacyMigrationContainerInput,
  catalogProduct: LegacyMigrationCatalogProductInput | null | undefined,
  candidate: LegacyMigrationCandidateInput | null | undefined,
  savedProfile: LegacyMigrationProductProfileInput | null | undefined,
): ProductProfileForm | 'unknown' | null {
  if (savedProfile?.productForm && savedProfile.productForm !== 'unknown') {
    return savedProfile.productForm
  }

  if (container.productForm && container.productForm !== 'unknown') {
    return container.productForm
  }

  if (catalogProduct?.productForm && catalogProduct.productForm !== 'unknown') {
    return catalogProduct.productForm
  }

  if (candidate?.productForm && candidate.productForm !== 'unknown') {
    return candidate.productForm
  }

  if (
    container.productForm === 'unknown' ||
    catalogProduct?.productForm === 'unknown' ||
    candidate?.productForm === 'unknown'
  ) {
    return 'unknown'
  }

  return null
}

function classifyUnit(unit: string): 'core' | 'unsupported' | 'invalid' {
  const normalized = normalizeUnitToken(unit)

  if (!normalized) {
    return 'invalid'
  }

  if (isFertilizerInventoryBaseUnit(normalized)) {
    return 'core'
  }

  if (normalized === 'g' || normalized === 'l') {
    return 'unsupported'
  }

  return 'invalid'
}

function validatePackageValue(value: number | null | undefined): {
  ok: boolean
  normalized?: number
  issue?: FertilizerInventoryLegacyMigrationReasonCode
} {
  if (value == null) {
    return { ok: false, issue: 'MISSING_PACKAGE_SIZE' }
  }

  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, issue: 'INVALID_PACKAGE_VALUE' }
  }

  try {
    return { ok: true, normalized: normalizeInventoryQuantity(value, 'packageSizeValue') }
  } catch {
    return { ok: false, issue: 'EXCESSIVE_PACKAGE_PRECISION' }
  }
}

function validatePackagePair(
  value: number | null | undefined,
  unit: string | null | undefined,
): {
  ok: boolean
  packageSizeValue?: number
  packageSizeUnit?: FertilizerInventoryBaseUnit
  issues: FertilizerInventoryLegacyMigrationReasonCode[]
} {
  const hasValue = value != null
  const hasUnit = unit != null && unit.trim() !== ''

  if (hasValue !== hasUnit) {
    return {
      ok: false,
      issues: hasValue ? ['UNSUPPORTED_PACKAGE_UNIT'] : ['MISSING_PACKAGE_SIZE'],
    }
  }

  if (!hasValue || !hasUnit) {
    return { ok: false, issues: ['MISSING_PACKAGE_SIZE'] }
  }

  const unitClass = classifyUnit(unit!)
  if (unitClass === 'unsupported') {
    return { ok: false, issues: ['UNSUPPORTED_PACKAGE_UNIT'] }
  }

  if (unitClass === 'invalid') {
    return { ok: false, issues: ['UNSUPPORTED_PACKAGE_UNIT'] }
  }

  const valueResult = validatePackageValue(value)
  if (!valueResult.ok) {
    return { ok: false, issues: [valueResult.issue ?? 'INVALID_PACKAGE_VALUE'] }
  }

  return {
    ok: true,
    packageSizeValue: valueResult.normalized,
    packageSizeUnit: normalizeUnitToken(unit!) as FertilizerInventoryBaseUnit,
    issues: [],
  }
}

function resolveMovementTimestamp(movement: LegacyMigrationMovementInput): string | null {
  if (movement.movementAt && movement.movementAt.trim()) {
    return movement.movementAt
  }

  if (movement.movementDate && movement.movementDate.trim()) {
    return `${movement.movementDate.trim()}T12:00:00.000Z`
  }

  if (movement.createdAt && movement.createdAt.trim()) {
    return movement.createdAt
  }

  return null
}

function resolveTargetAccess(container: LegacyMigrationContainerInput): {
  ok: boolean
  accessKind?: FertilizerInventoryAccessKind
  userId?: string | null
  sessionAccessHash?: string | null
  issue?: FertilizerInventoryLegacyMigrationReasonCode
} {
  if (container.accessKind === 'authenticated_user') {
    if (!container.userId) {
      return { ok: false, issue: 'INVALID_ACCESS_BINDING' }
    }

    if (container.sessionAccessHash) {
      return { ok: false, issue: 'INVALID_ACCESS_BINDING' }
    }

    return {
      ok: true,
      accessKind: 'authenticated_user',
      userId: container.userId,
      sessionAccessHash: null,
    }
  }

  if (container.accessKind === 'session') {
    if (container.userId) {
      return { ok: false, issue: 'INVALID_ACCESS_BINDING' }
    }

    if (!container.sessionAccessHash || !SESSION_HASH_PATTERN.test(container.sessionAccessHash)) {
      return { ok: false, issue: 'INVALID_ACCESS_BINDING' }
    }

    return {
      ok: true,
      accessKind: 'session',
      userId: null,
      sessionAccessHash: container.sessionAccessHash,
    }
  }

  if (container.userId) {
    return {
      ok: true,
      accessKind: 'authenticated_user',
      userId: container.userId,
      sessionAccessHash: null,
    }
  }

  return { ok: false, issue: 'INVALID_ACCESS_BINDING' }
}

function isCoreMovement(movement: LegacyMigrationMovementInput): boolean {
  return Boolean(
    movement.accessKind &&
      movement.movementAt &&
      !movement.captureIdempotencyKey &&
      classifyUnit(movement.unit) === 'core',
  )
}

function isAlreadyMigratedContainer(
  container: LegacyMigrationContainerInput,
  movements: readonly LegacyMigrationMovementInput[],
): boolean {
  if (
    !container.savedProductProfileId ||
    !container.accessKind ||
    !container.baseUnit ||
    container.productId != null ||
    container.recognitionCandidateId != null
  ) {
    return false
  }

  const access = resolveTargetAccess(container)
  if (!access.ok) {
    return false
  }

  const packageCheck = validatePackagePair(container.packageSizeValue, container.packageSizeUnit)
  if (!packageCheck.ok) {
    return false
  }

  if (packageCheck.packageSizeUnit !== container.baseUnit) {
    return false
  }

  if (movements.length === 0) {
    return true
  }

  return movements.every(isCoreMovement)
}

function collectSavedEnrichmentProfiles(
  input: LegacyContainerMigrationInput,
): LegacyMigrationProductProfileInput[] {
  const profiles: LegacyMigrationProductProfileInput[] = []

  for (const profile of input.savedProfiles ?? []) {
    if (isSavedEnrichmentProfile(profile)) {
      profiles.push(profile)
    }
  }

  const containerProfileId = input.container.savedProductProfileId
  if (containerProfileId) {
    const matched = (input.savedProfiles ?? []).find((profile) => profile.id === containerProfileId)
    if (matched && isSavedEnrichmentProfile(matched) && !profiles.some((p) => p.id === matched.id)) {
      profiles.push(matched)
    }
  }

  const catalogSavedId = input.catalogProduct?.linkedSavedProfileId
  if (catalogSavedId) {
    const matched = (input.savedProfiles ?? []).find((profile) => profile.id === catalogSavedId)
    if (matched && isSavedEnrichmentProfile(matched) && !profiles.some((p) => p.id === matched.id)) {
      profiles.push(matched)
    }
  }

  return profiles
}

function detectAggregationSuspicion(
  input: LegacyContainerMigrationInput,
  movements: readonly LegacyMigrationMovementInput[],
): boolean {
  const captureKeys = new Set<string>()

  for (const key of input.captureMetadata?.distinctCaptureIdempotencyKeys ?? []) {
    if (key.trim()) {
      captureKeys.add(key.trim())
    }
  }

  for (const movement of movements) {
    if (movement.captureIdempotencyKey?.trim()) {
      captureKeys.add(movement.captureIdempotencyKey.trim())
    }

    if (movement.note && PACKAGE_COUNT_NOTE_PATTERN.test(movement.note)) {
      return true
    }
  }

  if ((input.captureMetadata?.packageCount ?? 0) > 1) {
    return true
  }

  if (input.container.productId && captureKeys.size > 1) {
    return true
  }

  const inboundPurchases = movements.filter(
    (movement) => movement.movementType === 'purchase' && movement.quantityDelta > 0,
  )

  if (input.container.productId && inboundPurchases.length > 1) {
    const purchaseCaptureKeys = new Set(
      inboundPurchases
        .map((movement) => movement.captureIdempotencyKey?.trim())
        .filter((key): key is string => Boolean(key)),
    )

    if (purchaseCaptureKeys.size > 1) {
      return true
    }
  }

  return false
}

function hasLegacyCoreBindingConflict(container: LegacyMigrationContainerInput): boolean {
  const hasLegacyBinding =
    container.productId != null || container.recognitionCandidateId != null
  const hasCoreBinding =
    container.savedProductProfileId != null ||
    container.accessKind != null ||
    container.baseUnit != null

  return hasLegacyBinding && hasCoreBinding
}

function resolveSavedProfileId(
  savedProfiles: LegacyMigrationProductProfileInput[],
): {
  ok: boolean
  profileId?: string
  issues: FertilizerInventoryLegacyMigrationReasonCode[]
} {
  if (savedProfiles.length > 1) {
    return { ok: false, issues: ['MULTIPLE_SAVED_PROFILES'] }
  }

  if (savedProfiles.length === 1) {
    return { ok: true, profileId: savedProfiles[0]!.id, issues: [] }
  }

  return { ok: false, issues: ['PROFILE_UPLIFT_REQUIRED'] }
}

function buildProfileUpliftInput(
  input: LegacyContainerMigrationInput,
  productForm: ProductProfileForm | null,
): LegacyMigrationProfileUpliftInput | null {
  const hasCatalog = Boolean(input.container.productId && input.catalogProduct)
  const hasCandidate = Boolean(input.container.recognitionCandidateId && input.candidate)

  if (hasCatalog && hasCandidate) {
    return null
  }

  if (hasCatalog && input.catalogProduct) {
    return {
      sourceKind: input.catalogProduct.linkedVerifiedProfileId ? 'verified_profile' : 'catalog_product',
      sourceId: input.catalogProduct.productId,
      productForm,
      linkedProfileId:
        input.catalogProduct.linkedVerifiedProfileId ??
        input.catalogProduct.linkedSavedProfileId ??
        null,
    }
  }

  if (hasCandidate && input.candidate) {
    const draftProfile = (input.savedProfiles ?? []).find(
      (profile) =>
        profile.id === input.candidate?.linkedProductProfileId && profile.profileStatus === 'draft',
    )

    return {
      sourceKind: draftProfile ? 'draft_profile' : 'recognition_candidate',
      sourceId: draftProfile?.id ?? input.candidate.candidateId,
      productForm,
      linkedProfileId: input.candidate.linkedProductProfileId ?? null,
    }
  }

  return null
}

function analyzeMovements(
  movements: readonly LegacyMigrationMovementInput[],
  targetAccess: {
    accessKind: FertilizerInventoryAccessKind
    userId: string | null
    sessionAccessHash: string | null
  },
): {
  ok: boolean
  normalizedUnit?: FertilizerInventoryBaseUnit
  movementUpgrades?: LegacyMigrationMovementUpgrade[]
  balance?: number
  issues: FertilizerInventoryLegacyMigrationReasonCode[]
} {
  if (movements.length === 0) {
    return { ok: true, normalizedUnit: undefined, movementUpgrades: [], balance: 0, issues: [] }
  }

  let normalizedUnit: FertilizerInventoryBaseUnit | null = null
  const issues: FertilizerInventoryLegacyMigrationReasonCode[] = []
  const movementUpgrades: LegacyMigrationMovementUpgrade[] = []

  for (const movement of movements) {
    if (!movement.movementId.trim()) {
      issues.push('INVALID_MOVEMENT')
      continue
    }

    if (!Number.isFinite(movement.quantityDelta) || movement.quantityDelta === 0) {
      issues.push('INVALID_MOVEMENT')
      continue
    }

    try {
      assertInventoryQuantityPrecision(movement.quantityDelta, 'quantityDelta')
    } catch {
      issues.push('INVALID_MOVEMENT_QUANTITY')
      continue
    }

    const unitClass = classifyUnit(movement.unit)
    if (unitClass === 'unsupported') {
      issues.push('UNSUPPORTED_PACKAGE_UNIT')
      continue
    }

    if (unitClass === 'invalid') {
      issues.push('CONFLICTING_MOVEMENT_UNITS')
      continue
    }

    const unit = normalizeUnitToken(movement.unit) as FertilizerInventoryBaseUnit
    if (normalizedUnit == null) {
      normalizedUnit = unit
    } else if (normalizedUnit !== unit) {
      issues.push('CONFLICTING_MOVEMENT_UNITS')
    }

    const movementAt = resolveMovementTimestamp(movement)
    if (!movementAt) {
      issues.push('INVALID_MOVEMENT')
      continue
    }

    movementUpgrades.push({
      movementId: movement.movementId,
      quantityDelta: normalizeInventoryQuantity(movement.quantityDelta, 'quantityDelta'),
      unit,
      movementType: movement.movementType,
      movementAt,
      movementOrigin: movement.movementOrigin ?? 'migration',
      inventoryIdempotencyKey:
        movement.inventoryIdempotencyKey?.trim() ||
        `${LEGACY_MIGRATION_MOVEMENT_IDEMPOTENCY_PREFIX}${movement.movementId}`,
      sourceEventRef:
        movement.sourceEventRef?.trim() ||
        `${LEGACY_MIGRATION_MOVEMENT_SOURCE_PREFIX}${movement.movementId}`,
      note: movement.note ?? null,
    })
  }

  if (issues.length > 0) {
    return { ok: false, issues: [...new Set(issues)] }
  }

  const balanceMovements: FertilizerInventoryMovement[] = movementUpgrades.map((movement) => ({
    id: movement.movementId,
    inventoryItemId: 'migration-preview',
    accessKind: targetAccess.accessKind,
    userId: targetAccess.userId,
    sessionAccessHash: targetAccess.sessionAccessHash,
    quantityDelta: movement.quantityDelta,
    unit: movement.unit,
    movementType: movement.movementType,
    movementOrigin: movement.movementOrigin,
    movementAt: movement.movementAt,
    sourceEventRef: movement.sourceEventRef,
    idempotencyKey: movement.inventoryIdempotencyKey,
    note: movement.note,
    createdAt: movement.movementAt,
    recordSchemaVersion: 'fertilizer-inventory-core-v1',
  }))

  const balance = computeInventoryItemBalance(balanceMovements)
  if (balance < 0) {
    return { ok: false, issues: ['NEGATIVE_BALANCE'] }
  }

  return {
    ok: true,
    normalizedUnit: normalizedUnit ?? undefined,
    movementUpgrades,
    balance,
    issues: [],
  }
}

function resolveCreationReason(
  movements: readonly LegacyMigrationMovementInput[],
): {
  ok: boolean
  creationReason?: FertilizerInventoryCreationReason
  usedMigrationFallback?: boolean
  issues: FertilizerInventoryLegacyMigrationReasonCode[]
} {
  const inbound = movements
    .filter(
      (movement) =>
        movement.quantityDelta > 0 &&
        (INBOUND_CREATION_MOVEMENT_TYPES as readonly string[]).includes(movement.movementType),
    )
    .sort((left, right) => {
      const leftTs = resolveMovementTimestamp(left) ?? left.createdAt
      const rightTs = resolveMovementTimestamp(right) ?? right.createdAt
      return leftTs.localeCompare(rightTs)
    })

  if (inbound.length === 0) {
    if (movements.length === 0) {
      return {
        ok: true,
        creationReason: 'initial_stock',
        usedMigrationFallback: true,
        issues: ['MIGRATION_CREATION_REASON_FALLBACK'],
      }
    }

    return { ok: false, issues: ['AMBIGUOUS_CREATION_REASON'] }
  }

  const earliest = inbound[0]!
  const earliestTimestamp = resolveMovementTimestamp(earliest) ?? earliest.createdAt

  const conflictingTypesAtSameTimestamp = inbound.some((movement) => {
    const timestamp = resolveMovementTimestamp(movement) ?? movement.createdAt
    return timestamp === earliestTimestamp && movement.movementType !== earliest.movementType
  })

  if (conflictingTypesAtSameTimestamp) {
    return { ok: false, issues: ['AMBIGUOUS_CREATION_REASON'] }
  }

  const distinctInboundTypes = new Set(
    inbound.map((movement) => movement.movementType).filter((type) => type !== 'inventory_correction'),
  )
  const distinctAcquisitionTypes = [...distinctInboundTypes].filter(
    (type): type is 'purchase' | 'gift_received' => type === 'purchase' || type === 'gift_received',
  )

  if (distinctAcquisitionTypes.length >= 2) {
    return { ok: false, issues: ['AMBIGUOUS_CREATION_REASON'] }
  }

  if (earliest.movementType === 'inventory_correction') {
    return { ok: false, issues: ['AMBIGUOUS_CREATION_REASON'] }
  }

  return {
    ok: true,
    creationReason: earliest.movementType as FertilizerInventoryCreationReason,
    usedMigrationFallback: false,
    issues: [],
  }
}

function buildCanonicalFingerprintInput(plan: Omit<LegacyContainerMigrationUpgradePlan, 'canonicalFingerprintInput'>): string {
  return JSON.stringify({
    containerId: plan.containerId,
    savedProductProfileId: plan.savedProductProfileId,
    accessKind: plan.accessKind,
    userId: plan.userId,
    sessionAccessHash: plan.sessionAccessHash,
    packageSizeValue: plan.packageSizeValue,
    packageSizeUnit: plan.packageSizeUnit,
    productForm: plan.productForm,
    baseUnit: plan.baseUnit,
    creationReason: plan.creationReason,
    sourceEventRef: plan.sourceEventRef,
    movementUpgrades: plan.movementUpgrades.map((movement) => ({
      movementId: movement.movementId,
      quantityDelta: movement.quantityDelta,
      unit: movement.unit,
      movementType: movement.movementType,
      movementAt: movement.movementAt,
      inventoryIdempotencyKey: movement.inventoryIdempotencyKey,
      sourceEventRef: movement.sourceEventRef,
    })),
  })
}

function buildResult(
  status: FertilizerInventoryLegacyMigrationStatus,
  containerId: string,
  options: {
    reasons?: FertilizerInventoryLegacyMigrationReasonCode[]
    warnings?: FertilizerInventoryLegacyMigrationReasonCode[]
    blockingIssues?: FertilizerInventoryLegacyMigrationReasonCode[]
    profileUpliftInput?: LegacyMigrationProfileUpliftInput | null
    upgradePlan?: LegacyContainerMigrationUpgradePlan | null
  } = {},
): LegacyContainerMigrationResult {
  const reasons = options.reasons ?? []
  const warnings = options.warnings ?? []
  const blockingIssues = options.blockingIssues ?? []

  return {
    status,
    containerId,
    reasons,
    warnings,
    blockingIssues,
    requiresProfileUplift: status === 'needs_profile_uplift',
    requiresManualReview: status === 'needs_manual_review',
    isAlreadyMigrated: status === 'already_migrated',
    profileUpliftInput: options.profileUpliftInput ?? null,
    upgradePlan: options.upgradePlan ?? null,
  }
}

// ---------------------------------------------------------------------------
// Public evaluator
// ---------------------------------------------------------------------------

export function buildLegacyContainerMigrationIdempotencyKey(containerId: string): string {
  return `${LEGACY_MIGRATION_IDEMPOTENCY_KEY_PREFIX}${containerId}`
}

export function buildLegacyContainerMigrationSourceEventRef(containerId: string): string {
  return `${LEGACY_MIGRATION_SOURCE_EVENT_PREFIX}${containerId}`
}

export function evaluateLegacyContainerMigration(
  input: LegacyContainerMigrationInput,
): LegacyContainerMigrationResult {
  const container = input.container
  const containerId = container.containerId

  if (!isValidContainerId(containerId)) {
    return buildResult('blocked_invalid_data', containerId, {
      blockingIssues: ['INVALID_CONTAINER_ID'],
      reasons: ['INVALID_CONTAINER_ID'],
    })
  }

  if (container.productId != null && container.recognitionCandidateId != null) {
    return buildResult('blocked_invalid_data', containerId, {
      blockingIssues: ['AMBIGUOUS_PRODUCT_BINDING'],
      reasons: ['AMBIGUOUS_PRODUCT_BINDING'],
    })
  }

  if (hasLegacyCoreBindingConflict(container)) {
    return buildResult('blocked_invalid_data', containerId, {
      blockingIssues: ['LEGACY_AND_CORE_BINDING_CONFLICT'],
      reasons: ['LEGACY_AND_CORE_BINDING_CONFLICT'],
    })
  }

  if (isAlreadyMigratedContainer(container, input.movements)) {
    return buildResult('already_migrated', containerId, {
      reasons: ['CORE_BINDING_ALREADY_COMPLETE'],
    })
  }

  const access = resolveTargetAccess(container)
  if (!access.ok) {
    return buildResult('blocked_invalid_data', containerId, {
      blockingIssues: [access.issue ?? 'INVALID_ACCESS_BINDING'],
      reasons: [access.issue ?? 'INVALID_ACCESS_BINDING'],
    })
  }

  const movementAnalysis = analyzeMovements(input.movements, {
    accessKind: access.accessKind!,
    userId: access.userId ?? null,
    sessionAccessHash: access.sessionAccessHash ?? null,
  })

  if (!movementAnalysis.ok) {
    const blocking = movementAnalysis.issues
    const status = blocking.some((issue) => issue === 'UNSUPPORTED_PACKAGE_UNIT')
      ? 'needs_manual_review'
      : 'blocked_invalid_data'

    return buildResult(status, containerId, {
      blockingIssues: status === 'blocked_invalid_data' ? blocking : [],
      reasons: blocking,
    })
  }

  if (detectAggregationSuspicion(input, input.movements)) {
    return buildResult('needs_manual_review', containerId, {
      reasons: ['AGGREGATED_LEGACY_CONTAINER'],
    })
  }

  const productForm = resolveCoreProductForm(
    container,
    input.catalogProduct,
    input.candidate,
    null,
  )

  if (productForm == null || productForm === 'unknown') {
    return buildResult('needs_manual_review', containerId, {
      reasons: ['UNKNOWN_PRODUCT_FORM'],
    })
  }

  const baseUnit = resolveInventoryBaseUnitFromProductForm(productForm)

  const packageCheck = validatePackagePair(container.packageSizeValue, container.packageSizeUnit)
  if (!packageCheck.ok) {
    const reasons = packageCheck.issues
    const status = reasons.includes('UNSUPPORTED_PACKAGE_UNIT')
      ? 'needs_manual_review'
      : reasons.includes('MISSING_PACKAGE_SIZE')
        ? 'needs_manual_review'
        : 'blocked_invalid_data'

    return buildResult(status, containerId, {
      reasons,
      blockingIssues: status === 'blocked_invalid_data' ? reasons : [],
    })
  }

  if (packageCheck.packageSizeUnit !== baseUnit) {
    return buildResult('needs_manual_review', containerId, {
      reasons: ['UNSUPPORTED_PACKAGE_UNIT'],
    })
  }

  if (
    movementAnalysis.normalizedUnit &&
    movementAnalysis.normalizedUnit !== packageCheck.packageSizeUnit
  ) {
    return buildResult('blocked_invalid_data', containerId, {
      blockingIssues: ['CONFLICTING_MOVEMENT_UNITS'],
      reasons: ['CONFLICTING_MOVEMENT_UNITS'],
    })
  }

  const savedProfiles = collectSavedEnrichmentProfiles(input)
  const savedProfileResolution = resolveSavedProfileId(savedProfiles)

  if (!savedProfileResolution.ok) {
    if (savedProfileResolution.issues.includes('MULTIPLE_SAVED_PROFILES')) {
      return buildResult('needs_manual_review', containerId, {
        reasons: ['MULTIPLE_SAVED_PROFILES'],
      })
    }

    const upliftInput = buildProfileUpliftInput(input, productForm)
    if (!upliftInput) {
      return buildResult('needs_manual_review', containerId, {
        reasons: ['AMBIGUOUS_PRODUCT_BINDING'],
      })
    }

    return buildResult('needs_profile_uplift', containerId, {
      reasons: ['PROFILE_UPLIFT_REQUIRED'],
      profileUpliftInput: upliftInput,
    })
  }

  const creationReasonResult = resolveCreationReason(input.movements)
  if (!creationReasonResult.ok) {
    return buildResult('needs_manual_review', containerId, {
      reasons: creationReasonResult.issues,
    })
  }

  const warnings: FertilizerInventoryLegacyMigrationReasonCode[] = []
  if (creationReasonResult.usedMigrationFallback) {
    warnings.push('MIGRATION_CREATION_REASON_FALLBACK')
  }

  const upgradePlanBase = {
    containerId,
    savedProductProfileId: savedProfileResolution.profileId!,
    accessKind: access.accessKind!,
    userId: access.userId ?? null,
    sessionAccessHash: access.sessionAccessHash ?? null,
    productId: null as null,
    recognitionCandidateId: null as null,
    packageSizeValue: packageCheck.packageSizeValue!,
    packageSizeUnit: packageCheck.packageSizeUnit!,
    productForm,
    baseUnit,
    label: container.label ?? null,
    createdAt: container.createdAt,
    creationReason: creationReasonResult.creationReason!,
    creationReasonUsedMigrationFallback: creationReasonResult.usedMigrationFallback ?? false,
    sourceEventRef: buildLegacyContainerMigrationSourceEventRef(containerId),
    migrationIdempotencyKey: buildLegacyContainerMigrationIdempotencyKey(containerId),
    movementUpgrades: movementAnalysis.movementUpgrades ?? [],
  }

  const upgradePlan: LegacyContainerMigrationUpgradePlan = {
    ...upgradePlanBase,
    canonicalFingerprintInput: buildCanonicalFingerprintInput(upgradePlanBase),
  }

  return buildResult('ready', containerId, {
    reasons: ['SAVED_PROFILE_AVAILABLE'],
    warnings,
    upgradePlan,
  })
}

export function isInboundInventoryCreationMovementType(
  movementType: string,
): movementType is FertilizerInventoryCreationReason {
  return (INBOUND_CREATION_MOVEMENT_TYPES as readonly string[]).includes(movementType)
}

export function isKnownInventoryMovementType(
  movementType: string,
): movementType is FertilizerInventoryMovementType {
  return (FERTILIZER_INVENTORY_MOVEMENT_TYPES as readonly string[]).includes(movementType)
}
