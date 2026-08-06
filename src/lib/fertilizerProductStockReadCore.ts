import type { FertilizerNutrientMatrix } from '../types/fertilizerReadiness'
import type { FertilizerStockListItem } from '../types/fertilizerInventory'
import { buildSavedProductProfileLabel } from './fertilizerInventoryStockListCore'
import { buildNpkLabel } from './nutrientDisplay'
import { formatNpkDeclarationDisplay } from './fertilizerProductDisplay'

export const LIST_ACTIVE_FERTILIZER_PRODUCT_STOCK_RPC =
  'list_active_fertilizer_product_stock' as const

export const GET_ACTIVE_FERTILIZER_PRODUCT_STOCK_ITEM_RPC =
  'get_active_fertilizer_product_stock_item' as const

export const FERTILIZER_PRODUCT_STOCK_READ_ERROR_CODES = [
  'FERTILIZER_PRODUCT_STOCK_READ_ACCESS_DENIED',
] as const

export type FertilizerProductStockBaseUnit = 'kg' | 'ml'

export type FertilizerProductStockForm = 'granular' | 'liquid'

export interface ActiveCanonicalProductStockCandidate {
  stockKind: string | null
  archivedAt: string | null
  supersededByContainerId: string | null
  savedProductProfileId: string | null
  baseUnit: string | null
  accessKind: string | null
  userId?: string | null
  ownerUserId?: string | null
  profileStatus?: string | null
  profileSource?: string | null
}

export interface ActiveProductStockReadRow {
  inventoryItemId: string
  savedProductProfileId: string
  baseUnit: FertilizerProductStockBaseUnit
  balance: number
  manufacturer: string | null
  officialName: string | null
  productLine?: string | null
  variant?: string | null
  productForm: FertilizerProductStockForm | null
  npkDeclaration?: string | null
  nitrogen?: number | null
  phosphate?: number | null
  potash?: number | null
  nutrientMatrix?: FertilizerNutrientMatrix | null
  packageSizeValue?: number | null
  packageSizeUnit?: string | null
  movementCount: number
  lastMovementAt: string | null
}

export interface ActiveProductStockListPayload {
  items: ActiveProductStockReadRow[]
}

export function isValidProductStockBaseUnit(value: unknown): value is FertilizerProductStockBaseUnit {
  return value === 'kg' || value === 'ml'
}

export function isActiveCanonicalProductStockCandidate(
  candidate: ActiveCanonicalProductStockCandidate,
  currentUserId?: string | null,
): boolean {
  if (candidate.stockKind !== 'product_stock') {
    return false
  }

  if (candidate.archivedAt != null) {
    return false
  }

  if (candidate.supersededByContainerId != null) {
    return false
  }

  if (candidate.savedProductProfileId == null) {
    return false
  }

  if (!isValidProductStockBaseUnit(candidate.baseUnit)) {
    return false
  }

  if (candidate.accessKind !== 'authenticated_user') {
    return false
  }

  if (candidate.profileStatus != null && candidate.profileStatus !== 'saved') {
    return false
  }

  if (candidate.profileSource != null && candidate.profileSource !== 'enrichment') {
    return false
  }

  if (currentUserId != null) {
    if (candidate.userId != null && candidate.userId !== currentUserId) {
      return false
    }

    if (candidate.ownerUserId != null && candidate.ownerUserId !== currentUserId) {
      return false
    }
  }

  return true
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parseProductForm(value: unknown): FertilizerProductStockForm | null {
  if (value === 'granular' || value === 'liquid') {
    return value
  }

  return null
}

function parseDecimal(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return 0
}

function parseInteger(value: unknown): number {
  const parsed = parseDecimal(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

function parseOptionalDecimal(value: unknown): number | null {
  if (value == null) {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return null
}

function parseNutrientMatrix(value: unknown): FertilizerNutrientMatrix | null {
  if (value == null) {
    return null
  }

  if (typeof value !== 'object') {
    return null
  }

  return value as FertilizerNutrientMatrix
}

function parseRequiredUuid(value: unknown, fieldName: string): string {
  const parsed = parseOptionalString(value)
  if (!parsed) {
    throw new Error(`FERTILIZER_PRODUCT_STOCK_READ_INVALID_${fieldName.toUpperCase()}`)
  }

  return parsed
}

function formatStockListNpkSummary(
  row: Pick<ActiveProductStockReadRow, 'npkDeclaration' | 'nitrogen' | 'phosphate' | 'potash'>,
): string | null {
  const fromDeclaration = formatNpkDeclarationDisplay(row.npkDeclaration)
  if (fromDeclaration) {
    return fromDeclaration
  }

  if (row.nitrogen == null || row.phosphate == null || row.potash == null) {
    return null
  }

  const label = buildNpkLabel(row.nitrogen, row.phosphate, row.potash)
  return label ? `NPK ${label}` : null
}

export function parseActiveProductStockReadRow(value: unknown): ActiveProductStockReadRow {
  if (typeof value !== 'object' || value === null) {
    throw new Error('FERTILIZER_PRODUCT_STOCK_READ_INVALID_ROW')
  }

  const record = value as Record<string, unknown>
  const baseUnit = record.baseUnit

  if (!isValidProductStockBaseUnit(baseUnit)) {
    throw new Error('FERTILIZER_PRODUCT_STOCK_READ_INVALID_BASE_UNIT')
  }

  return {
    inventoryItemId: parseRequiredUuid(record.inventoryItemId, 'inventory_item_id'),
    savedProductProfileId: parseRequiredUuid(record.savedProductProfileId, 'saved_product_profile_id'),
    baseUnit,
    balance: parseDecimal(record.balance),
    manufacturer: parseOptionalString(record.manufacturer),
    officialName: parseOptionalString(record.officialName),
    productLine: parseOptionalString(record.productLine),
    variant: parseOptionalString(record.variant),
    productForm: parseProductForm(record.productForm),
    npkDeclaration: parseOptionalString(record.npkDeclaration),
    nitrogen: parseOptionalDecimal(record.nitrogen),
    phosphate: parseOptionalDecimal(record.phosphate),
    potash: parseOptionalDecimal(record.potash),
    nutrientMatrix: parseNutrientMatrix(record.nutrientMatrix),
    packageSizeValue: parseOptionalDecimal(record.packageSizeValue),
    packageSizeUnit: parseOptionalString(record.packageSizeUnit),
    movementCount: parseInteger(record.movementCount),
    lastMovementAt: parseOptionalString(record.lastMovementAt),
  }
}

export function parseActiveProductStockListPayload(payload: unknown): ActiveProductStockListPayload {
  const normalizedPayload = coerceRpcJsonPayload(payload)

  if (typeof normalizedPayload !== 'object' || normalizedPayload === null) {
    throw new Error('FERTILIZER_PRODUCT_STOCK_READ_INVALID_PAYLOAD')
  }

  const record = normalizedPayload as Record<string, unknown>
  const rawItems = record.items

  if (!Array.isArray(rawItems)) {
    throw new Error('FERTILIZER_PRODUCT_STOCK_READ_INVALID_ITEMS')
  }

  const items: ActiveProductStockReadRow[] = []

  for (const rawItem of rawItems) {
    try {
      items.push(parseActiveProductStockReadRow(rawItem))
    } catch (error) {
      console.error('[fertilizer-stock-read] skipped invalid row', error)
    }
  }

  return { items }
}

function coerceRpcJsonPayload(payload: unknown): unknown {
  if (typeof payload !== 'string') {
    return payload
  }

  const trimmed = payload.trim()
  if (!trimmed) {
    return payload
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    return payload
  }
}

export function parseActiveProductStockItemPayload(payload: unknown): ActiveProductStockReadRow | null {
  const normalizedPayload = coerceRpcJsonPayload(payload)

  if (normalizedPayload == null) {
    return null
  }

  if (typeof normalizedPayload !== 'object') {
    throw new Error('FERTILIZER_PRODUCT_STOCK_READ_INVALID_PAYLOAD')
  }

  const record = normalizedPayload as Record<string, unknown>
  if (record.item == null) {
    return null
  }

  return parseActiveProductStockReadRow(record.item)
}

export function mapActiveProductStockRowToListItem(
  row: ActiveProductStockReadRow,
): FertilizerStockListItem {
  const productLabel =
    buildSavedProductProfileLabel(row.manufacturer, row.officialName) ?? 'Dünger'

  return {
    id: row.inventoryItemId,
    productLabel,
    balance: row.balance,
    unit: row.baseUnit,
    catalogProductId: null,
    recognitionCandidateId: null,
    productForm: row.productForm,
    manufacturer: row.manufacturer,
    packageSizeValue: row.packageSizeValue ?? null,
    packageSizeUnit: row.packageSizeUnit ?? null,
    savedProductProfileId: row.savedProductProfileId,
    baseUnit: row.baseUnit,
    accessKind: 'authenticated_user',
    npkSummary: formatStockListNpkSummary(row),
  }
}

export function mapActiveProductStockRowsToListItems(
  rows: ActiveProductStockReadRow[],
): FertilizerStockListItem[] {
  return rows.map(mapActiveProductStockRowToListItem)
}

export function findActiveProductStockRowByInventoryItemId(
  rows: ActiveProductStockReadRow[],
  inventoryItemId: string,
): ActiveProductStockReadRow | null {
  return rows.find((row) => row.inventoryItemId === inventoryItemId) ?? null
}

export function groupActiveProductStockRowsByIdentity(
  rows: ActiveProductStockReadRow[],
): Map<string, ActiveProductStockReadRow[]> {
  const groups = new Map<string, ActiveProductStockReadRow[]>()

  for (const row of rows) {
    const key = `${row.savedProductProfileId}:${row.baseUnit}`
    const existing = groups.get(key) ?? []
    existing.push(row)
    groups.set(key, existing)
  }

  return groups
}
