import { supabase } from './supabase'
import {
  FertilizerMultiAreaApplicationError,
  normalizeFertilizerMultiAreaApplication,
  type FertilizerEffortRateUnit,
  type FertilizerMultiAreaApplicationInput,
  type FertilizerMultiAreaApplicationMode,
  type FertilizerMultiAreaSelectionSource,
  type NormalizedFertilizerMultiAreaApplication,
} from './fertilizerMultiAreaApplicationCore'
import { isFertilizerInventoryBaseUnit } from '../types/fertilizerInventoryCore'
import type { FertilizerInventoryBaseUnit } from '../types/fertilizerInventoryCore'

export const APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC =
  'apply_fertilizer_inventory_item_to_areas' as const

export class FertilizerMultiAreaApplicationRuntimeError extends Error {
  readonly code: string

  constructor(message: string, code = 'application_failed') {
    super(message)
    this.name = 'FertilizerMultiAreaApplicationRuntimeError'
    this.code = code
  }
}

export const FERTILIZER_MULTI_AREA_RUNTIME_ERROR_CODES = [
  'NOT_AUTHENTICATED',
  'INVENTORY_ITEM_NOT_FOUND',
  'INVENTORY_ITEM_NOT_ACCESSIBLE',
  'PRODUCT_PROFILE_MISMATCH',
  'NO_AREAS_SELECTED',
  'DUPLICATE_AREA',
  'APPLICATION_TARGET_NOT_FOUND',
  'APPLICATION_TARGET_NOT_ACCESSIBLE',
  'AREA_SIZE_MISSING',
  'AREA_SIZE_INVALID',
  'AREA_SNAPSHOT_MISMATCH',
  'APPLICATION_MODE_INVALID',
  'APPLICATION_RATE_INVALID',
  'APPLICATION_TOTAL_INVALID',
  'APPLICATION_UNIT_INVALID',
  'APPLICATION_RATE_UNIT_INVALID',
  'APPLICATION_AMOUNT_TOO_SMALL',
  'APPLICATION_AMOUNT_PRECISION_INVALID',
  'APPLICATION_DISTRIBUTION_INVALID',
  'APPLICATION_DISTRIBUTION_ROUNDING_FAILED',
  'INSUFFICIENT_STOCK',
  'APPLICATION_DATE_INVALID',
  'IDEMPOTENCY_CONFLICT',
  'APPLICATION_PERSISTENCE_FAILED',
] as const

export type FertilizerMultiAreaRuntimeErrorCode =
  (typeof FERTILIZER_MULTI_AREA_RUNTIME_ERROR_CODES)[number]

const MULTI_AREA_ERROR_MESSAGES: Record<FertilizerMultiAreaRuntimeErrorCode, string> = {
  NOT_AUTHENTICATED: 'Bitte melde dich erneut an.',
  INVENTORY_ITEM_NOT_FOUND: 'Dieses Gebinde wurde nicht gefunden.',
  INVENTORY_ITEM_NOT_ACCESSIBLE: 'Dieses Gebinde kann nicht angewendet werden.',
  PRODUCT_PROFILE_MISMATCH: 'Dieses Gebinde kann noch nicht angewendet werden.',
  NO_AREAS_SELECTED: 'Bitte wähle mindestens eine Fläche aus.',
  DUPLICATE_AREA: 'Die Flächenauswahl ist ungültig.',
  APPLICATION_TARGET_NOT_FOUND: 'Eine gewählte Fläche wurde nicht gefunden.',
  APPLICATION_TARGET_NOT_ACCESSIBLE: 'Eine gewählte Fläche ist nicht mehr verfügbar.',
  AREA_SIZE_MISSING: 'Eine gewählte Fläche hat keine belastbare Größe.',
  AREA_SIZE_INVALID: 'Eine gewählte Fläche hat eine ungültige Größe.',
  AREA_SNAPSHOT_MISMATCH: 'Die Flächendaten stimmen nicht mehr mit dem Server überein.',
  APPLICATION_MODE_INVALID: 'Der Eingabemodus ist ungültig.',
  APPLICATION_RATE_INVALID: 'Die Aufwandmenge ist ungültig.',
  APPLICATION_TOTAL_INVALID: 'Die Gesamtmenge ist ungültig.',
  APPLICATION_UNIT_INVALID: 'Die Einheit ist ungültig.',
  APPLICATION_RATE_UNIT_INVALID: 'Die Aufwandmengeneinheit ist ungültig.',
  APPLICATION_AMOUNT_TOO_SMALL: 'Die Menge ist zu klein für die Speicherung.',
  APPLICATION_AMOUNT_PRECISION_INVALID: 'Die Menge darf höchstens vier Dezimalstellen haben.',
  APPLICATION_DISTRIBUTION_INVALID: 'Die Verteilung auf die Flächen ist ungültig.',
  APPLICATION_DISTRIBUTION_ROUNDING_FAILED: 'Die Verteilung konnte nicht berechnet werden.',
  INSUFFICIENT_STOCK: 'Der Bestand reicht nicht aus.',
  APPLICATION_DATE_INVALID: 'Das Anwendungsdatum ist ungültig.',
  IDEMPOTENCY_CONFLICT: 'Diese Anwendung widerspricht einer früheren Anfrage.',
  APPLICATION_PERSISTENCE_FAILED: 'Die Anwendung konnte nicht gespeichert werden.',
}

export interface FertilizerMultiAreaApplicationCommandInput {
  inventoryItemId: string
  savedProductProfileId: string
  appliedAt: string
  idempotencyKey: string
  sourceEventRef?: string | null
  note?: string | null
  userId: string
  domain: FertilizerMultiAreaApplicationInput
}

export interface FertilizerMultiAreaApplicationAreaResult {
  areaId: string
  activityId: string
  fertilizationDetailId: string
  applicationAmount: number
  applicationUnit: FertilizerInventoryBaseUnit
  ratePerSqm: number
  rateUnit: FertilizerEffortRateUnit
  sortOrder: number
}

export interface FertilizerMultiAreaApplicationResult {
  applicationBatchId: string
  inventoryItemId: string
  savedProductProfileId: string
  applicationMode: FertilizerMultiAreaApplicationMode
  selectionSource: FertilizerMultiAreaSelectionSource
  totalApplicationAmount: number
  applicationUnit: FertilizerInventoryBaseUnit
  appliedAt: string
  resultingBalance: number
  movementId: string
  idempotentReplay: boolean
  areas: FertilizerMultiAreaApplicationAreaResult[]
}

function extractMultiAreaErrorCode(message: string): FertilizerMultiAreaRuntimeErrorCode | null {
  for (const code of FERTILIZER_MULTI_AREA_RUNTIME_ERROR_CODES) {
    if (message.includes(`FERTILIZER_MULTI_AREA_APPLICATION_${code}`)) {
      return code
    }
  }

  return null
}

function mapMultiAreaDomainError(
  error: FertilizerMultiAreaApplicationError,
): FertilizerMultiAreaApplicationRuntimeError {
  const runtimeCode = FERTILIZER_MULTI_AREA_RUNTIME_ERROR_CODES.includes(
    error.code as FertilizerMultiAreaRuntimeErrorCode,
  )
    ? (error.code as FertilizerMultiAreaRuntimeErrorCode)
    : 'APPLICATION_DISTRIBUTION_INVALID'

  return new FertilizerMultiAreaApplicationRuntimeError(
    MULTI_AREA_ERROR_MESSAGES[runtimeCode] ?? 'Die Anwendung konnte nicht gespeichert werden.',
    runtimeCode,
  )
}

export function readMultiAreaErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }

  return String(error)
}

export function mapMultiAreaApplicationRpcError(
  error: unknown,
): FertilizerMultiAreaApplicationRuntimeError {
  if (error instanceof FertilizerMultiAreaApplicationRuntimeError) {
    return error
  }

  const message = readMultiAreaErrorMessage(error)
  const code = extractMultiAreaErrorCode(message)

  if (code) {
    return new FertilizerMultiAreaApplicationRuntimeError(MULTI_AREA_ERROR_MESSAGES[code], code)
  }

  return new FertilizerMultiAreaApplicationRuntimeError(
    'Die Anwendung konnte nicht gespeichert werden.',
    'application_failed',
  )
}

export interface MultiAreaRpcAreaPayload {
  areaId: string
  areaNameSnapshot: string
  areaSizeSqmSnapshot: number
  applicationAmount: number
  applicationUnit: FertilizerInventoryBaseUnit
  ratePerSqm: number
  rateUnit: FertilizerEffortRateUnit
  sortOrder: number
}

export function buildMultiAreaRpcAreasFromNormalized(
  normalized: NormalizedFertilizerMultiAreaApplication,
): MultiAreaRpcAreaPayload[] {
  return normalized.areaSnapshots.map((snapshot) => ({
    areaId: snapshot.areaId,
    areaNameSnapshot: snapshot.areaNameSnapshot,
    areaSizeSqmSnapshot: snapshot.areaSizeSqmSnapshot,
    applicationAmount: snapshot.applicationAmount,
    applicationUnit: snapshot.applicationUnit,
    ratePerSqm: snapshot.effortRate,
    rateUnit: snapshot.effortRateUnit,
    sortOrder: snapshot.sortOrder,
  }))
}

export function sortMultiAreaRpcAreasCanonically(
  areas: readonly MultiAreaRpcAreaPayload[],
): MultiAreaRpcAreaPayload[] {
  return [...areas].sort((left, right) =>
    left.areaId.toLowerCase().localeCompare(right.areaId.toLowerCase()),
  )
}

export function resolveConfirmedInputUnit(
  normalized: NormalizedFertilizerMultiAreaApplication,
): string {
  if (normalized.mode === 'rate_per_sqm') {
    return normalized.effortRateUnit
  }

  return normalized.baseUnit
}

export function buildMultiAreaApplicationSupabaseRpcParams(input: {
  inventoryItemId: string
  savedProductProfileId: string
  appliedAt: string
  idempotencyKey: string
  sourceEventRef: string | null
  note: string | null
  userId: string
  normalized: NormalizedFertilizerMultiAreaApplication
}): Record<string, unknown> {
  const areas = sortMultiAreaRpcAreasCanonically(
    buildMultiAreaRpcAreasFromNormalized(input.normalized),
  )

  return {
    p_inventory_item_id: input.inventoryItemId,
    p_saved_product_profile_id: input.savedProductProfileId,
    p_application_mode: input.normalized.mode,
    p_selection_source: input.normalized.selectionSource,
    p_care_group_id: input.normalized.careGroupId,
    p_confirmed_input_value: input.normalized.confirmedInputValue,
    p_confirmed_input_unit: resolveConfirmedInputUnit(input.normalized),
    p_total_application_amount: input.normalized.totalApplicationAmount,
    p_application_unit: input.normalized.baseUnit,
    p_applied_at: input.appliedAt,
    p_idempotency_key: input.idempotencyKey,
    p_source_event_ref: input.sourceEventRef,
    p_note: input.note,
    p_areas: areas,
    p_user_id: input.userId,
  }
}

export function parseMultiAreaApplicationRpcResult(
  payload: unknown,
): FertilizerMultiAreaApplicationResult {
  if (!payload || typeof payload !== 'object') {
    throw new FertilizerMultiAreaApplicationRuntimeError(
      'Die Anwendung konnte nicht gespeichert werden.',
      'invalid_response',
    )
  }

  const record = payload as Record<string, unknown>
  const applicationUnit = record.applicationUnit

  if (applicationUnit !== 'kg' && applicationUnit !== 'ml') {
    throw new FertilizerMultiAreaApplicationRuntimeError(
      'Die Anwendung konnte nicht gespeichert werden.',
      'invalid_response',
    )
  }

  if (!isFertilizerInventoryBaseUnit(applicationUnit)) {
    throw new FertilizerMultiAreaApplicationRuntimeError(
      'Die Anwendung konnte nicht gespeichert werden.',
      'invalid_response',
    )
  }

  const applicationMode =
    record.applicationMode === 'total_amount_proportional'
      ? 'total_amount_proportional'
      : record.applicationMode === 'rate_per_sqm'
        ? 'rate_per_sqm'
        : null

  const selectionSource =
    record.selectionSource === 'care_group'
      ? 'care_group'
      : record.selectionSource === 'manual'
        ? 'manual'
        : null

  if (!applicationMode || !selectionSource) {
    throw new FertilizerMultiAreaApplicationRuntimeError(
      'Die Anwendung konnte nicht gespeichert werden.',
      'invalid_response',
    )
  }

  const applicationBatchId = String(record.applicationBatchId ?? '')
  const inventoryItemId = String(record.inventoryItemId ?? '')
  const savedProductProfileId = String(record.savedProductProfileId ?? '')
  const totalApplicationAmount = Number(record.totalApplicationAmount)
  const appliedAt = String(record.appliedAt ?? '')
  const resultingBalance = Number(record.resultingBalance)
  const movementId = String(record.movementId ?? '')

  if (
    !applicationBatchId ||
    !inventoryItemId ||
    !savedProductProfileId ||
    !Number.isFinite(totalApplicationAmount) ||
    !appliedAt ||
    !Number.isFinite(resultingBalance) ||
    !movementId
  ) {
    throw new FertilizerMultiAreaApplicationRuntimeError(
      'Die Anwendung konnte nicht gespeichert werden.',
      'invalid_response',
    )
  }

  const rawAreas = Array.isArray(record.areas) ? record.areas : []
  const areas: FertilizerMultiAreaApplicationAreaResult[] = rawAreas.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new FertilizerMultiAreaApplicationRuntimeError(
        'Die Anwendung konnte nicht gespeichert werden.',
        'invalid_response',
      )
    }

    const area = entry as Record<string, unknown>
    const areaApplicationUnit = area.applicationUnit
    const areaRateUnit = area.rateUnit

    if (areaApplicationUnit !== 'kg' && areaApplicationUnit !== 'ml') {
      throw new FertilizerMultiAreaApplicationRuntimeError(
        'Die Anwendung konnte nicht gespeichert werden.',
        'invalid_response',
      )
    }

    if (areaRateUnit !== 'g_per_sqm' && areaRateUnit !== 'ml_per_sqm') {
      throw new FertilizerMultiAreaApplicationRuntimeError(
        'Die Anwendung konnte nicht gespeichert werden.',
        'invalid_response',
      )
    }

    const areaId = String(area.areaId ?? '')
    const activityId = String(area.activityId ?? '')
    const fertilizationDetailId = String(area.fertilizationDetailId ?? '')
    const applicationAmount = Number(area.applicationAmount)
    const ratePerSqm = Number(area.ratePerSqm)
    const sortOrder = Number(area.sortOrder)

    if (
      !areaId ||
      !activityId ||
      !fertilizationDetailId ||
      !Number.isFinite(applicationAmount) ||
      !Number.isFinite(ratePerSqm) ||
      !Number.isFinite(sortOrder)
    ) {
      throw new FertilizerMultiAreaApplicationRuntimeError(
        'Die Anwendung konnte nicht gespeichert werden.',
        'invalid_response',
      )
    }

    return {
      areaId,
      activityId,
      fertilizationDetailId,
      applicationAmount,
      applicationUnit: areaApplicationUnit,
      ratePerSqm,
      rateUnit: areaRateUnit,
      sortOrder,
    }
  })

  return {
    applicationBatchId,
    inventoryItemId,
    savedProductProfileId,
    applicationMode,
    selectionSource,
    totalApplicationAmount,
    applicationUnit,
    appliedAt,
    resultingBalance,
    movementId,
    idempotentReplay: record.idempotentReplay === true,
    areas,
  }
}

export async function applyFertilizerInventoryItemToAreas(
  input: FertilizerMultiAreaApplicationCommandInput,
): Promise<FertilizerMultiAreaApplicationResult> {
  let normalized: NormalizedFertilizerMultiAreaApplication

  try {
    normalized = normalizeFertilizerMultiAreaApplication(input.domain)
  } catch (error) {
    if (error instanceof FertilizerMultiAreaApplicationError) {
      throw mapMultiAreaDomainError(error)
    }

    throw error
  }

  const rpcParams = buildMultiAreaApplicationSupabaseRpcParams({
    inventoryItemId: input.inventoryItemId,
    savedProductProfileId: input.savedProductProfileId,
    appliedAt: input.appliedAt,
    idempotencyKey: input.idempotencyKey,
    sourceEventRef: input.sourceEventRef?.trim() || null,
    note: input.note?.trim() || null,
    userId: input.userId,
    normalized,
  })

  const { data, error } = await supabase.rpc(
    APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREAS_RPC,
    rpcParams,
  )

  if (error) {
    throw mapMultiAreaApplicationRpcError(error)
  }

  try {
    return parseMultiAreaApplicationRpcResult(data)
  } catch (mappingError) {
    throw mapMultiAreaApplicationRpcError(mappingError)
  }
}
