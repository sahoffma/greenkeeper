import type { ParsedActivityResult } from '../types/parseActivity'
import {
  activityParseSchema,
  isValidIsoDate,
  normalizeParsedActivity as normalizeSharedParsedActivity,
} from '../../shared/parseActivityCore'

export { activityParseSchema, isValidIsoDate }

export function normalizeParsedActivity(record: Record<string, unknown>): ParsedActivityResult | null {
  const parsed = normalizeSharedParsedActivity(record)

  if (!parsed) {
    return null
  }

  return parsed as ParsedActivityResult
}

export function buildActivitySummaryRows(
  result: ParsedActivityResult,
  options?: { areaName?: string; referenceDate?: string },
): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [
    { label: 'Maßnahme', value: result.activityLabel },
  ]

  if (result.productName) {
    rows.push({ label: 'Produkt', value: result.productName })
  }

  if (result.activityType === 'mowing' && result.mowHeightMm != null) {
    rows.push({ label: 'Schnitthöhe', value: `${result.mowHeightMm} mm` })
  } else if (result.amount != null && result.unit) {
    rows.push({ label: 'Menge', value: `${result.amount} ${result.unit}` })
  } else if (result.amount != null) {
    rows.push({ label: 'Menge', value: String(result.amount) })
  }

  if (options?.referenceDate) {
    rows.push({
      label: 'Datum',
      value: formatSummaryDate(result.date, options.referenceDate),
    })
  }

  if (options?.areaName) {
    rows.push({ label: 'Fläche', value: options.areaName })
  }

  if (result.note) {
    rows.push({ label: 'Notiz', value: result.note })
  }

  return rows
}

function formatSummaryDate(dateValue: string, referenceDate: string): string {
  if (dateValue === referenceDate) {
    return 'Heute'
  }

  const reference = new Date(referenceDate)
  const yesterday = new Date(reference)
  yesterday.setDate(reference.getDate() - 1)

  if (dateValue === yesterday.toISOString().slice(0, 10)) {
    return 'Gestern'
  }

  return new Date(dateValue).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
