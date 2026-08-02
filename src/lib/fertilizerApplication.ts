import { supabase } from './supabase'
import {
  APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREA_RPC,
  FERTILIZER_APPLICATION_ERROR_CODES,
  FertilizerApplicationError,
  normalizeFertilizerApplicationCommand,
  type FertilizerApplicationCommandInput,
  type FertilizerApplicationErrorCode,
  type FertilizerApplicationResult,
  type NormalizedFertilizerApplicationCommand,
} from './fertilizerApplicationCore'
import { isFertilizerInventoryBaseUnit } from '../types/fertilizerInventoryCore'

export class FertilizerApplicationRuntimeError extends Error {
  readonly code: string

  constructor(message: string, code = 'application_failed') {
    super(message)
    this.name = 'FertilizerApplicationRuntimeError'
    this.code = code
  }
}

const APPLICATION_ERROR_MESSAGES: Record<FertilizerApplicationErrorCode, string> = {
  NOT_AUTHENTICATED: 'Bitte melde dich erneut an.',
  INVENTORY_ITEM_NOT_FOUND: 'Dieses Gebinde wurde nicht gefunden.',
  INVENTORY_ITEM_NOT_ACCESSIBLE: 'Dieses Gebinde kann nicht angewendet werden.',
  PRODUCT_PROFILE_MISMATCH: 'Dieses Gebinde kann noch nicht angewendet werden.',
  APPLICATION_TARGET_NOT_FOUND: 'Die gewählte Fläche wurde nicht gefunden.',
  APPLICATION_TARGET_NOT_ACCESSIBLE: 'Die gewählte Fläche ist nicht mehr verfügbar.',
  APPLICATION_AMOUNT_INVALID: 'Die Menge ist ungültig.',
  APPLICATION_AMOUNT_PRECISION_INVALID: 'Die Menge darf höchstens vier Dezimalstellen haben.',
  APPLICATION_UNIT_INVALID: 'Die Einheit ist ungültig.',
  APPLICATION_UNIT_MISMATCH: 'Die Einheit passt nicht zum Gebinde.',
  INSUFFICIENT_STOCK: 'Der Bestand reicht nicht aus.',
  APPLICATION_DATE_INVALID: 'Das Anwendungsdatum ist ungültig.',
  IDEMPOTENCY_CONFLICT: 'Diese Anwendung widerspricht einer früheren Anfrage.',
  APPLICATION_PERSISTENCE_FAILED: 'Die Anwendung konnte nicht gespeichert werden.',
}

function extractApplicationErrorCode(message: string): FertilizerApplicationErrorCode | null {
  for (const code of FERTILIZER_APPLICATION_ERROR_CODES) {
    if (message.includes(`FERTILIZER_APPLICATION_${code}`)) {
      return code
    }
  }

  return null
}

function mapApplicationDomainError(error: FertilizerApplicationError): FertilizerApplicationRuntimeError {
  return new FertilizerApplicationRuntimeError(
    APPLICATION_ERROR_MESSAGES[error.code] ?? 'Die Anwendung konnte nicht gespeichert werden.',
    error.code,
  )
}

export function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }

  return String(error)
}

export function mapApplicationRpcError(error: unknown): FertilizerApplicationRuntimeError {
  if (error instanceof FertilizerApplicationRuntimeError) {
    return error
  }

  const message = readErrorMessage(error)
  const code = extractApplicationErrorCode(message)

  if (code) {
    return new FertilizerApplicationRuntimeError(APPLICATION_ERROR_MESSAGES[code], code)
  }

  return new FertilizerApplicationRuntimeError(
    'Die Anwendung konnte nicht gespeichert werden.',
    'application_failed',
  )
}

export function buildApplicationSupabaseRpcParams(
  command: NormalizedFertilizerApplicationCommand,
): Record<string, unknown> {
  return {
    p_inventory_item_id: command.inventoryItemId,
    p_saved_product_profile_id: command.savedProductProfileId,
    p_area_id: command.targetId,
    p_application_amount: command.applicationAmount,
    p_application_unit: command.applicationUnit,
    p_applied_at: command.appliedAt,
    p_idempotency_key: command.idempotencyKey,
    p_source_event_ref: command.sourceEventRef,
    p_note: command.note,
    p_user_id: command.userId,
  }
}

export function parseApplicationRpcResult(payload: unknown): FertilizerApplicationResult {
  if (!payload || typeof payload !== 'object') {
    throw new FertilizerApplicationRuntimeError(
      'Die Anwendung konnte nicht gespeichert werden.',
      'invalid_response',
    )
  }

  const record = payload as Record<string, unknown>
  const applicationUnit = record.applicationUnit

  if (applicationUnit !== 'kg' && applicationUnit !== 'ml') {
    throw new FertilizerApplicationRuntimeError(
      'Die Anwendung konnte nicht gespeichert werden.',
      'invalid_response',
    )
  }

  if (!isFertilizerInventoryBaseUnit(applicationUnit)) {
    throw new FertilizerApplicationRuntimeError(
      'Die Anwendung konnte nicht gespeichert werden.',
      'invalid_response',
    )
  }

  const activityId = String(record.activityId ?? '')
  const movementId = String(record.movementId ?? '')
  const inventoryItemId = String(record.inventoryItemId ?? '')
  const savedProductProfileId = String(record.savedProductProfileId ?? '')
  const targetId = String(record.targetId ?? '')
  const applicationAmount = Number(record.applicationAmount)
  const appliedAt = String(record.appliedAt ?? '')
  const resultingBalance = Number(record.resultingBalance)

  if (
    !activityId ||
    !movementId ||
    !inventoryItemId ||
    !savedProductProfileId ||
    !targetId ||
    !Number.isFinite(applicationAmount) ||
    !appliedAt ||
    !Number.isFinite(resultingBalance)
  ) {
    throw new FertilizerApplicationRuntimeError(
      'Die Anwendung konnte nicht gespeichert werden.',
      'invalid_response',
    )
  }

  if (record.targetKind !== 'area') {
    throw new FertilizerApplicationRuntimeError(
      'Die Anwendung konnte nicht gespeichert werden.',
      'invalid_response',
    )
  }

  return {
    activityId,
    movementId,
    inventoryItemId,
    savedProductProfileId,
    targetKind: 'area',
    targetId,
    applicationAmount,
    applicationUnit,
    appliedAt,
    resultingBalance,
    idempotentReplay: record.idempotentReplay === true,
  }
}

export async function applyFertilizerInventoryItemToArea(
  input: FertilizerApplicationCommandInput,
): Promise<FertilizerApplicationResult> {
  let normalized: NormalizedFertilizerApplicationCommand

  try {
    normalized = normalizeFertilizerApplicationCommand(input)
  } catch (error) {
    if (error instanceof FertilizerApplicationError) {
      throw mapApplicationDomainError(error)
    }

    throw error
  }

  const { data, error } = await supabase.rpc(
    APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREA_RPC,
    buildApplicationSupabaseRpcParams(normalized),
  )

  if (error) {
    throw mapApplicationRpcError(error)
  }

  try {
    return parseApplicationRpcResult(data)
  } catch (mappingError) {
    throw mapApplicationRpcError(mappingError)
  }
}

export { APPLY_FERTILIZER_INVENTORY_ITEM_TO_AREA_RPC }
