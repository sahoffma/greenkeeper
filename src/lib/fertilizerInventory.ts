import { supabase } from './supabase'
import { getErrorMessage } from './errors'
import type {
  FertilizerCaptureSaveResult,
  FertilizerProductStockStatus,
  FertilizerRecognitionCandidatePayload,
  FertilizerStockListItem,
} from '../types/fertilizerInventory'
import { parseStockStatusPayload } from './fertilizerInventoryCore'

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

export async function fetchFertilizerStockList(): Promise<FertilizerStockListItem[]> {
  const { data: containers, error: containersError } = await supabase
    .from('fertilizer_containers')
    .select(
      `
      id,
      product_id,
      recognition_candidate_id,
      package_size_unit,
      label,
      fertilizer_recognition_candidates (
        brand,
        product_line,
        product_name,
        product_form,
        package_size_unit
      ),
      products (
        official_name,
        manufacturer,
        product_form,
        default_unit
      )
    `,
    )
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (containersError) {
    throw mapInventoryError(containersError, 'Der Düngerbestand konnte nicht geladen werden.')
  }

  const items: FertilizerStockListItem[] = []

  for (const container of containers ?? []) {
    const { data: balance, error: balanceError } = await supabase.rpc('fertilizer_container_balance', {
      p_container_id: container.id as string,
    })

    if (balanceError) {
      throw mapInventoryError(balanceError, 'Der Bestand konnte nicht berechnet werden.')
    }

    const numericBalance = typeof balance === 'number' ? balance : Number(balance ?? 0)

    if (numericBalance <= 0) {
      continue
    }

    const candidateRaw = container.fertilizer_recognition_candidates
    const productRaw = container.products
    const candidate = (Array.isArray(candidateRaw) ? candidateRaw[0] : candidateRaw) as Record<
      string,
      unknown
    > | null
    const product = (Array.isArray(productRaw) ? productRaw[0] : productRaw) as Record<
      string,
      unknown
    > | null

    const productLabel =
      (container.label as string | null) ??
      (product
        ? `${product.manufacturer ?? ''} ${product.official_name ?? ''}`.trim()
        : candidate
          ? [candidate.brand, candidate.product_line, candidate.product_name]
              .filter(Boolean)
              .join(' · ')
          : 'Dünger')

    const unit =
      (container.package_size_unit as string | null) ??
      (candidate?.package_size_unit as string | null) ??
      (product?.default_unit as string | null) ??
      'kg'

    const productFormRaw =
      (product?.product_form as string | null) ??
      (candidate?.product_form as string | null) ??
      null

    const productForm =
      productFormRaw === 'granular' || productFormRaw === 'liquid' ? productFormRaw : null

    items.push({
      id: container.id as string,
      productLabel,
      balance: numericBalance,
      unit,
      catalogProductId: (container.product_id as string | null) ?? null,
      recognitionCandidateId: (container.recognition_candidate_id as string | null) ?? null,
      productForm,
    })
  }

  return items
}
