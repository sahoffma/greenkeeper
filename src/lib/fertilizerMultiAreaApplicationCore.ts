import type { FertilizerInventoryBaseUnit } from '../types/fertilizerInventoryCore'
import {
  FERTILIZER_INVENTORY_QUANTITY_SCALE,
  assertInventoryQuantityPrecision,
  normalizeInventoryQuantity,
  scaleInventoryQuantity,
  unscaleInventoryQuantity,
} from './fertilizerInventoryQuantityCore'

// ---------------------------------------------------------------------------
// Multi-area fertilizer application domain (DL-031) — pure calculation,
// validation and distribution. No UI, DB or Supabase dependencies.
// ---------------------------------------------------------------------------

export const FERTILIZER_MULTI_AREA_SELECTION_SOURCES = ['manual', 'care_group'] as const
export type FertilizerMultiAreaSelectionSource =
  (typeof FERTILIZER_MULTI_AREA_SELECTION_SOURCES)[number]

export const FERTILIZER_MULTI_AREA_APPLICATION_MODES = [
  'rate_per_sqm',
  'total_amount_proportional',
] as const
export type FertilizerMultiAreaApplicationMode =
  (typeof FERTILIZER_MULTI_AREA_APPLICATION_MODES)[number]

export const FERTILIZER_EFFORT_RATE_UNITS = ['g_per_sqm', 'ml_per_sqm'] as const
export type FertilizerEffortRateUnit = (typeof FERTILIZER_EFFORT_RATE_UNITS)[number]

export const FERTILIZER_MULTI_AREA_MAX_RATE_DECIMAL_PLACES = 4 as const
export const FERTILIZER_AREA_SIZE_SCALE = 100 as const
export const FERTILIZER_MIN_INVENTORY_QUANTITY = 1 / FERTILIZER_INVENTORY_QUANTITY_SCALE

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const FERTILIZER_MULTI_AREA_APPLICATION_ERROR_CODES = [
  'NO_AREAS_SELECTED',
  'DUPLICATE_AREA',
  'AREA_SIZE_MISSING',
  'AREA_SIZE_INVALID',
  'APPLICATION_MODE_INVALID',
  'APPLICATION_RATE_INVALID',
  'APPLICATION_TOTAL_INVALID',
  'APPLICATION_UNIT_INVALID',
  'APPLICATION_RATE_UNIT_INVALID',
  'APPLICATION_AMOUNT_TOO_SMALL',
  'APPLICATION_AMOUNT_PRECISION_INVALID',
  'APPLICATION_DISTRIBUTION_INVALID',
  'APPLICATION_DISTRIBUTION_ROUNDING_FAILED',
] as const

export type FertilizerMultiAreaApplicationErrorCode =
  (typeof FERTILIZER_MULTI_AREA_APPLICATION_ERROR_CODES)[number]

export class FertilizerMultiAreaApplicationError extends Error {
  readonly code: FertilizerMultiAreaApplicationErrorCode

  constructor(code: FertilizerMultiAreaApplicationErrorCode, message: string) {
    super(message)
    this.name = 'FertilizerMultiAreaApplicationError'
    this.code = code
  }
}

/** Raw area input before normalization — not mutated by the core. */
export interface FertilizerMultiAreaApplicationAreaInput {
  areaId: string
  areaName: string
  areaSizeSqm: number | null
}

/** Raw multi-area application input before normalization — not mutated. */
export interface FertilizerMultiAreaApplicationInput {
  baseUnit: FertilizerInventoryBaseUnit
  mode: FertilizerMultiAreaApplicationMode
  selectionSource: FertilizerMultiAreaSelectionSource
  careGroupId?: string | null
  areas: readonly FertilizerMultiAreaApplicationAreaInput[]
  rateValue?: number | null
  totalAmount?: number | null
}

export interface FertilizerMultiAreaAreaSnapshot {
  areaId: string
  areaNameSnapshot: string
  areaSizeSqmSnapshot: number
  applicationAmount: number
  applicationUnit: FertilizerInventoryBaseUnit
  effortRate: number
  effortRateUnit: FertilizerEffortRateUnit
  sortOrder: number
}

export interface NormalizedFertilizerMultiAreaApplication {
  baseUnit: FertilizerInventoryBaseUnit
  mode: FertilizerMultiAreaApplicationMode
  selectionSource: FertilizerMultiAreaSelectionSource
  careGroupId: string | null
  confirmedInputValue: number
  totalApplicationAmount: number
  effortRateUnit: FertilizerEffortRateUnit
  areaSnapshots: FertilizerMultiAreaAreaSnapshot[]
  canonicalPayload: string
}

function assertUuid(value: string, fieldName: string): string {
  const trimmed = value.trim()
  if (!UUID_PATTERN.test(trimmed)) {
    throw new FertilizerMultiAreaApplicationError(
      'APPLICATION_DISTRIBUTION_INVALID',
      `${fieldName} must be a valid UUID.`,
    )
  }
  return trimmed.toLowerCase()
}

function assertSelectionSource(
  value: string,
): FertilizerMultiAreaSelectionSource {
  if (value === 'manual' || value === 'care_group') {
    return value
  }

  throw new FertilizerMultiAreaApplicationError(
    'APPLICATION_DISTRIBUTION_INVALID',
    'Selection source is not supported.',
  )
}

function assertApplicationMode(value: string): FertilizerMultiAreaApplicationMode {
  if (value === 'rate_per_sqm' || value === 'total_amount_proportional') {
    return value
  }

  throw new FertilizerMultiAreaApplicationError(
    'APPLICATION_MODE_INVALID',
    'Application mode is not supported.',
  )
}

function assertBaseUnit(value: string): FertilizerInventoryBaseUnit {
  if (value === 'kg' || value === 'ml') {
    return value
  }

  throw new FertilizerMultiAreaApplicationError(
    'APPLICATION_UNIT_INVALID',
    'Application base unit must be kg or ml.',
  )
}

function effortRateUnitForBaseUnit(baseUnit: FertilizerInventoryBaseUnit): FertilizerEffortRateUnit {
  return baseUnit === 'kg' ? 'g_per_sqm' : 'ml_per_sqm'
}

function countDecimalPlaces(value: number): number {
  if (!Number.isFinite(value)) {
    return Number.MAX_SAFE_INTEGER
  }

  const normalized = value.toString().toLowerCase()
  if (normalized.includes('e')) {
    const [coefficient, exponentPart] = normalized.split('e')
    const exponent = Number.parseInt(exponentPart, 10)
    const coefficientDecimals = coefficient.includes('.') ? coefficient.split('.')[1]?.length ?? 0 : 0

    if (exponent >= 0) {
      return Math.max(0, coefficientDecimals - exponent)
    }

    return coefficientDecimals - exponent
  }

  const fraction = normalized.split('.')[1]
  return fraction?.length ?? 0
}

function assertRatePrecision(value: number): void {
  if (countDecimalPlaces(value) > FERTILIZER_MULTI_AREA_MAX_RATE_DECIMAL_PLACES) {
    throw new FertilizerMultiAreaApplicationError(
      'APPLICATION_AMOUNT_PRECISION_INVALID',
      'Effort rate supports at most four decimal places.',
    )
  }
}

function scaleAreaSizeSqm(value: number): number {
  return Math.round(value * FERTILIZER_AREA_SIZE_SCALE)
}

function unscaleAreaSizeSqm(scaledValue: number): number {
  return scaledValue / FERTILIZER_AREA_SIZE_SCALE
}

function assertAreaSizeSqm(value: number | null): number {
  if (value == null) {
    throw new FertilizerMultiAreaApplicationError(
      'AREA_SIZE_MISSING',
      'Each selected area must have a numeric size in square meters.',
    )
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new FertilizerMultiAreaApplicationError(
      'AREA_SIZE_INVALID',
      'Each selected area must have a positive numeric size in square meters.',
    )
  }

  if (countDecimalPlaces(value) > 2) {
    throw new FertilizerMultiAreaApplicationError(
      'AREA_SIZE_INVALID',
      'Area size supports at most two decimal places.',
    )
  }

  return unscaleAreaSizeSqm(scaleAreaSizeSqm(value))
}

function sortAreasById<T extends { areaId: string }>(areas: readonly T[]): T[] {
  return [...areas].sort((left, right) => left.areaId.localeCompare(right.areaId))
}

function roundToInventoryQuantityScale(value: number): number {
  return Math.round(value * FERTILIZER_INVENTORY_QUANTITY_SCALE) / FERTILIZER_INVENTORY_QUANTITY_SCALE
}

function normalizeDerivedInventoryQuantity(value: number, fieldName: string): number {
  return normalizeInventoryQuantity(roundToInventoryQuantityScale(value), fieldName)
}

function computeEffortRate(
  applicationAmount: number,
  areaSizeSqm: number,
  effortRateUnit: FertilizerEffortRateUnit,
): number {
  if (effortRateUnit === 'g_per_sqm') {
    return normalizeDerivedInventoryQuantity((applicationAmount * 1000) / areaSizeSqm, 'effortRate')
  }

  return normalizeDerivedInventoryQuantity(applicationAmount / areaSizeSqm, 'effortRate')
}

function computeAbsoluteAmountFromRate(
  rateValue: number,
  areaSizeSqm: number,
  baseUnit: FertilizerInventoryBaseUnit,
): number {
  const areaSizeScaled = scaleAreaSizeSqm(areaSizeSqm)

  if (baseUnit === 'kg') {
    const amountScaled = Math.round((rateValue * areaSizeScaled) / 10)
    return unscaleInventoryQuantity(amountScaled)
  }

  return normalizeDerivedInventoryQuantity(rateValue * areaSizeSqm, 'applicationAmount')
}

function distributeTotalAmountProportionally(
  totalAmountScaled: number,
  areas: Array<{
    areaId: string
    areaNameSnapshot: string
    areaSizeSqmSnapshot: number
    areaSizeScaled: number
  }>,
): number[] {
  const totalSizeScaled = areas.reduce((sum, area) => sum + area.areaSizeScaled, 0)

  if (totalSizeScaled <= 0) {
    throw new FertilizerMultiAreaApplicationError(
      'APPLICATION_DISTRIBUTION_INVALID',
      'Total selected area size must be greater than zero.',
    )
  }

  const sortedAreas = sortAreasById(areas)
  const flooredShares = sortedAreas.map((area) =>
    Math.floor((totalAmountScaled * area.areaSizeScaled) / totalSizeScaled),
  )

  let remainder = totalAmountScaled - flooredShares.reduce((sum, share) => sum + share, 0)

  if (remainder < 0) {
    throw new FertilizerMultiAreaApplicationError(
      'APPLICATION_DISTRIBUTION_ROUNDING_FAILED',
      'Proportional distribution could not preserve the total amount.',
    )
  }

  const remainderRecipients = [...sortedAreas].sort((left, right) => {
    if (right.areaSizeScaled !== left.areaSizeScaled) {
      return right.areaSizeScaled - left.areaSizeScaled
    }

    return right.areaId.localeCompare(left.areaId)
  })

  const shareByAreaId = new Map<string, number>()
  sortedAreas.forEach((area, index) => {
    shareByAreaId.set(area.areaId, flooredShares[index] ?? 0)
  })

  let recipientIndex = 0
  while (remainder > 0) {
    const recipient = remainderRecipients[recipientIndex % remainderRecipients.length]
    if (!recipient) {
      throw new FertilizerMultiAreaApplicationError(
        'APPLICATION_DISTRIBUTION_ROUNDING_FAILED',
        'Proportional distribution could not assign the rounding remainder.',
      )
    }

    shareByAreaId.set(recipient.areaId, (shareByAreaId.get(recipient.areaId) ?? 0) + 1)
    remainder -= 1
    recipientIndex += 1
  }

  return sortedAreas.map((area) => shareByAreaId.get(area.areaId) ?? 0)
}

function assertPositiveInventoryAmount(amountScaled: number, code: FertilizerMultiAreaApplicationErrorCode): void {
  if (amountScaled <= 0) {
    throw new FertilizerMultiAreaApplicationError(
      code,
      'Each selected area must receive a positive application amount.',
    )
  }

  if (amountScaled < 1) {
    throw new FertilizerMultiAreaApplicationError(
      'APPLICATION_AMOUNT_TOO_SMALL',
      'Application amount is below the smallest storable inventory precision.',
    )
  }
}

function buildAreaSnapshots(input: {
  baseUnit: FertilizerInventoryBaseUnit
  mode: FertilizerMultiAreaApplicationMode
  effortRateUnit: FertilizerEffortRateUnit
  normalizedAreas: Array<{
    areaId: string
    areaNameSnapshot: string
    areaSizeSqmSnapshot: number
    areaSizeScaled: number
  }>
  rateValue: number | null
  totalAmount: number | null
}): FertilizerMultiAreaAreaSnapshot[] {
  const sortedAreas = sortAreasById(input.normalizedAreas)

  let amountScaledByArea: number[]

  if (input.mode === 'rate_per_sqm') {
    if (input.rateValue == null) {
      throw new FertilizerMultiAreaApplicationError(
        'APPLICATION_RATE_INVALID',
        'Effort rate is required for rate_per_sqm mode.',
      )
    }

    amountScaledByArea = sortedAreas.map((area) =>
      scaleInventoryQuantity(
        computeAbsoluteAmountFromRate(input.rateValue!, area.areaSizeSqmSnapshot, input.baseUnit),
        'applicationAmount',
      ),
    )
  } else {
    if (input.totalAmount == null) {
      throw new FertilizerMultiAreaApplicationError(
        'APPLICATION_TOTAL_INVALID',
        'Total amount is required for total_amount_proportional mode.',
      )
    }

    const totalAmountScaled = scaleInventoryQuantity(input.totalAmount, 'totalAmount')
    amountScaledByArea = distributeTotalAmountProportionally(totalAmountScaled, sortedAreas)
  }

  amountScaledByArea.forEach((amountScaled) => {
    assertPositiveInventoryAmount(amountScaled, 'APPLICATION_AMOUNT_TOO_SMALL')
  })

  const totalScaled = amountScaledByArea.reduce((sum, amount) => sum + amount, 0)

  if (input.mode === 'total_amount_proportional' && input.totalAmount != null) {
    const expectedTotalScaled = scaleInventoryQuantity(input.totalAmount, 'totalAmount')
    if (totalScaled !== expectedTotalScaled) {
      throw new FertilizerMultiAreaApplicationError(
        'APPLICATION_DISTRIBUTION_ROUNDING_FAILED',
        'Distributed area amounts do not sum to the confirmed total amount.',
      )
    }
  }

  return sortedAreas.map((area, index) => {
    const applicationAmount = unscaleInventoryQuantity(amountScaledByArea[index] ?? 0)

    try {
      assertInventoryQuantityPrecision(applicationAmount, 'applicationAmount')
    } catch {
      throw new FertilizerMultiAreaApplicationError(
        'APPLICATION_AMOUNT_PRECISION_INVALID',
        'Application amount supports at most four decimal places.',
      )
    }

    const effortRate = computeEffortRate(
      applicationAmount,
      area.areaSizeSqmSnapshot,
      input.effortRateUnit,
    )

    return {
      areaId: area.areaId,
      areaNameSnapshot: area.areaNameSnapshot,
      areaSizeSqmSnapshot: area.areaSizeSqmSnapshot,
      applicationAmount,
      applicationUnit: input.baseUnit,
      effortRate,
      effortRateUnit: input.effortRateUnit,
      sortOrder: index,
    }
  })
}

export function buildCanonicalFertilizerMultiAreaApplicationPayload(input: {
  baseUnit: FertilizerInventoryBaseUnit
  mode: FertilizerMultiAreaApplicationMode
  selectionSource: FertilizerMultiAreaSelectionSource
  careGroupId: string | null
  confirmedInputValue: number
  totalApplicationAmount: number
  effortRateUnit: FertilizerEffortRateUnit
  areaSnapshots: FertilizerMultiAreaAreaSnapshot[]
}): string {
  return JSON.stringify({
    baseUnit: input.baseUnit,
    mode: input.mode,
    selectionSource: input.selectionSource,
    careGroupId: input.careGroupId,
    confirmedInputValue: input.confirmedInputValue,
    totalApplicationAmount: input.totalApplicationAmount,
    effortRateUnit: input.effortRateUnit,
    areas: input.areaSnapshots.map((snapshot) => ({
      areaId: snapshot.areaId,
      areaNameSnapshot: snapshot.areaNameSnapshot,
      areaSizeSqmSnapshot: snapshot.areaSizeSqmSnapshot,
      applicationAmount: snapshot.applicationAmount,
      applicationUnit: snapshot.applicationUnit,
      effortRate: snapshot.effortRate,
      effortRateUnit: snapshot.effortRateUnit,
      sortOrder: snapshot.sortOrder,
    })),
  })
}

export function normalizeFertilizerMultiAreaApplication(
  input: FertilizerMultiAreaApplicationInput,
): NormalizedFertilizerMultiAreaApplication {
  if (!input.areas.length) {
    throw new FertilizerMultiAreaApplicationError(
      'NO_AREAS_SELECTED',
      'At least one area must be selected.',
    )
  }

  const baseUnit = assertBaseUnit(input.baseUnit)
  const mode = assertApplicationMode(input.mode)
  const selectionSource = assertSelectionSource(input.selectionSource)
  const effortRateUnit = effortRateUnitForBaseUnit(baseUnit)

  const seenAreaIds = new Set<string>()
  const normalizedAreas = input.areas.map((area) => {
    const areaId = assertUuid(area.areaId, 'areaId')
    if (seenAreaIds.has(areaId)) {
      throw new FertilizerMultiAreaApplicationError(
        'DUPLICATE_AREA',
        'Duplicate area selection is not allowed.',
      )
    }
    seenAreaIds.add(areaId)

    const areaNameSnapshot = area.areaName.trim()
    if (!areaNameSnapshot) {
      throw new FertilizerMultiAreaApplicationError(
        'APPLICATION_DISTRIBUTION_INVALID',
        'Each selected area must have a name snapshot.',
      )
    }

    const areaSizeSqmSnapshot = assertAreaSizeSqm(area.areaSizeSqm)

    return {
      areaId,
      areaNameSnapshot,
      areaSizeSqmSnapshot,
      areaSizeScaled: scaleAreaSizeSqm(areaSizeSqmSnapshot),
    }
  })

  let careGroupId: string | null = null
  if (input.careGroupId != null) {
    const trimmed = input.careGroupId.trim()
    if (trimmed) {
      careGroupId = assertUuid(trimmed, 'careGroupId')
    }
  }

  if (selectionSource === 'care_group' && careGroupId == null) {
    throw new FertilizerMultiAreaApplicationError(
      'APPLICATION_DISTRIBUTION_INVALID',
      'Care group origin requires a care group id snapshot.',
    )
  }

  let confirmedInputValue: number
  let rateValue: number | null = null
  let totalAmount: number | null = null

  if (mode === 'rate_per_sqm') {
    if (input.rateValue == null || !Number.isFinite(input.rateValue) || input.rateValue <= 0) {
      throw new FertilizerMultiAreaApplicationError(
        'APPLICATION_RATE_INVALID',
        'Effort rate must be greater than zero.',
      )
    }

    assertRatePrecision(input.rateValue)
    rateValue = input.rateValue
    confirmedInputValue = rateValue
  } else {
    if (input.totalAmount == null || !Number.isFinite(input.totalAmount) || input.totalAmount <= 0) {
      throw new FertilizerMultiAreaApplicationError(
        'APPLICATION_TOTAL_INVALID',
        'Total amount must be greater than zero.',
      )
    }

    try {
      totalAmount = normalizeInventoryQuantity(input.totalAmount, 'totalAmount')
    } catch {
      throw new FertilizerMultiAreaApplicationError(
        'APPLICATION_AMOUNT_PRECISION_INVALID',
        'Total amount supports at most four decimal places.',
      )
    }

    confirmedInputValue = totalAmount
  }

  const areaSnapshots = buildAreaSnapshots({
    baseUnit,
    mode,
    effortRateUnit,
    normalizedAreas,
    rateValue,
    totalAmount,
  })

  const totalApplicationAmount = normalizeDerivedInventoryQuantity(
    areaSnapshots.reduce((sum, snapshot) => sum + snapshot.applicationAmount, 0),
    'totalApplicationAmount',
  )

  if (mode === 'rate_per_sqm' && totalApplicationAmount <= 0) {
    throw new FertilizerMultiAreaApplicationError(
      'APPLICATION_AMOUNT_TOO_SMALL',
      'Derived total application amount is below the smallest storable inventory precision.',
    )
  }

  const normalized: Omit<NormalizedFertilizerMultiAreaApplication, 'canonicalPayload'> = {
    baseUnit,
    mode,
    selectionSource,
    careGroupId,
    confirmedInputValue,
    totalApplicationAmount,
    effortRateUnit,
    areaSnapshots,
  }

  return {
    ...normalized,
    canonicalPayload: buildCanonicalFertilizerMultiAreaApplicationPayload(normalized),
  }
}

export function deriveSingleAreaApplicationAmount(
  normalized: NormalizedFertilizerMultiAreaApplication,
): number {
  if (normalized.areaSnapshots.length !== 1) {
    throw new FertilizerMultiAreaApplicationError(
      'APPLICATION_DISTRIBUTION_INVALID',
      'Single-area derivation requires exactly one area snapshot.',
    )
  }

  return normalized.areaSnapshots[0]?.applicationAmount ?? 0
}
