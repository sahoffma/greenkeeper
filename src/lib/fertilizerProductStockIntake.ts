import { supabase } from './supabase'
import { getErrorMessage } from './errors'
import {
  validateFertilizerProductStockIntake,
  type FertilizerProductStockIntakeReason,
} from './fertilizerProductStockCore'
import {
  buildRecordFertilizerProductStockIntakeRpcParams,
  mapRecordFertilizerProductStockIntakeRpcError,
  mapRecordFertilizerProductStockIntakeRpcResult,
  RECORD_FERTILIZER_PRODUCT_STOCK_INTAKE_RPC,
  type RecordFertilizerProductStockIntakeMappedResult,
} from './fertilizerProductStockIntakeRpcCore'
import {
  validateFertilizerProductStockOutbound,
  type FertilizerProductStockOutboundReason,
} from './fertilizerProductStockOutboundCore'
import {
  buildRecordFertilizerProductStockOutboundRpcParams,
  mapRecordFertilizerProductStockOutboundRpcError,
  mapRecordFertilizerProductStockOutboundRpcResult,
  RECORD_FERTILIZER_PRODUCT_STOCK_OUTBOUND_RPC,
  type RecordFertilizerProductStockOutboundMappedResult,
} from './fertilizerProductStockOutboundRpcCore'
import { FertilizerInventoryRepositoryError } from './fertilizerInventoryRepositoryCore'

const INTAKE_ERROR_MESSAGES: Record<string, string> = {
  INVENTORY_INTAKE_ACCESS_DENIED: 'Bitte melde dich erneut an.',
  INVENTORY_INTAKE_PRODUCT_PROFILE_NOT_FOUND: 'Das Produktprofil wurde nicht gefunden.',
  INVENTORY_INTAKE_PRODUCT_PROFILE_NOT_READY: 'Das Produkt ist noch nicht bereit.',
  INVENTORY_INTAKE_UNIT_MISMATCH: 'Die Einheit passt nicht zum Produkt.',
  INVENTORY_INTAKE_QUANTITY_INVALID: 'Die Menge ist ungültig.',
  INVENTORY_INTAKE_REASON_INVALID: 'Der Bestandsgrund ist ungültig.',
  INVENTORY_INTAKE_IDEMPOTENCY_INVALID: 'Der Speichervorgang konnte nicht gestartet werden.',
  INVENTORY_INTAKE_IDEMPOTENCY_CONFLICT: 'Diese Buchung wurde bereits mit anderen Daten gestartet.',
  INVENTORY_INTAKE_FAILED: 'Der Zugang konnte nicht gespeichert werden.',
}

const OUTBOUND_ERROR_MESSAGES: Record<string, string> = {
  INVENTORY_OUTBOUND_ACCESS_DENIED: 'Bitte melde dich erneut an.',
  INVENTORY_OUTBOUND_ITEM_NOT_FOUND: 'Der Bestand wurde nicht gefunden.',
  INVENTORY_OUTBOUND_ITEM_INACTIVE: 'Für diesen Bestand sind keine Buchungen möglich.',
  INVENTORY_OUTBOUND_QUANTITY_INVALID: 'Die Menge ist ungültig.',
  INVENTORY_OUTBOUND_REASON_INVALID: 'Der Abgangsgrund ist ungültig.',
  INVENTORY_OUTBOUND_INSUFFICIENT_STOCK: 'Der Bestand reicht für diese Buchung nicht aus.',
  INVENTORY_OUTBOUND_IDEMPOTENCY_INVALID: 'Der Speichervorgang konnte nicht gestartet werden.',
  INVENTORY_OUTBOUND_IDEMPOTENCY_CONFLICT:
    'Diese Buchung wurde bereits mit anderen Daten gestartet.',
  INVENTORY_OUTBOUND_FAILED: 'Der Abgang konnte nicht gespeichert werden.',
}

function mapRpcErrorMessage(
  error: unknown,
  fallback: string,
  codeMap: Record<string, string>,
): Error {
  const message = getErrorMessage(error, fallback)

  for (const [code, userMessage] of Object.entries(codeMap)) {
    if (message.includes(code)) {
      return new Error(userMessage)
    }
  }

  return new Error(fallback)
}

export class FertilizerProductStockPersistenceError extends Error {
  readonly code: string

  constructor(message: string, code = 'product_stock_persistence_failed') {
    super(message)
    this.name = 'FertilizerProductStockPersistenceError'
    this.code = code
  }
}

export interface RecordFertilizerProductStockIntakeInput {
  userId: string
  savedProductProfileId: string
  baseUnit: 'kg' | 'ml'
  quantity: number
  reason: FertilizerProductStockIntakeReason
  idempotencyKey: string
  sourceEventRef?: string | null
  note?: string | null
}

export interface RecordFertilizerProductStockOutboundInput {
  inventoryItemId: string
  reason: FertilizerProductStockOutboundReason
  quantity: number
  idempotencyKey: string
  note?: string | null
}

export async function recordFertilizerProductStockIntake(
  input: RecordFertilizerProductStockIntakeInput,
): Promise<RecordFertilizerProductStockIntakeMappedResult> {
  try {
    const validated = validateFertilizerProductStockIntake({
      userId: input.userId,
      savedProductProfileId: input.savedProductProfileId,
      baseUnit: input.baseUnit,
      quantity: input.quantity,
      reason: input.reason,
    })

    const rpcParams = buildRecordFertilizerProductStockIntakeRpcParams({
      validated,
      idempotencyKey: input.idempotencyKey,
      sourceEventRef: input.sourceEventRef ?? null,
      note: input.note ?? null,
    })

    const { data, error } = await supabase.rpc(
      RECORD_FERTILIZER_PRODUCT_STOCK_INTAKE_RPC,
      rpcParams,
    )

    if (error) {
      throw mapRecordFertilizerProductStockIntakeRpcError(error)
    }

    return mapRecordFertilizerProductStockIntakeRpcResult(data)
  } catch (error) {
    if (error instanceof FertilizerInventoryRepositoryError) {
      throw mapRpcErrorMessage(error, 'Der Zugang konnte nicht gespeichert werden.', INTAKE_ERROR_MESSAGES)
    }

    if (error instanceof Error) {
      throw error
    }

    throw new FertilizerProductStockPersistenceError('Der Zugang konnte nicht gespeichert werden.')
  }
}

export async function recordFertilizerProductStockOutbound(
  input: RecordFertilizerProductStockOutboundInput,
): Promise<RecordFertilizerProductStockOutboundMappedResult> {
  try {
    const validated = validateFertilizerProductStockOutbound({
      inventoryItemId: input.inventoryItemId,
      reason: input.reason,
      quantity: input.quantity,
      note: input.note ?? null,
    })

    const rpcParams = buildRecordFertilizerProductStockOutboundRpcParams({
      validated,
      idempotencyKey: input.idempotencyKey,
    })

    const { data, error } = await supabase.rpc(
      RECORD_FERTILIZER_PRODUCT_STOCK_OUTBOUND_RPC,
      rpcParams,
    )

    if (error) {
      throw mapRecordFertilizerProductStockOutboundRpcError(error)
    }

    return mapRecordFertilizerProductStockOutboundRpcResult(data)
  } catch (error) {
    if (error instanceof FertilizerInventoryRepositoryError) {
      throw mapRpcErrorMessage(error, 'Der Abgang konnte nicht gespeichert werden.', OUTBOUND_ERROR_MESSAGES)
    }

    if (error instanceof Error) {
      throw error
    }

    throw new FertilizerProductStockPersistenceError('Der Abgang konnte nicht gespeichert werden.')
  }
}
