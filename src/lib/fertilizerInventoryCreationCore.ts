import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import {
  FERTILIZER_INVENTORY_BASE_UNITS,
  isFertilizerInventoryBaseUnit,
  type FertilizerInventoryBaseUnit,
} from '../types/fertilizerInventoryCore'
import { assertInventoryQuantityPrecision } from './fertilizerInventoryQuantityCore'

// ---------------------------------------------------------------------------
// Phase 7B — confirmed package structure → normalized creation input (DL-027)
// Domain-only: no persistence, no product-profile lookup, no package resolution.
// ---------------------------------------------------------------------------

export const FERTILIZER_INVENTORY_CREATION_MAX_PACKAGES = 20 as const
export const FERTILIZER_INVENTORY_CREATION_MAX_IDEMPOTENCY_KEY_LENGTH = 256 as const
export const FERTILIZER_INVENTORY_CREATION_MAX_SOURCE_EVENT_REF_LENGTH = 256 as const
export const FERTILIZER_INVENTORY_CREATION_MAX_CORRELATION_PREFIX_LENGTH = 64 as const

const SAVED_PRODUCT_PROFILE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const CLIENT_CORRELATION_PREFIX_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/

/** Initial access reasons for item creation — excludes inventory_correction (DL-029). */
export type FertilizerInventoryCreationReason =
  | 'initial_stock'
  | 'purchase'
  | 'gift_received'

export const FERTILIZER_INVENTORY_CREATION_REASONS = [
  'initial_stock',
  'purchase',
  'gift_received',
] as const satisfies readonly FertilizerInventoryCreationReason[]

/** UI/application input: confirmed package group with optional multiplicity. */
export interface FertilizerConfirmedPackageGroupInput {
  packageSizeValue: number
  packageSizeUnit: FertilizerInventoryBaseUnit
  initialQuantityValue: number
  initialQuantityUnit: FertilizerInventoryBaseUnit
  count: number
  clientCorrelationIdPrefix?: string
}

/** Application input for inventory creation from a confirmed package structure. */
export interface CreateFertilizerInventoryFromConfirmedPackagesInput {
  savedProductProfileId: string
  accessContext: FertilizerEnrichmentAccessContext
  creationReason: FertilizerInventoryCreationReason
  idempotencyKey: string
  sourceEventRef?: string | null
  confirmedPackageGroups: FertilizerConfirmedPackageGroupInput[]
}

/** One explicit physical package after group expansion — one future inventory item (DL-024). */
export interface FertilizerConfirmedSinglePackage {
  packageSizeValue: number
  packageSizeUnit: FertilizerInventoryBaseUnit
  initialQuantityValue: number
  initialQuantityUnit: FertilizerInventoryBaseUnit
  sequenceIndex: number
  clientCorrelationId?: string
}

/**
 * Normalized, persistence-ready creation input with a deterministic canonical payload.
 *
 * {@link canonicalPayload} is suitable for application-side diagnostics and deterministic
 * comparisons. The future PostgreSQL creation RPC must compute the authoritative
 * idempotency fingerprint itself from the inputs it actually receives and normalizes
 * server-side. A client-supplied hash must never be treated as idempotency truth.
 */
export interface NormalizedFertilizerInventoryCreationInput {
  savedProductProfileId: string
  accessContext: FertilizerEnrichmentAccessContext
  creationReason: FertilizerInventoryCreationReason
  idempotencyKey: string
  sourceEventRef: string | null
  packages: FertilizerConfirmedSinglePackage[]
  /** Deterministic JSON for idempotency comparison — same semantics as future RPC input. */
  canonicalPayload: string
}

export const FERTILIZER_INVENTORY_CREATION_ERROR_CODES = [
  'inventory_product_profile_id_invalid',
  'inventory_access_context_invalid',
  'inventory_creation_reason_invalid',
  'inventory_creation_idempotency_invalid',
  'inventory_package_list_empty',
  'inventory_package_count_invalid',
  'inventory_package_count_exceeded',
  'inventory_package_size_invalid',
  'inventory_initial_quantity_invalid',
  'inventory_initial_quantity_exceeds_package_size',
  'inventory_unit_mismatch',
  'inventory_quantity_precision_invalid',
  'inventory_client_correlation_id_invalid',
  'inventory_source_event_ref_invalid',
] as const

export type FertilizerInventoryCreationErrorCode =
  (typeof FERTILIZER_INVENTORY_CREATION_ERROR_CODES)[number]

export class FertilizerInventoryCreationError extends Error {
  readonly code: FertilizerInventoryCreationErrorCode
  readonly field?: string
  readonly packageGroupIndex?: number

  constructor(
    code: FertilizerInventoryCreationErrorCode,
    message: string,
    options: { field?: string; packageGroupIndex?: number } = {},
  ) {
    super(message)
    this.name = 'FertilizerInventoryCreationError'
    this.code = code
    this.field = options.field
    this.packageGroupIndex = options.packageGroupIndex
  }
}

interface CanonicalAccessContextPayload {
  kind: FertilizerEnrichmentAccessContext['kind']
  userId?: string
  sessionId?: string
}

interface CanonicalPackagePayload {
  sequenceIndex: number
  packageSizeValue: string
  packageSizeUnit: FertilizerInventoryBaseUnit
  initialQuantityValue: string
  initialQuantityUnit: FertilizerInventoryBaseUnit
  clientCorrelationId: string | null
}

interface CanonicalCreationPayload {
  savedProductProfileId: string
  accessContext: CanonicalAccessContextPayload
  creationReason: FertilizerInventoryCreationReason
  sourceEventRef: string | null
  packages: CanonicalPackagePayload[]
}

function throwCreationError(
  code: FertilizerInventoryCreationErrorCode,
  message: string,
  options: { field?: string; packageGroupIndex?: number } = {},
): never {
  throw new FertilizerInventoryCreationError(code, message, options)
}

function assertQuantityPrecision(
  value: number,
  fieldName: string,
  packageGroupIndex?: number,
): void {
  try {
    assertInventoryQuantityPrecision(value, fieldName)
  } catch {
    throwCreationError(
      'inventory_quantity_precision_invalid',
      `${fieldName} supports at most four decimal places and must be finite.`,
      { field: fieldName, packageGroupIndex },
    )
  }
}

/** Canonical decimal string — 25, 25.0 and 25.0000 all become "25". */
export function formatCanonicalInventoryCreationQuantity(value: number): string {
  assertQuantityPrecision(value, 'quantity')

  const scaled = Math.round(value * 10_000)
  if (scaled % 10_000 === 0) {
    return String(scaled / 10_000)
  }

  return (scaled / 10_000).toFixed(4).replace(/\.?0+$/, '')
}

function validateSavedProductProfileId(savedProductProfileId: string): string {
  const trimmed = savedProductProfileId.trim()

  if (!trimmed) {
    throwCreationError(
      'inventory_product_profile_id_invalid',
      'savedProductProfileId must be a non-empty UUID.',
      { field: 'savedProductProfileId' },
    )
  }

  if (!SAVED_PRODUCT_PROFILE_ID_PATTERN.test(trimmed)) {
    throwCreationError(
      'inventory_product_profile_id_invalid',
      'savedProductProfileId must be a valid UUID.',
      { field: 'savedProductProfileId' },
    )
  }

  return trimmed.toLowerCase()
}

export function validateFertilizerInventoryCreationAccessContext(
  accessContext: FertilizerEnrichmentAccessContext,
): FertilizerEnrichmentAccessContext {
  if (!accessContext || typeof accessContext !== 'object') {
    throwCreationError(
      'inventory_access_context_invalid',
      'accessContext is required.',
      { field: 'accessContext' },
    )
  }

  if (accessContext.kind === 'authenticated_user') {
    const userId = accessContext.userId?.trim()
    if (!userId) {
      throwCreationError(
        'inventory_access_context_invalid',
        'accessContext.userId must be a non-empty string for authenticated_user scope.',
        { field: 'accessContext.userId' },
      )
    }

    const sessionId =
      typeof accessContext.sessionId === 'string' && accessContext.sessionId.trim()
        ? accessContext.sessionId.trim()
        : undefined

    return sessionId
      ? { kind: 'authenticated_user', userId, sessionId }
      : { kind: 'authenticated_user', userId }
  }

  if (accessContext.kind === 'session') {
    const sessionId = accessContext.sessionId?.trim()
    if (!sessionId) {
      throwCreationError(
        'inventory_access_context_invalid',
        'accessContext.sessionId must be a non-empty string for session scope.',
        { field: 'accessContext.sessionId' },
      )
    }

    return { kind: 'session', sessionId }
  }

  throwCreationError(
    'inventory_access_context_invalid',
    'accessContext.kind must be authenticated_user or session.',
    { field: 'accessContext.kind' },
  )
}

function validateCreationReason(value: unknown): FertilizerInventoryCreationReason {
  if (
    typeof value !== 'string' ||
    !(FERTILIZER_INVENTORY_CREATION_REASONS as readonly string[]).includes(value)
  ) {
    throwCreationError(
      'inventory_creation_reason_invalid',
      'creationReason must be initial_stock, purchase, or gift_received.',
      { field: 'creationReason' },
    )
  }

  return value as FertilizerInventoryCreationReason
}

function validateIdempotencyKey(idempotencyKey: string): string {
  const trimmed = idempotencyKey.trim()

  if (!trimmed) {
    throwCreationError(
      'inventory_creation_idempotency_invalid',
      'idempotencyKey must be a non-empty string.',
      { field: 'idempotencyKey' },
    )
  }

  if (trimmed.length > FERTILIZER_INVENTORY_CREATION_MAX_IDEMPOTENCY_KEY_LENGTH) {
    throwCreationError(
      'inventory_creation_idempotency_invalid',
      `idempotencyKey must not exceed ${FERTILIZER_INVENTORY_CREATION_MAX_IDEMPOTENCY_KEY_LENGTH} characters.`,
      { field: 'idempotencyKey' },
    )
  }

  return trimmed
}

function normalizeSourceEventRef(sourceEventRef: string | null | undefined): string | null {
  if (sourceEventRef == null) {
    return null
  }

  const trimmed = sourceEventRef.trim()
  if (!trimmed) {
    throwCreationError(
      'inventory_source_event_ref_invalid',
      'sourceEventRef must be omitted, null, or a non-empty string.',
      { field: 'sourceEventRef' },
    )
  }

  if (trimmed.length > FERTILIZER_INVENTORY_CREATION_MAX_SOURCE_EVENT_REF_LENGTH) {
    throwCreationError(
      'inventory_source_event_ref_invalid',
      `sourceEventRef must not exceed ${FERTILIZER_INVENTORY_CREATION_MAX_SOURCE_EVENT_REF_LENGTH} characters.`,
      { field: 'sourceEventRef' },
    )
  }

  return trimmed
}

function validateClientCorrelationIdPrefix(
  prefix: string | undefined,
  packageGroupIndex: number,
): string | undefined {
  if (prefix == null) {
    return undefined
  }

  const trimmed = prefix.trim()
  if (!trimmed) {
    throwCreationError(
      'inventory_client_correlation_id_invalid',
      'clientCorrelationIdPrefix must be omitted or a non-empty string.',
      { field: 'clientCorrelationIdPrefix', packageGroupIndex },
    )
  }

  if (trimmed.length > FERTILIZER_INVENTORY_CREATION_MAX_CORRELATION_PREFIX_LENGTH) {
    throwCreationError(
      'inventory_client_correlation_id_invalid',
      `clientCorrelationIdPrefix must not exceed ${FERTILIZER_INVENTORY_CREATION_MAX_CORRELATION_PREFIX_LENGTH} characters.`,
      { field: 'clientCorrelationIdPrefix', packageGroupIndex },
    )
  }

  if (!CLIENT_CORRELATION_PREFIX_PATTERN.test(trimmed)) {
    throwCreationError(
      'inventory_client_correlation_id_invalid',
      'clientCorrelationIdPrefix must start with a letter or digit and contain only letters, digits, underscores, or hyphens.',
      { field: 'clientCorrelationIdPrefix', packageGroupIndex },
    )
  }

  return trimmed
}

function validateBaseUnit(
  unit: unknown,
  fieldName: string,
  packageGroupIndex: number,
): FertilizerInventoryBaseUnit {
  if (typeof unit !== 'string' || !isFertilizerInventoryBaseUnit(unit)) {
    throwCreationError(
      'inventory_unit_mismatch',
      `${fieldName} must be one of: ${FERTILIZER_INVENTORY_BASE_UNITS.join(', ')}.`,
      { field: fieldName, packageGroupIndex },
    )
  }

  return unit
}

function validatePositivePackageSize(
  value: number,
  packageGroupIndex: number,
): number {
  if (!Number.isFinite(value)) {
    throwCreationError(
      'inventory_package_size_invalid',
      'packageSizeValue must be a finite number greater than zero.',
      { field: 'packageSizeValue', packageGroupIndex },
    )
  }

  assertQuantityPrecision(value, 'packageSizeValue', packageGroupIndex)

  if (value <= 0) {
    throwCreationError(
      'inventory_package_size_invalid',
      'packageSizeValue must be greater than zero.',
      { field: 'packageSizeValue', packageGroupIndex },
    )
  }

  return value
}

function validatePositiveInitialQuantity(
  value: number,
  packageGroupIndex: number,
): number {
  if (!Number.isFinite(value)) {
    throwCreationError(
      'inventory_initial_quantity_invalid',
      'initialQuantityValue must be a finite number greater than zero.',
      { field: 'initialQuantityValue', packageGroupIndex },
    )
  }

  assertQuantityPrecision(value, 'initialQuantityValue', packageGroupIndex)

  if (value <= 0) {
    throwCreationError(
      'inventory_initial_quantity_invalid',
      'initialQuantityValue must be greater than zero.',
      { field: 'initialQuantityValue', packageGroupIndex },
    )
  }

  return value
}

function validatePackageGroup(
  group: FertilizerConfirmedPackageGroupInput,
  packageGroupIndex: number,
): FertilizerConfirmedPackageGroupInput {
  const packageSizeUnit = validateBaseUnit(
    group.packageSizeUnit,
    'packageSizeUnit',
    packageGroupIndex,
  )
  const initialQuantityUnit = validateBaseUnit(
    group.initialQuantityUnit,
    'initialQuantityUnit',
    packageGroupIndex,
  )

  if (packageSizeUnit !== initialQuantityUnit) {
    throwCreationError(
      'inventory_unit_mismatch',
      'packageSizeUnit and initialQuantityUnit must match.',
      { field: 'initialQuantityUnit', packageGroupIndex },
    )
  }

  const packageSizeValue = validatePositivePackageSize(group.packageSizeValue, packageGroupIndex)
  const initialQuantityValue = validatePositiveInitialQuantity(
    group.initialQuantityValue,
    packageGroupIndex,
  )

  if (initialQuantityValue > packageSizeValue) {
    throwCreationError(
      'inventory_initial_quantity_exceeds_package_size',
      'initialQuantityValue must not exceed packageSizeValue.',
      { field: 'initialQuantityValue', packageGroupIndex },
    )
  }

  if (!Number.isInteger(group.count)) {
    throwCreationError(
      'inventory_package_count_invalid',
      'count must be an integer.',
      { field: 'count', packageGroupIndex },
    )
  }

  if (group.count < 1) {
    throwCreationError(
      'inventory_package_count_invalid',
      'count must be at least 1.',
      { field: 'count', packageGroupIndex },
    )
  }

  const clientCorrelationIdPrefix = validateClientCorrelationIdPrefix(
    group.clientCorrelationIdPrefix,
    packageGroupIndex,
  )

  return {
    packageSizeValue,
    packageSizeUnit,
    initialQuantityValue,
    initialQuantityUnit,
    count: group.count,
    clientCorrelationIdPrefix,
  }
}

export function expandConfirmedPackageGroups(
  groups: readonly FertilizerConfirmedPackageGroupInput[],
): FertilizerConfirmedSinglePackage[] {
  if (groups.length === 0) {
    throwCreationError(
      'inventory_package_list_empty',
      'confirmedPackageGroups must contain at least one group.',
      { field: 'confirmedPackageGroups' },
    )
  }

  const packages: FertilizerConfirmedSinglePackage[] = []
  let sequenceIndex = 0

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = validatePackageGroup(groups[groupIndex], groupIndex)

    for (let instanceIndex = 0; instanceIndex < group.count; instanceIndex += 1) {
      if (packages.length >= FERTILIZER_INVENTORY_CREATION_MAX_PACKAGES) {
        throwCreationError(
          'inventory_package_count_exceeded',
          `At most ${FERTILIZER_INVENTORY_CREATION_MAX_PACKAGES} physical packages are allowed per request.`,
          { field: 'confirmedPackageGroups' },
        )
      }

      packages.push({
        packageSizeValue: group.packageSizeValue,
        packageSizeUnit: group.packageSizeUnit,
        initialQuantityValue: group.initialQuantityValue,
        initialQuantityUnit: group.initialQuantityUnit,
        sequenceIndex,
        clientCorrelationId: group.clientCorrelationIdPrefix
          ? `${group.clientCorrelationIdPrefix}-${instanceIndex + 1}`
          : undefined,
      })

      sequenceIndex += 1
    }
  }

  if (packages.length === 0) {
    throwCreationError(
      'inventory_package_list_empty',
      'confirmedPackageGroups must expand to at least one package.',
      { field: 'confirmedPackageGroups' },
    )
  }

  return packages
}

function buildCanonicalAccessContextPayload(
  accessContext: FertilizerEnrichmentAccessContext,
): CanonicalAccessContextPayload {
  if (accessContext.kind === 'authenticated_user') {
    return {
      kind: 'authenticated_user',
      userId: accessContext.userId,
    }
  }

  return {
    kind: 'session',
    sessionId: accessContext.sessionId,
  }
}

export function buildCanonicalFertilizerInventoryCreationPayload(
  input: Omit<NormalizedFertilizerInventoryCreationInput, 'canonicalPayload'>,
): string {
  const payload: CanonicalCreationPayload = {
    savedProductProfileId: input.savedProductProfileId,
    accessContext: buildCanonicalAccessContextPayload(input.accessContext),
    creationReason: input.creationReason,
    sourceEventRef: input.sourceEventRef,
    packages: input.packages.map((pkg) => ({
      sequenceIndex: pkg.sequenceIndex,
      packageSizeValue: formatCanonicalInventoryCreationQuantity(pkg.packageSizeValue),
      packageSizeUnit: pkg.packageSizeUnit,
      initialQuantityValue: formatCanonicalInventoryCreationQuantity(pkg.initialQuantityValue),
      initialQuantityUnit: pkg.initialQuantityUnit,
      clientCorrelationId: pkg.clientCorrelationId ?? null,
    })),
  }

  return JSON.stringify(payload)
}

/**
 * Validates and normalizes confirmed package groups into an explicit single-package list
 * with a deterministic canonical payload for request-scoped idempotency (Phase 7B).
 */
export function normalizeFertilizerInventoryCreationInput(
  input: CreateFertilizerInventoryFromConfirmedPackagesInput,
): NormalizedFertilizerInventoryCreationInput {
  const savedProductProfileId = validateSavedProductProfileId(input.savedProductProfileId)
  const accessContext = validateFertilizerInventoryCreationAccessContext(input.accessContext)
  const creationReason = validateCreationReason(input.creationReason)
  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey)
  const sourceEventRef = normalizeSourceEventRef(input.sourceEventRef)
  const packages = expandConfirmedPackageGroups(input.confirmedPackageGroups)

  const normalizedWithoutPayload = {
    savedProductProfileId,
    accessContext,
    creationReason,
    idempotencyKey,
    sourceEventRef,
    packages,
  }

  const canonicalPayload = buildCanonicalFertilizerInventoryCreationPayload(normalizedWithoutPayload)

  return {
    ...normalizedWithoutPayload,
    canonicalPayload,
  }
}
