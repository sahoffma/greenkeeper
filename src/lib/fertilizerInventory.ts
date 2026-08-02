import { supabase } from './supabase'
import { getErrorMessage } from './errors'
import type {
  FertilizerCaptureSaveResult,
  FertilizerProductStockStatus,
  FertilizerRecognitionCandidatePayload,
  FertilizerStockListItem,
} from '../types/fertilizerInventory'
import { parseStockStatusPayload } from './fertilizerInventoryCore'
import { partitionFertilizerStockListItems } from './fertilizerInventoryStockListCore'
import {
  GET_ACTIVE_FERTILIZER_PRODUCT_STOCK_ITEM_RPC,
  LIST_ACTIVE_FERTILIZER_PRODUCT_STOCK_RPC,
  mapActiveProductStockRowToListItem,
  mapActiveProductStockRowsToListItems,
  parseActiveProductStockItemPayload,
  parseActiveProductStockListPayload,
} from './fertilizerProductStockReadCore'

const INVENTORY_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Bitte melde dich erneut an.',
  PRODUCT_REFERENCE_REQUIRED: 'Das Produkt konnte nicht eindeutig zugeordnet werden.',
  IDEMPOTENCY_KEY_REQUIRED: 'Der Speichervorgang konnte nicht gestartet werden.',
  INVALID_PURCHASE_QUANTITY: 'Die Kaufmenge ist ungültig.',
  INVALID_PURCHASE_UNIT: 'Die Einheit ist ungültig.',
  INVALID_PREVIOUS_REMAINDER: 'Der frühere Restbestand ist ungültig.',
  CATALOG_PRODUCT_NOT_FOUND: 'Das Katalogprodukt ist nicht mehr verfügbar.',
  CATALOG_AND_CANDIDATE_CONFLICT: 'Produktzuordnung ist widersprüchlich.',
  CANDIDATE_FINGERPRINT_REQUIRED: 'Das erkannte Produkt ist nicht eindeutig genug.',
}

function mapInventoryError(error: unknown, fallback: string): Error {
  const message = getErrorMessage(error, fallback)

  for (const [code, userMessage] of Object.entries(INVENTORY_ERROR_MESSAGES)) {
    if (message.includes(code)) {
      return new Error(userMessage)
    }
  }

  return new Error(fallback)
}

function parseSaveResult(payload: unknown): FertilizerCaptureSaveResult {
  const record = payload as Record<string, unknown>

  return {
    receiptId: String(record.receipt_id ?? ''),
    containerId: String(record.container_id ?? ''),
    catalogProductId:
      typeof record.catalog_product_id === 'string' ? record.catalog_product_id : null,
    recognitionCandidateId:
      typeof record.recognition_candidate_id === 'string'
        ? record.recognition_candidate_id
        : null,
    productProfileId:
      typeof record.product_profile_id === 'string' ? record.product_profile_id : null,
    productLabel: String(record.product_label ?? 'Dünger'),
    purchaseQuantity: Number(record.purchase_quantity ?? 0),
    purchaseUnit: String(record.purchase_unit ?? 'kg'),
    previousRemainder:
      typeof record.previous_remainder === 'number' ? record.previous_remainder : null,
    resultingBalance: Number(record.resulting_balance ?? 0),
    idempotentReplay: record.idempotent_replay === true,
  }
}

export async function fetchFertilizerProductStockStatus(input: {
  catalogProductId?: string | null
  identityFingerprint?: string | null
  unit?: string
}): Promise<FertilizerProductStockStatus> {
  const { data, error } = await supabase.rpc('get_fertilizer_product_stock_status', {
    p_catalog_product_id: input.catalogProductId ?? null,
    p_identity_fingerprint: input.identityFingerprint ?? null,
    p_unit: input.unit ?? 'kg',
  })

  if (error) {
    throw mapInventoryError(error, 'Der Bestand konnte nicht geprüft werden.')
  }

  return parseStockStatusPayload(data)
}

export async function saveFertilizerCapture(input: {
  idempotencyKey: string
  catalogProductId?: string | null
  candidate?: FertilizerRecognitionCandidatePayload | null
  purchaseQuantity: number
  purchaseUnit: string
  previousRemainder?: number | null
  packageCount?: number
  productLabel: string
}): Promise<FertilizerCaptureSaveResult> {
  const { data, error } = await supabase.rpc('save_fertilizer_capture', {
    p_idempotency_key: input.idempotencyKey,
    p_catalog_product_id: input.catalogProductId ?? null,
    p_candidate: input.candidate ?? null,
    p_purchase_quantity: input.purchaseQuantity,
    p_purchase_unit: input.purchaseUnit,
    p_previous_remainder: input.previousRemainder ?? null,
    p_package_count: input.packageCount ?? 1,
    p_product_label: input.productLabel,
  })

  if (error) {
    throw mapInventoryError(error, 'Der Dünger konnte nicht gespeichert werden.')
  }

  return parseSaveResult(data)
}

export interface FertilizerStockListView {
  inStock: FertilizerStockListItem[]
  outOfStock: FertilizerStockListItem[]
}

export async function fetchFertilizerStockList(): Promise<FertilizerStockListView> {
  const { data, error } = await supabase.rpc(LIST_ACTIVE_FERTILIZER_PRODUCT_STOCK_RPC)

  if (error) {
    throw mapInventoryError(error, 'Der Düngerbestand konnte nicht geladen werden.')
  }

  const payload = parseActiveProductStockListPayload(data)
  const items = mapActiveProductStockRowsToListItems(payload.items)

  return partitionFertilizerStockListItems(items)
}

export async function fetchFertilizerStockListItem(
  containerId: string,
): Promise<FertilizerStockListItem | null> {
  const { data, error } = await supabase.rpc(GET_ACTIVE_FERTILIZER_PRODUCT_STOCK_ITEM_RPC, {
    p_inventory_item_id: containerId,
  })

  if (error) {
    throw mapInventoryError(error, 'Das Gebinde konnte nicht geladen werden.')
  }

  const row = parseActiveProductStockItemPayload(data)
  if (!row) {
    return null
  }

  return mapActiveProductStockRowToListItem(row)
}

export {
  FERTILIZER_STOCK_LIST_CONTAINER_SELECT,
  partitionFertilizerStockListItems,
  projectFertilizerStockListItem,
} from './fertilizerInventoryStockListCore'
