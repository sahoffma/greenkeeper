import { supabase } from './supabase'
import { getErrorMessage } from './errors'
import { ACTIVITY_TYPE_LABELS } from './activityLabels'
import { isoToDateInput, parseAmountApplied } from './activityCreate'
import type { ActivityType, MeasureActivityFormData, TimelineActivity } from '../types/activity'

interface FertilizationDetailsRow {
  product_name: string
  amount_applied: number | string | null
  amount_unit: string | null
}

interface MeasureDetailsRow {
  product_name: string | null
  amount_applied: number | string | null
  amount_unit: string | null
  mow_height_mm: number | string | null
}

interface ActivityRow {
  id: string
  activity_type: ActivityType
  title: string | null
  notes: string | null
  occurred_at: string
  created_at: string
  fertilization_details: FertilizationDetailsRow | FertilizationDetailsRow[] | null
  measure_details: MeasureDetailsRow | MeasureDetailsRow[] | null
}

function formatGermanDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function pickSingle<T>(value: T | T[] | null): T | null {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value
}

function mapActivityRow(row: ActivityRow): TimelineActivity {
  const typeLabel = ACTIVITY_TYPE_LABELS[row.activity_type] ?? row.title ?? 'Maßnahme'
  const fertilization = pickSingle(row.fertilization_details)
  const measure = pickSingle(row.measure_details)

  const productName = fertilization?.product_name ?? measure?.product_name ?? null
  const amountApplied = parseAmountApplied(
    fertilization?.amount_applied ?? measure?.amount_applied ?? null,
  )
  const amountUnit = fertilization?.amount_unit ?? measure?.amount_unit ?? null
  const mowHeightMm = parseAmountApplied(measure?.mow_height_mm ?? null)

  return {
    id: row.id,
    date: formatGermanDate(row.occurred_at),
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    title: row.title?.trim() || typeLabel,
    typeLabel,
    activityType: row.activity_type,
    productName,
    amountApplied,
    amountUnit,
    mowHeightMm,
    notes: row.notes?.trim() || null,
  }
}

export async function fetchTimelineActivities(areaId: string): Promise<TimelineActivity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select(
      'id, activity_type, title, notes, occurred_at, created_at, fertilization_details(product_name, amount_applied, amount_unit), measure_details(product_name, amount_applied, amount_unit, mow_height_mm)',
    )
    .eq('area_id', areaId)
    .order('occurred_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(getErrorMessage(error, 'Aktivitäten konnten nicht geladen werden.'))
  }

  return (data ?? []).map((row) => mapActivityRow(row as ActivityRow))
}

export async function fetchMeasureActivity(activityId: string): Promise<MeasureActivityFormData> {
  const { data, error } = await supabase
    .from('activities')
    .select(
      'id, area_id, activity_type, title, notes, occurred_at, fertilization_details(product_name, amount_applied, amount_unit), measure_details(product_name, amount_applied, amount_unit, mow_height_mm)',
    )
    .eq('id', activityId)
    .maybeSingle()

  if (error) {
    throw new Error(getErrorMessage(error, 'Die Maßnahme konnte nicht geladen werden.'))
  }

  if (!data) {
    throw new Error('Diese Maßnahme wurde nicht gefunden.')
  }

  const row = data as ActivityRow & { area_id: string }
  const fertilization = pickSingle(row.fertilization_details)
  const measure = pickSingle(row.measure_details)

  return {
    id: row.id,
    areaId: row.area_id,
    activityType: row.activity_type,
    activityLabel: row.title?.trim() || ACTIVITY_TYPE_LABELS[row.activity_type],
    occurredAt: isoToDateInput(row.occurred_at),
    productName: fertilization?.product_name ?? measure?.product_name ?? null,
    amountApplied: parseAmountApplied(
      fertilization?.amount_applied ?? measure?.amount_applied ?? null,
    ),
    amountUnit: fertilization?.amount_unit ?? measure?.amount_unit ?? null,
    mowHeightMm: parseAmountApplied(measure?.mow_height_mm ?? null),
    notes: row.notes,
  }
}

/** @deprecated */
export const fetchFertilizationActivity = fetchMeasureActivity
