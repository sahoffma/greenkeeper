import type { Area } from '../types/area'
import type { CareGroupSummary } from '../types/careGroup'
import type { FertilizerStockListItem } from '../types/fertilizerInventory'
import {
  FertilizerMultiAreaApplicationError,
  normalizeFertilizerMultiAreaApplication,
  type FertilizerMultiAreaApplicationInput,
  type FertilizerMultiAreaApplicationMode,
  type FertilizerMultiAreaSelectionSource,
  type NormalizedFertilizerMultiAreaApplication,
} from './fertilizerMultiAreaApplicationCore'
import type { FertilizerMultiAreaApplicationCommandInput } from './fertilizerMultiAreaApplication'
import { validateApplicationAmount } from './fertilizerApplicationCore'

export type FertilizerApplicationFlowPhase = 'form' | 'confirm' | 'success'

export type FertilizerApplicationInputMode = FertilizerMultiAreaApplicationMode

export interface FertilizerApplicationDraft {
  mode: FertilizerApplicationInputMode
  inputValue: string
  selectedAreaIds: string[]
  selectionSource: FertilizerMultiAreaSelectionSource
  careGroupId: string | null
  appliedAtDate: string
  note: string
  idempotencyKey: string | null
}

export interface FertilizerApplicationDraftValidation {
  ok: boolean
  normalized: NormalizedFertilizerMultiAreaApplication | null
  errors: Partial<Record<'input' | 'areas' | 'date' | 'note', string>>
}

export interface FertilizerApplicationConfirmationRow {
  label: string
  value: string
}

export interface FertilizerApplicationAreaPreviewRow {
  areaId: string
  name: string
  sizeLabel: string
  applicationAmount: number
  applicationUnit: string
  effortRate: number
  effortRateUnitLabel: string
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

export function isAreaApplicableForFertilizerApplication(area: Area): boolean {
  return area.sizeSqm != null && Number.isFinite(area.sizeSqm) && area.sizeSqm > 0
}

export function getApplicableAreas(areas: Area[]): Area[] {
  return areas.filter(isAreaApplicableForFertilizerApplication)
}

export function resolveInitialDraftSelection(applicableAreas: Area[]): Pick<
  FertilizerApplicationDraft,
  'selectedAreaIds' | 'selectionSource' | 'careGroupId'
> {
  if (applicableAreas.length === 1) {
    return {
      selectedAreaIds: [applicableAreas[0]!.id],
      selectionSource: 'manual',
      careGroupId: null,
    }
  }

  return {
    selectedAreaIds: [],
    selectionSource: 'manual',
    careGroupId: null,
  }
}

export function buildCareGroupPreselection(
  careGroupId: string,
  groups: CareGroupSummary[],
  applicableAreas: Area[],
): string[] {
  const applicableIds = new Set(applicableAreas.map((area) => area.id))
  const group = groups.find((entry) => entry.id === careGroupId)
  if (!group) {
    return []
  }

  return group.areaIds.filter((areaId) => applicableIds.has(areaId))
}

export function toggleAreaSelection(selectedAreaIds: string[], areaId: string): string[] {
  if (selectedAreaIds.includes(areaId)) {
    return selectedAreaIds.filter((id) => id !== areaId)
  }

  return [...selectedAreaIds, areaId]
}

export function applyCareGroupSelection(
  careGroupId: string,
  groups: CareGroupSummary[],
  applicableAreas: Area[],
): Pick<FertilizerApplicationDraft, 'selectedAreaIds' | 'selectionSource' | 'careGroupId'> {
  return {
    selectedAreaIds: buildCareGroupPreselection(careGroupId, groups, applicableAreas),
    selectionSource: 'care_group',
    careGroupId,
  }
}

export function switchToManualAreaSelection(
  selectedAreaIds: string[],
): Pick<FertilizerApplicationDraft, 'selectedAreaIds' | 'selectionSource' | 'careGroupId'> {
  return {
    selectedAreaIds,
    selectionSource: 'manual',
    careGroupId: null,
  }
}

export function parseApplicationInputValue(raw: string): number | null {
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

export function getApplicationInputUnitLabel(
  mode: FertilizerApplicationInputMode,
  baseUnit: 'kg' | 'ml',
): string {
  if (mode === 'rate_per_sqm') {
    return baseUnit === 'kg' ? 'g/m²' : 'ml/m²'
  }

  return baseUnit
}

export function formatApplicationModeLabel(mode: FertilizerApplicationInputMode): string {
  if (mode === 'rate_per_sqm') {
    return 'Aufwandmenge pro m²'
  }

  return 'Gesamtmenge proportional'
}

export function formatSelectionSourceLabel(
  selectionSource: FertilizerMultiAreaSelectionSource,
): string {
  return selectionSource === 'care_group' ? 'Aus Pflegegruppe' : 'Manuell'
}

export function formatEffortRateUnitLabel(effortRateUnit: 'g_per_sqm' | 'ml_per_sqm'): string {
  return effortRateUnit === 'g_per_sqm' ? 'g/m²' : 'ml/m²'
}

export function buildDomainInputFromDraft(
  draft: FertilizerApplicationDraft,
  item: FertilizerStockListItem,
  areas: Area[],
): FertilizerMultiAreaApplicationInput | null {
  const baseUnit = item.baseUnit
  if (baseUnit !== 'kg' && baseUnit !== 'ml') {
    return null
  }

  const parsedValue = parseApplicationInputValue(draft.inputValue)
  if (parsedValue == null) {
    return null
  }

  const selectedAreas = draft.selectedAreaIds
    .map((areaId) => areas.find((area) => area.id === areaId))
    .filter((area): area is Area => area != null)

  return {
    baseUnit,
    mode: draft.mode,
    selectionSource: draft.selectionSource,
    careGroupId: draft.careGroupId,
    areas: selectedAreas.map((area) => ({
      areaId: area.id,
      areaName: area.name,
      areaSizeSqm: area.sizeSqm ?? null,
    })),
    rateValue: draft.mode === 'rate_per_sqm' ? parsedValue : null,
    totalAmount: draft.mode === 'total_amount_proportional' ? parsedValue : null,
  }
}

export function computePreviewResultingBalance(
  currentBalance: number,
  totalAmount: number | null,
): number | null {
  if (totalAmount == null) {
    return null
  }

  return Math.round((currentBalance - totalAmount) * 10_000) / 10_000
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
  areas: Area[],
): FertilizerApplicationDraftValidation {
  const errors: FertilizerApplicationDraftValidation['errors'] = {}
  const parsedValue = parseApplicationInputValue(draft.inputValue)

  if (parsedValue == null) {
    errors.input = 'Bitte gib einen gültigen Wert ein.'
  }

  const uniqueSelectedAreaIds = [...new Set(draft.selectedAreaIds)]
  if (uniqueSelectedAreaIds.length !== draft.selectedAreaIds.length) {
    errors.areas = 'Die Flächenauswahl ist ungültig.'
  } else if (uniqueSelectedAreaIds.length === 0) {
    errors.areas = 'Bitte wähle mindestens eine Fläche aus.'
  } else {
    const invalidArea = uniqueSelectedAreaIds.find((areaId) => {
      const area = areas.find((entry) => entry.id === areaId)
      return area == null || !isAreaApplicableForFertilizerApplication(area)
    })

    if (invalidArea) {
      errors.areas = 'Eine gewählte Fläche ist nicht anwendbar.'
    }
  }

  if (!applicationDateInputToIso(draft.appliedAtDate)) {
    errors.date = 'Bitte wähle ein gültiges Datum aus.'
  }

  const trimmedNote = draft.note.trim()
  if (trimmedNote.length > 2000) {
    errors.note = 'Die Notiz ist zu lang.'
  }

  let normalized: NormalizedFertilizerMultiAreaApplication | null = null

  if (Object.keys(errors).length === 0 && parsedValue != null) {
    const domainInput = buildDomainInputFromDraft(draft, item, areas)
    if (domainInput) {
      try {
        normalized = normalizeFertilizerMultiAreaApplication(domainInput)
      } catch (error) {
        if (error instanceof FertilizerMultiAreaApplicationError) {
          if (
            error.code === 'APPLICATION_RATE_INVALID' ||
            error.code === 'APPLICATION_TOTAL_INVALID'
          ) {
            errors.input = 'Bitte gib einen gültigen Wert ein.'
          } else if (error.code === 'NO_AREAS_SELECTED' || error.code === 'DUPLICATE_AREA') {
            errors.areas = 'Bitte wähle mindestens eine Fläche aus.'
          } else if (error.code === 'AREA_SIZE_MISSING' || error.code === 'AREA_SIZE_INVALID') {
            errors.areas = 'Eine gewählte Fläche ist nicht anwendbar.'
          } else {
            errors.input = 'Die Eingabe ist ungültig.'
          }
        }
      }
    }
  }

  if (normalized != null && normalized.totalApplicationAmount > item.balance) {
    errors.input = 'Die Menge darf den verfügbaren Bestand nicht überschreiten.'
    normalized = null
  }

  return {
    ok: Object.keys(errors).length === 0 && normalized != null,
    normalized,
    errors,
  }
}

export function buildFertilizerApplicationAreaPreviewRows(
  normalized: NormalizedFertilizerMultiAreaApplication,
  areas: Area[],
): FertilizerApplicationAreaPreviewRow[] {
  return normalized.areaSnapshots.map((snapshot) => {
    const area = areas.find((entry) => entry.id === snapshot.areaId)
    return {
      areaId: snapshot.areaId,
      name: snapshot.areaNameSnapshot,
      sizeLabel: area?.sizeLabel ?? `${snapshot.areaSizeSqmSnapshot} m²`,
      applicationAmount: snapshot.applicationAmount,
      applicationUnit: snapshot.applicationUnit,
      effortRate: snapshot.effortRate,
      effortRateUnitLabel: formatEffortRateUnitLabel(snapshot.effortRateUnit),
    }
  })
}

export function buildFertilizerApplicationConfirmationRows(input: {
  item: FertilizerStockListItem
  draft: FertilizerApplicationDraft
  normalized: NormalizedFertilizerMultiAreaApplication
  areas: Area[]
}): FertilizerApplicationConfirmationRow[] {
  const unitLabel = input.item.baseUnit ?? input.item.unit ?? 'kg'
  const rows: FertilizerApplicationConfirmationRow[] = [
    { label: 'Produkt', value: input.item.productLabel },
    {
      label: 'Gebinde',
      value:
        input.item.packageSizeValue != null && input.item.packageSizeUnit
          ? `${input.item.packageSizeValue} ${input.item.packageSizeUnit}`
          : 'Einzelnes Gebinde',
    },
    { label: 'Modus', value: formatApplicationModeLabel(input.draft.mode) },
    {
      label: 'Eingabe',
      value: `${input.normalized.confirmedInputValue} ${getApplicationInputUnitLabel(input.draft.mode, unitLabel === 'ml' ? 'ml' : 'kg')}`,
    },
    {
      label: 'Gesamtentnahme',
      value: `${input.normalized.totalApplicationAmount} ${unitLabel}`,
    },
    {
      label: 'Aktueller Bestand',
      value: `${input.item.balance} ${unitLabel}`,
    },
    {
      label: 'Restbestand danach',
      value: `${computePreviewResultingBalance(input.item.balance, input.normalized.totalApplicationAmount) ?? '—'} ${unitLabel}`,
    },
    {
      label: 'Flächen',
      value: String(input.normalized.areaSnapshots.length),
    },
    {
      label: 'Auswahlherkunft',
      value: formatSelectionSourceLabel(input.normalized.selectionSource),
    },
    { label: 'Datum', value: formatGermanDateLabel(input.draft.appliedAtDate) },
  ]

  for (const preview of buildFertilizerApplicationAreaPreviewRows(input.normalized, input.areas)) {
    rows.push({
      label: preview.name,
      value: `${preview.applicationAmount} ${preview.applicationUnit} · ${preview.sizeLabel} · ${preview.effortRate} ${preview.effortRateUnitLabel}`,
    })
  }

  const trimmedNote = input.draft.note.trim()
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

export function shouldDiscardIdempotencyKey(
  previous: FertilizerApplicationDraft,
  current: FertilizerApplicationDraft,
): boolean {
  return (
    previous.mode !== current.mode ||
    previous.inputValue !== current.inputValue ||
    previous.appliedAtDate !== current.appliedAtDate ||
    previous.note !== current.note ||
    previous.selectionSource !== current.selectionSource ||
    previous.careGroupId !== current.careGroupId ||
    previous.selectedAreaIds.join(',') !== current.selectedAreaIds.join(',')
  )
}

export function buildMultiAreaApplicationCommandInput(input: {
  draft: FertilizerApplicationDraft
  item: FertilizerStockListItem
  areas: Area[]
  userId: string
  idempotencyKey: string
}): FertilizerMultiAreaApplicationCommandInput | null {
  const validation = validateFertilizerApplicationDraft(input.draft, input.item, input.areas)
  if (!validation.ok || validation.normalized == null || !input.item.savedProductProfileId) {
    return null
  }

  const appliedAt = applicationDateInputToIso(input.draft.appliedAtDate)
  if (!appliedAt) {
    return null
  }

  const domainInput = buildDomainInputFromDraft(input.draft, input.item, input.areas)
  if (!domainInput) {
    return null
  }

  return {
    inventoryItemId: input.item.id,
    savedProductProfileId: input.item.savedProductProfileId,
    appliedAt,
    idempotencyKey: input.idempotencyKey,
    sourceEventRef: buildApplicationSourceEventRef(input.idempotencyKey),
    note: input.draft.note.trim() || null,
    userId: input.userId,
    domain: domainInput,
  }
}

export function canSubmitFertilizerApplication(input: {
  submitting: boolean
  phase: FertilizerApplicationFlowPhase
  item: FertilizerStockListItem | null
}): boolean {
  return !input.submitting && input.phase !== 'success' && input.item != null
}

export function buildSuccessAreaLabels(
  resultAreaIds: readonly string[],
  areas: Area[],
): string[] {
  return resultAreaIds.map((areaId) => areas.find((area) => area.id === areaId)?.name ?? areaId)
}
