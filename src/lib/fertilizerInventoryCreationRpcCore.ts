import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import type {
  FertilizerInventoryItem,
  FertilizerInventoryMovement,
} from '../types/fertilizerInventoryCore'
import type {
  FertilizerConfirmedSinglePackage,
  FertilizerInventoryCreationReason,
} from './fertilizerInventoryCreationCore'
import {
  FERTILIZER_INVENTORY_CREATION_MAX_CORRELATION_PREFIX_LENGTH,
  FERTILIZER_INVENTORY_CREATION_MAX_IDEMPOTENCY_KEY_LENGTH,
  FERTILIZER_INVENTORY_CREATION_MAX_SOURCE_EVENT_REF_LENGTH,
} from './fertilizerInventoryCreationCore'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import {
  FertilizerInventoryRepositoryError,
  type FertilizerInventoryRepositoryErrorCode,
} from './fertilizerInventoryRepositoryCore'
import {
  mapContainerRowToInventoryItem,
  mapMovementRowToInventoryMovement,
  validateStoredInventoryItemRecord,
  validateStoredInventoryMovementRecord,
  type FertilizerInventoryContainerRow,
  type FertilizerInventoryMovementRow,
} from './fertilizerInventoryRepositoryMappingCore'
import { assertInventoryQuantityPrecision } from './fertilizerInventoryQuantityCore'

export const INVENTORY_CREATION_MOVEMENT_IDEMPOTENCY_KEY_PREFIX = 'inventory-create:' as const

export function buildInventoryCreationMovementIdempotencyKey(
  receiptId: string,
  sequenceIndex: number,
): string {
  return `${INVENTORY_CREATION_MOVEMENT_IDEMPOTENCY_KEY_PREFIX}${receiptId}:${sequenceIndex}`
}

export const CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC =
  'create_fertilizer_inventory_core_from_confirmed_packages' as const

export const FERTILIZER_INVENTORY_CREATION_RPC_ERROR_CODES = [
  'INVENTORY_CREATION_PRODUCT_PROFILE_NOT_FOUND',
  'INVENTORY_CREATION_PRODUCT_PROFILE_NOT_READY',
  'INVENTORY_CREATION_ACCESS_DENIED',
  'INVENTORY_CREATION_PACKAGE_LIST_EMPTY',
  'INVENTORY_CREATION_PACKAGE_COUNT_EXCEEDED',
  'INVENTORY_CREATION_PACKAGE_INVALID',
  'INVENTORY_CREATION_PACKAGE_SIZE_INVALID',
  'INVENTORY_CREATION_INITIAL_QUANTITY_INVALID',
  'INVENTORY_CREATION_INITIAL_QUANTITY_EXCEEDS_PACKAGE_SIZE',
  'INVENTORY_CREATION_UNIT_MISMATCH',
  'INVENTORY_CREATION_REASON_INVALID',
  'INVENTORY_CREATION_IDEMPOTENCY_INVALID',
  'INVENTORY_CREATION_IDEMPOTENCY_CONFLICT',
  'INVENTORY_CREATION_FAILED',
] as const

export type FertilizerInventoryCreationRpcErrorCode =
  (typeof FERTILIZER_INVENTORY_CREATION_RPC_ERROR_CODES)[number]

const RPC_ERROR_TO_REPOSITORY_CODE: Record<
  FertilizerInventoryCreationRpcErrorCode,
  FertilizerInventoryRepositoryErrorCode
> = {
  INVENTORY_CREATION_PRODUCT_PROFILE_NOT_FOUND: 'product_profile_not_found',
  INVENTORY_CREATION_PRODUCT_PROFILE_NOT_READY: 'product_profile_not_ready',
  INVENTORY_CREATION_ACCESS_DENIED: 'access_denied',
  INVENTORY_CREATION_PACKAGE_LIST_EMPTY: 'package_list_empty',
  INVENTORY_CREATION_PACKAGE_COUNT_EXCEEDED: 'package_count_exceeded',
  INVENTORY_CREATION_PACKAGE_INVALID: 'package_invalid',
  INVENTORY_CREATION_PACKAGE_SIZE_INVALID: 'package_size_invalid',
  INVENTORY_CREATION_INITIAL_QUANTITY_INVALID: 'initial_quantity_invalid',
  INVENTORY_CREATION_INITIAL_QUANTITY_EXCEEDS_PACKAGE_SIZE:
    'initial_quantity_exceeds_package_size',
  INVENTORY_CREATION_UNIT_MISMATCH: 'unit_mismatch',
  INVENTORY_CREATION_REASON_INVALID: 'creation_reason_invalid',
  INVENTORY_CREATION_IDEMPOTENCY_INVALID: 'creation_idempotency_invalid',
  INVENTORY_CREATION_IDEMPOTENCY_CONFLICT: 'creation_idempotency_conflict',
  INVENTORY_CREATION_FAILED: 'creation_failed',
}

export interface CreateFertilizerInventoryCoreFromConfirmedPackagesRpcPackage {
  sequence_index: number
  package_size_value: number
  package_size_unit: FertilizerConfirmedSinglePackage['packageSizeUnit']
  initial_quantity_value: number
  initial_quantity_unit: FertilizerConfirmedSinglePackage['initialQuantityUnit']
  client_correlation_id: string | null
}

export interface CreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams {
  p_saved_product_profile_id: string
  p_access_kind: 'authenticated_user' | 'session'
  p_user_id: string | null
  p_session_access_hash: string | null
  p_creation_reason: FertilizerInventoryCreationReason
  p_idempotency_key: string
  p_source_event_ref: string | null
  p_packages: CreateFertilizerInventoryCoreFromConfirmedPackagesRpcPackage[]
}

export interface CreatedFertilizerInventoryPackageRpcResult {
  sequence_index: number
  client_correlation_id: string | null
  item: FertilizerInventoryContainerRow
  initial_movement: FertilizerInventoryMovementRow
}

export interface CreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult {
  operation_id: string
  idempotency_key: string
  packages: CreatedFertilizerInventoryPackageRpcResult[]
}

export interface CreatedFertilizerInventoryPackageResult {
  sequenceIndex: number
  clientCorrelationId?: string
  item: FertilizerInventoryItem
  initialMovement: FertilizerInventoryMovement
}

export interface CreateFertilizerInventoryFromConfirmedPackagesRpcMappedResult {
  operationId: string
  idempotencyKey: string
  packages: CreatedFertilizerInventoryPackageResult[]
}

export interface CreateFertilizerInventoryItemsWithInitialMovementsInput {
  savedProductProfileId: string
  creationReason: FertilizerInventoryCreationReason
  idempotencyKey: string
  sourceEventRef?: string | null
  packages: FertilizerConfirmedSinglePackage[]
}

export type CreateFertilizerInventoryItemsWithInitialMovementsResult =
  CreateFertilizerInventoryFromConfirmedPackagesRpcMappedResult

function resolveSessionAccessHash(
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): string {
  if (accessContext.kind !== 'session') {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Session access hash derivation is required for session-scoped inventory access.',
    )
  }

  return deriveSessionAccessHash(accessContext.sessionId)
}

function serializeRpcPackage(
  pkg: FertilizerConfirmedSinglePackage,
): CreateFertilizerInventoryCoreFromConfirmedPackagesRpcPackage {
  assertInventoryQuantityPrecision(pkg.packageSizeValue, 'packageSizeValue')
  assertInventoryQuantityPrecision(pkg.initialQuantityValue, 'initialQuantityValue')

  return {
    sequence_index: pkg.sequenceIndex,
    package_size_value: pkg.packageSizeValue,
    package_size_unit: pkg.packageSizeUnit,
    initial_quantity_value: pkg.initialQuantityValue,
    initial_quantity_unit: pkg.initialQuantityUnit,
    client_correlation_id: pkg.clientCorrelationId ?? null,
  }
}

export function buildCreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams(
  input: CreateFertilizerInventoryItemsWithInitialMovementsInput,
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): CreateFertilizerInventoryCoreFromConfirmedPackagesRpcParams {
  const packages = [...input.packages]
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
    .map(serializeRpcPackage)

  if (accessContext.kind === 'authenticated_user') {
    return {
      p_saved_product_profile_id: input.savedProductProfileId,
      p_access_kind: 'authenticated_user',
      p_user_id: accessContext.userId,
      p_session_access_hash: null,
      p_creation_reason: input.creationReason,
      p_idempotency_key: input.idempotencyKey,
      p_source_event_ref: input.sourceEventRef ?? null,
      p_packages: packages,
    }
  }

  return {
    p_saved_product_profile_id: input.savedProductProfileId,
    p_access_kind: 'session',
    p_user_id: null,
    p_session_access_hash: resolveSessionAccessHash(accessContext, deriveSessionAccessHash),
    p_creation_reason: input.creationReason,
    p_idempotency_key: input.idempotencyKey,
    p_source_event_ref: input.sourceEventRef ?? null,
    p_packages: packages,
  }
}

function extractRpcErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const parts = [record.message, record.details, record.hint, record.code]
      .filter((value) => typeof value === 'string')
      .map(String)

    return parts.join(' ')
  }

  return ''
}

export function mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcError(
  error: unknown,
): FertilizerInventoryRepositoryError {
  const message = extractRpcErrorMessage(error)

  for (const rpcCode of FERTILIZER_INVENTORY_CREATION_RPC_ERROR_CODES) {
    if (message.includes(rpcCode)) {
      return new FertilizerInventoryRepositoryError(
        RPC_ERROR_TO_REPOSITORY_CODE[rpcCode],
        `Inventory creation failed (${rpcCode}).`,
      )
    }
  }

  return new FertilizerInventoryRepositoryError(
    'persistence_unavailable',
    'Inventory creation failed.',
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOptionalString(value: unknown): string | undefined {
  if (value == null) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory creation RPC returned an invalid client correlation id.',
    )
  }

  return value
}

function mapRpcPackageResult(value: unknown): CreatedFertilizerInventoryPackageResult {
  if (!isRecord(value)) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory creation RPC returned an invalid package entry.',
    )
  }

  if (typeof value.sequence_index !== 'number' || !Number.isInteger(value.sequence_index)) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory creation RPC returned an invalid sequence_index.',
    )
  }

  const clientCorrelationId = readOptionalString(value.client_correlation_id)

  if (!isRecord(value.item)) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory creation RPC returned an invalid item payload.',
    )
  }

  if (!isRecord(value.initial_movement)) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory creation RPC returned an invalid initial movement payload.',
    )
  }

  const item = mapContainerRowToInventoryItem(value.item as unknown as FertilizerInventoryContainerRow)
  validateStoredInventoryItemRecord(item)

  const initialMovement = mapMovementRowToInventoryMovement(
    value.initial_movement as unknown as FertilizerInventoryMovementRow,
  )
  validateStoredInventoryMovementRecord(initialMovement)

  return {
    sequenceIndex: value.sequence_index,
    clientCorrelationId,
    item,
    initialMovement,
  }
}

export function mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult(
  payload: unknown,
): CreateFertilizerInventoryFromConfirmedPackagesRpcMappedResult {
  if (!isRecord(payload)) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory creation RPC returned an empty payload.',
    )
  }

  if (typeof payload.operation_id !== 'string' || !payload.operation_id) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory creation RPC returned an invalid operation_id.',
    )
  }

  if (typeof payload.idempotency_key !== 'string' || !payload.idempotency_key) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory creation RPC returned an invalid idempotency_key.',
    )
  }

  if (!Array.isArray(payload.packages)) {
    throw new FertilizerInventoryRepositoryError(
      'invalid_stored_record',
      'Inventory creation RPC returned an invalid packages array.',
    )
  }

  const packages = payload.packages.map(mapRpcPackageResult).sort((left, right) => {
    return left.sequenceIndex - right.sequenceIndex
  })

  return {
    operationId: payload.operation_id,
    idempotencyKey: payload.idempotency_key,
    packages,
  }
}

export {
  FERTILIZER_INVENTORY_CREATION_MAX_CORRELATION_PREFIX_LENGTH,
  FERTILIZER_INVENTORY_CREATION_MAX_IDEMPOTENCY_KEY_LENGTH,
  FERTILIZER_INVENTORY_CREATION_MAX_SOURCE_EVENT_REF_LENGTH,
}
