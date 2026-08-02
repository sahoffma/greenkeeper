import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import type {
  CreateFertilizerInventoryItemsWithInitialMovementsInput,
  CreateFertilizerInventoryItemsWithInitialMovementsResult,
} from './fertilizerInventoryCreationRpcCore'
import {
  CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC,
  mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcError,
  mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult,
} from './fertilizerInventoryCreationRpcCore'
import {
  FertilizerInventoryCreationError,
  normalizeFertilizerInventoryCreationInput,
  type CreateFertilizerInventoryFromConfirmedPackagesInput,
  type FertilizerInventoryCreationReason,
} from './fertilizerInventoryCreationCore'
import { FertilizerInventoryRepositoryError } from './fertilizerInventoryRepositoryCore'
import { supabase } from './supabase'

export class FertilizerInventoryCreationRuntimeError extends Error {
  readonly code: string

  constructor(message: string, code = 'creation_failed') {
    super(message)
    this.name = 'FertilizerInventoryCreationRuntimeError'
    this.code = code
  }
}

const CREATION_ERROR_MESSAGES: Record<string, string> = {
  product_profile_not_found: 'Das Produktprofil wurde nicht gefunden.',
  product_profile_not_ready: 'Das Produktprofil ist noch nicht bereit.',
  access_denied: 'Bitte melde dich erneut an.',
  package_list_empty: 'Es fehlen bestätigte Packungen.',
  package_count_exceeded: 'Es sind zu viele Packungen ausgewählt.',
  package_invalid: 'Eine bestätigte Packung ist ungültig.',
  package_size_invalid: 'Die Packungsgröße ist ungültig.',
  initial_quantity_invalid: 'Die bestätigte Menge ist ungültig.',
  initial_quantity_exceeds_package_size: 'Die Menge darf die Packungsgröße nicht überschreiten.',
  unit_mismatch: 'Die Einheit passt nicht zum Produkt.',
  creation_reason_invalid: 'Der Bestandsgrund ist ungültig.',
  creation_idempotency_invalid: 'Der Speichervorgang konnte nicht gestartet werden.',
  creation_idempotency_conflict: 'Dieser Speichervorgang widerspricht einer früheren Anfrage.',
  creation_failed: 'Der Bestand konnte nicht gespeichert werden.',
  persistence_unavailable: 'Der Bestand konnte gerade nicht gespeichert werden.',
}

export interface CreateFertilizerInventoryFromCaptureInput {
  savedProductProfileId: string
  userId: string
  creationReason: FertilizerInventoryCreationReason
  idempotencyKey: string
  sourceEventRef?: string | null
  confirmedPackageGroups: CreateFertilizerInventoryFromConfirmedPackagesInput['confirmedPackageGroups']
}

export interface CreateFertilizerInventoryFromCaptureResult
  extends CreateFertilizerInventoryItemsWithInitialMovementsResult {
  packageCount: number
  totalInitialQuantity: number
  baseUnit: string
}

function mapCreationDomainError(error: FertilizerInventoryCreationError): FertilizerInventoryCreationRuntimeError {
  return new FertilizerInventoryCreationRuntimeError(error.message, error.code)
}

function mapCreationRepositoryError(error: unknown): FertilizerInventoryCreationRuntimeError {
  if (error instanceof FertilizerInventoryRepositoryError) {
    const message =
      CREATION_ERROR_MESSAGES[error.code] ?? 'Der Bestand konnte nicht gespeichert werden.'

    return new FertilizerInventoryCreationRuntimeError(message, error.code)
  }

  const mapped = mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcError(error)
  const message =
    CREATION_ERROR_MESSAGES[mapped.code] ?? 'Der Bestand konnte nicht gespeichert werden.'

  return new FertilizerInventoryCreationRuntimeError(message, mapped.code)
}

export function buildAuthenticatedInventoryAccessContext(userId: string): FertilizerEnrichmentAccessContext {
  return { kind: 'authenticated_user', userId }
}

export function buildInventoryCreationRpcParamsFromCaptureInput(
  input: CreateFertilizerInventoryFromCaptureInput,
): CreateFertilizerInventoryItemsWithInitialMovementsInput {
  const accessContext = buildAuthenticatedInventoryAccessContext(input.userId)
  const normalized = normalizeFertilizerInventoryCreationInput({
    savedProductProfileId: input.savedProductProfileId,
    accessContext,
    creationReason: input.creationReason,
    idempotencyKey: input.idempotencyKey,
    sourceEventRef: input.sourceEventRef ?? null,
    confirmedPackageGroups: input.confirmedPackageGroups,
  })

  return {
    savedProductProfileId: normalized.savedProductProfileId,
    creationReason: normalized.creationReason,
    idempotencyKey: normalized.idempotencyKey,
    sourceEventRef: normalized.sourceEventRef,
    packages: normalized.packages,
  }
}

export function buildAuthenticatedInventoryCreationSupabaseRpcParams(
  rpcInput: CreateFertilizerInventoryItemsWithInitialMovementsInput,
  userId: string,
) {
  const packages = [...rpcInput.packages]
    .sort((left, right) => left.sequenceIndex - right.sequenceIndex)
    .map((pkg) => ({
      sequence_index: pkg.sequenceIndex,
      package_size_value: pkg.packageSizeValue,
      package_size_unit: pkg.packageSizeUnit,
      initial_quantity_value: pkg.initialQuantityValue,
      initial_quantity_unit: pkg.initialQuantityUnit,
      client_correlation_id: pkg.clientCorrelationId ?? null,
    }))

  return {
    p_saved_product_profile_id: rpcInput.savedProductProfileId,
    p_access_kind: 'authenticated_user' as const,
    p_user_id: userId,
    p_session_access_hash: null,
    p_creation_reason: rpcInput.creationReason,
    p_idempotency_key: rpcInput.idempotencyKey,
    p_source_event_ref: rpcInput.sourceEventRef ?? null,
    p_packages: packages,
  }
}

export async function createFertilizerInventoryFromCapture(
  input: CreateFertilizerInventoryFromCaptureInput,
): Promise<CreateFertilizerInventoryFromCaptureResult> {
  let rpcInput: CreateFertilizerInventoryItemsWithInitialMovementsInput

  try {
    rpcInput = buildInventoryCreationRpcParamsFromCaptureInput(input)
  } catch (error) {
    if (error instanceof FertilizerInventoryCreationError) {
      throw mapCreationDomainError(error)
    }

    throw error
  }

  const rpcParams = buildAuthenticatedInventoryCreationSupabaseRpcParams(rpcInput, input.userId)

  const { data, error } = await supabase.rpc(
    CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC,
    rpcParams,
  )

  if (error) {
    throw mapCreationRepositoryError(error)
  }

  let mapped: CreateFertilizerInventoryItemsWithInitialMovementsResult
  try {
    mapped = mapCreateFertilizerInventoryCoreFromConfirmedPackagesRpcResult(data)
  } catch (mappingError) {
    throw mapCreationRepositoryError(mappingError)
  }
  const totalInitialQuantity = mapped.packages.reduce(
    (sum, entry) => sum + entry.initialMovement.quantityDelta,
    0,
  )

  return {
    ...mapped,
    packageCount: mapped.packages.length,
    totalInitialQuantity,
    baseUnit: mapped.packages[0]?.item.baseUnit ?? 'kg',
  }
}

export { CREATE_FERTILIZER_INVENTORY_CORE_FROM_CONFIRMED_PACKAGES_RPC }
