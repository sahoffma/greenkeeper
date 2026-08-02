import type { Area } from '../types/area'
import type { FertilizerStockListItem } from '../types/fertilizerInventory'
import { validateApplicationAmount } from './fertilizerApplicationCore'

export type FertilizerApplicationFlowPhase = 'form' | 'confirm' | 'success'

export interface FertilizerApplicationDraft {
  amountInput: string
  areaId: string | null
  appliedAtDate: string
  note: string
  idempotencyKey: string | null
}

export interface FertilizerApplicationDraftValidation {
  ok: boolean
  amount: number | null
  errors: Partial<Record<'amount' | 'area' | 'date' | 'note', string>>
}

export interface FertilizerApplicationConfirmationRow {
  label: string
  value: string
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidInventoryItemRouteId(value: string | undefined): boolean {
  return Boolean(value && UUID_PATTERN.test(value))
}

export function formatFertilizerProductFormLabel(
  productForm: FertilizerStockListItem['productForm'],
): string | null {
  if (productForm === 'granular') {
    return 'Granulat'
  }

  if (productForm === 'liquid') {
    return 'Flüssig'
  }

  return null
}

export function isFertilizerStockListItemApplicationEligible(
  item: FertilizerStockListItem,
): boolean {
  return (
    item.savedProductProfileId != null &&
    item.accessKind === 'authenticated_user' &&
    (item.baseUnit === 'kg' || item.baseUnit === 'ml') &&
    item.balance > 0
  )
}

export function getFertilizerApplicationIneligibilityMessage(
  item: FertilizerStockListItem,
): string {
  if (item.balance <= 0) {
    return 'Dieses Gebinde ist leer und kann nicht angewendet werden.'
  }

  if (item.savedProductProfileId == null || item.accessKind !== 'authenticated_user') {
    return 'Dieses Gebinde kann noch nicht angewendet werden.'
  }

  if (item.baseUnit !== 'kg' && item.baseUnit !== 'ml') {
    return 'Dieses Gebinde kann noch nicht angewendet werden.'
  }

  return 'Dieses Gebinde kann nicht angewendet werden.'
}

export function parseApplicationAmountInput(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  if (/e/i.test(trimmed)) {
    return null
  }

  const normalized = trimmed.replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null
  }

  const numeric = Number(normalized)
  if (!Number.isFinite(numeric)) {
    return null
  }

  try {
    return validateApplicationAmount(numeric)
  } catch {
    return null
  }
}

export function computePreviewResultingBalance(
  currentBalance: number,
  amount: number | null,
): number | null {
  if (amount == null) {
    return null
  }

  return Math.round((currentBalance - amount) * 10_000) / 10_000
}

export function applicationDateInputToIso(dateValue: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim())
  if (!match) {
    return null
  }

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const localDate = new Date(year, month - 1, day, 12, 0, 0, 0)

  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day
  ) {
    return null
  }

  const today = new Date()
  today.setHours(23, 59, 59, 999)
  if (localDate.getTime() > today.getTime()) {
    return null
  }

  return localDate.toISOString()
}

export function validateFertilizerApplicationDraft(
  draft: FertilizerApplicationDraft,
  item: FertilizerStockListItem,
): FertilizerApplicationDraftValidation {
  const errors: FertilizerApplicationDraftValidation['errors'] = {}
  const amount = parseApplicationAmountInput(draft.amountInput)

  if (amount == null) {
    errors.amount = 'Bitte gib eine gültige Menge ein.'
  } else if (amount > item.balance) {
    errors.amount = 'Die Menge darf den verfügbaren Bestand nicht überschreiten.'
  }

  if (!draft.areaId) {
    errors.area = 'Bitte wähle eine Fläche aus.'
  }

  if (!applicationDateInputToIso(draft.appliedAtDate)) {
    errors.date = 'Bitte wähle ein gültiges Datum aus.'
  }

  const trimmedNote = draft.note.trim()
  if (trimmedNote.length > 2000) {
    errors.note = 'Die Notiz ist zu lang.'
  }

  return {
    ok: Object.keys(errors).length === 0 && amount != null,
    amount,
    errors,
  }
}

export function buildFertilizerApplicationConfirmationRows(input: {
  item: FertilizerStockListItem
  area: Area
  amount: number
  appliedAtDate: string
  note: string
}): FertilizerApplicationConfirmationRow[] {
  const rows: FertilizerApplicationConfirmationRow[] = [
    { label: 'Produkt', value: input.item.productLabel },
    {
      label: 'Gebinde',
      value:
        input.item.packageSizeValue != null && input.item.packageSizeUnit
          ? `${input.item.packageSizeValue} ${input.item.packageSizeUnit}`
          : 'Einzelnes Gebinde',
    },
    { label: 'Menge', value: `${input.amount} ${input.item.baseUnit ?? input.item.unit}` },
    { label: 'Fläche', value: input.area.name },
    { label: 'Datum', value: formatGermanDateLabel(input.appliedAtDate) },
  ]

  const previewBalance = computePreviewResultingBalance(input.item.balance, input.amount)
  if (previewBalance != null) {
    rows.push({
      label: 'Restbestand danach',
      value: `${previewBalance} ${input.item.baseUnit ?? input.item.unit}`,
    })
  }

  const trimmedNote = input.note.trim()
  if (trimmedNote) {
    rows.push({ label: 'Notiz', value: trimmedNote })
  }

  return rows
}

export function formatGermanDateLabel(dateValue: string): string {
  const [year, month, day] = dateValue.split('-')
  if (!year || !month || !day) {
    return dateValue
  }

  return `${day}.${month}.${year}`
}

export function formatBalanceLabel(value: number, unit: string): string {
  const formatted = Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('de-DE', { maximumFractionDigits: 4 })
  return `${formatted} ${unit}`
}

export function buildApplicationSourceEventRef(idempotencyKey: string): string {
  return `ui:fertilizer-application:${idempotencyKey}`
}

export function canSubmitFertilizerApplication(input: {
  submitting: boolean
  phase: FertilizerApplicationFlowPhase
  item: FertilizerStockListItem | null
}): boolean {
  return !input.submitting && input.phase !== 'success' && input.item != null
}
