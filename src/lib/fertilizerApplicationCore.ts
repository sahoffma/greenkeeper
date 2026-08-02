import {
  FERTILIZER_INVENTORY_BASE_UNITS,
  isFertilizerInventoryBaseUnit,
  type FertilizerInventoryBaseUnit,
} from '../types/fertilizerInventoryCore'
import { assertInventoryQuantityPrecision } from './fertilizerInventoryQuantityCore'

// ---------------------------------------------------------------------------
// Fertilizer application domain (DL-030) — browser-safe, no persistence.
// One inventory item, one journal activity, one negative movement per command.
// ---------------------------------------------------------------------------

export const FERTILIZER_APPLICATION_TARGET_KINDS = ['area'] as const
export type FertilizerApplicationTargetKind = (typeof FERTILIZER_APPLICATION_TARGET_KINDS)[number]

export const FERTILIZER_APPLICATION_MAX_IDEMPOTENCY_KEY_LENGTH = 256 as const
export const FERTILIZER_APPLICATION_MAX_SOURCE_EVENT_REF_LENGTH = 256 as const
export const FERTILIZER_APPLICATION_MAX_NOTE_LENGTH = 2000 as const

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const FERTILIZER_APPLICATION_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'INVENTORY_ITEM_NOT_FOUND',
  'INVENTORY_ITEM_NOT_ACCESSIBLE',
  'PRODUCT_PROFILE_MISMATCH',
  'APPLICATION_TARGET_NOT_FOUND',
  'APPLICATION_TARGET_NOT_ACCESSIBLE',
  'APPLICATION_AMOUNT_INVALID',
  'APPLICATION_AMOUNT_PRECISION_INVALID',
  'APPLICATION_UNIT_INVALID',
  'APPLICATION_UNIT_MISMATCH',
  'INSUFFICIENT_STOCK',
  'APPLICATION_DATE_INVALID',
  'IDEMPOTENCY_CONFLICT',
  'APPLICATION_PERSISTENCE_FAILED',
] as const

export type FertilizerApplicationErrorCode = (typeof FERTILIZER_APPLICATION_ERROR_CODES)[number]

export class FertilizerApplicationError extends Error {
  readonly code: FertilizerApplicationErrorCode

  constructor(code: FertilizerApplicationErrorCode, message: string) {
    super(message)
    this.name = 'FertilizerApplicationError'
    this.code = code
  }
}

/** Raw application command before normalization. */
export interface FertilizerApplicationCommandInput {
  inventoryItemId: string
  savedProductProfileId: string
  targetKind: FertilizerApplicationTargetKind
  targetId: string
  applicationAmount: number
  applicationUnit: string
  appliedAt: string
  idempotencyKey: string
  sourceEventRef?: string | null
  note?: string | null
  userId: string
}

/** Normalized command with canonical payload for idempotency diagnostics. */
export interface NormalizedFertilizerApplicationCommand {
  inventoryItemId: string
  savedProductProfileId: string
  targetKind: FertilizerApplicationTargetKind
  targetId: string
  applicationAmount: number
  applicationUnit: FertilizerInventoryBaseUnit
  appliedAt: string
  idempotencyKey: string
  sourceEventRef: string | null
  note: string | null
  userId: string
  canonicalPayload: string
}

export interface FertilizerApplicationResult {
  activityId: string
  movementId: string
  inventoryItemId: string
  savedProductProfileId: string
  targetKind: FertilizerApplicationTargetKind
  targetId: string
  applicationAmount: number
  applicationUnit: FertilizerInventoryBaseUnit
  appliedAt: string
  resultingBalance: number
  idempotentReplay: boolean
}

function assertUuid(value: string, fieldName: string, code: FertilizerApplicationErrorCode): string {
  const trimmed = value.trim()
  if (!UUID_PATTERN.test(trimmed)) {
    throw new FertilizerApplicationError(code, `${fieldName} must be a valid UUID.`)
  }
  return trimmed.toLowerCase()
}

function assertNonEmptyUserId(userId: string): string {
  const trimmed = userId.trim()
  if (!trimmed || !UUID_PATTERN.test(trimmed)) {
    throw new FertilizerApplicationError('NOT_AUTHENTICATED', 'User context is required.')
  }
  return trimmed.toLowerCase()
}

function assertIdempotencyKey(idempotencyKey: string): string {
  const trimmed = idempotencyKey.trim()
  if (!trimmed) {
    throw new FertilizerApplicationError('APPLICATION_PERSISTENCE_FAILED', 'Idempotency key is required.')
  }
  if (trimmed.length > FERTILIZER_APPLICATION_MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new FertilizerApplicationError(
      'APPLICATION_PERSISTENCE_FAILED',
      'Idempotency key exceeds the supported length.',
    )
  }
  return trimmed
}

function normalizeOptionalText(
  value: string | null | undefined,
  maxLength: number,
  fieldName: string,
): string | null {
  if (value == null) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (trimmed.length > maxLength) {
    throw new FertilizerApplicationError(
      'APPLICATION_PERSISTENCE_FAILED',
      `${fieldName} exceeds the supported length.`,
    )
  }

  return trimmed
}

export function validateApplicationTargetKind(
  targetKind: string,
): FertilizerApplicationTargetKind {
  if (targetKind === 'area') {
    return 'area'
  }

  throw new FertilizerApplicationError(
    'APPLICATION_TARGET_NOT_FOUND',
    'Application target kind is not supported.',
  )
}

export function validateApplicationUnit(unit: string): FertilizerInventoryBaseUnit {
  const trimmed = unit.trim()
  if (trimmed === 'g' || trimmed === 'l') {
    throw new FertilizerApplicationError(
      'APPLICATION_UNIT_INVALID',
      'Application unit must be the inventory base unit (kg or ml).',
    )
  }

  if (!isFertilizerInventoryBaseUnit(trimmed)) {
    throw new FertilizerApplicationError(
      'APPLICATION_UNIT_INVALID',
      `Application unit must be one of: ${FERTILIZER_INVENTORY_BASE_UNITS.join(', ')}.`,
    )
  }

  return trimmed
}

export function validateApplicationAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new FertilizerApplicationError(
      'APPLICATION_AMOUNT_INVALID',
      'Application amount must be greater than zero.',
    )
  }

  try {
    assertInventoryQuantityPrecision(amount, 'applicationAmount')
  } catch {
    throw new FertilizerApplicationError(
      'APPLICATION_AMOUNT_PRECISION_INVALID',
      'Application amount supports at most four decimal places.',
    )
  }

  return Math.round(amount * 10_000) / 10_000
}

export function validateAppliedAt(appliedAt: string): string {
  const trimmed = appliedAt.trim()
  if (!trimmed) {
    throw new FertilizerApplicationError('APPLICATION_DATE_INVALID', 'Application date is required.')
  }

  const parsed = Date.parse(trimmed)
  if (!Number.isFinite(parsed)) {
    throw new FertilizerApplicationError('APPLICATION_DATE_INVALID', 'Application date is invalid.')
  }

  return new Date(parsed).toISOString()
}

export function buildCanonicalFertilizerApplicationPayload(
  input: Omit<NormalizedFertilizerApplicationCommand, 'canonicalPayload'>,
): string {
  return JSON.stringify({
    inventoryItemId: input.inventoryItemId,
    savedProductProfileId: input.savedProductProfileId,
    targetKind: input.targetKind,
    targetId: input.targetId,
    applicationAmount: input.applicationAmount,
    applicationUnit: input.applicationUnit,
    appliedAt: input.appliedAt,
    sourceEventRef: input.sourceEventRef,
    note: input.note,
    userId: input.userId,
  })
}

export function normalizeFertilizerApplicationCommand(
  input: FertilizerApplicationCommandInput,
): NormalizedFertilizerApplicationCommand {
  const userId = assertNonEmptyUserId(input.userId)
  const inventoryItemId = assertUuid(
    input.inventoryItemId,
    'inventoryItemId',
    'INVENTORY_ITEM_NOT_FOUND',
  )
  const savedProductProfileId = assertUuid(
    input.savedProductProfileId,
    'savedProductProfileId',
    'PRODUCT_PROFILE_MISMATCH',
  )
  const targetKind = validateApplicationTargetKind(input.targetKind)
  const targetId = assertUuid(input.targetId, 'targetId', 'APPLICATION_TARGET_NOT_FOUND')
  const applicationUnit = validateApplicationUnit(input.applicationUnit)
  const applicationAmount = validateApplicationAmount(input.applicationAmount)
  const appliedAt = validateAppliedAt(input.appliedAt)
  const idempotencyKey = assertIdempotencyKey(input.idempotencyKey)
  const sourceEventRef = normalizeOptionalText(
    input.sourceEventRef,
    FERTILIZER_APPLICATION_MAX_SOURCE_EVENT_REF_LENGTH,
    'sourceEventRef',
  )
  const note = normalizeOptionalText(input.note, FERTILIZER_APPLICATION_MAX_NOTE_LENGTH, 'note')

  const normalized: Omit<NormalizedFertilizerApplicationCommand, 'canonicalPayload'> = {
    inventoryItemId,
    savedProductProfileId,
    targetKind,
    targetId,
    applicationAmount,
    applicationUnit,
    appliedAt,
    idempotencyKey,
    sourceEventRef,
    note,
    userId,
  }

  return {
    ...normalized,
    canonicalPayload: buildCanonicalFertilizerApplicationPayload(normalized),
  }
}

export function assertApplicationUnitMatchesInventoryBaseUnit(
  applicationUnit: FertilizerInventoryBaseUnit,
  inventoryBaseUnit: FertilizerInventoryBaseUnit,
): void {
  if (applicationUnit !== inventoryBaseUnit) {
    throw new FertilizerApplicationError(
      'APPLICATION_UNIT_MISMATCH',
      'Application unit must exactly match the inventory item base unit.',
    )
  }
}

export const APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREA_RPC =
  'apply_fertilizer_inventory_item_to_area' as const
