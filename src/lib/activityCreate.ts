import { supabase } from './supabase'
import { getErrorMessage } from './errors'
import { ACTIVITY_TYPE_LABELS } from './activityLabels'
import type { ActivityType } from '../types/activity'

export interface CreateMeasureInput {
  areaId: string
  userId: string
  activityType: ActivityType
  activityLabel?: string
  occurredAt: string
  productName?: string | null
  notes?: string | null
  amountApplied?: number | null
  amountUnit?: string | null
  mowHeightMm?: number | null
}

export interface UpdateMeasureInput {
  activityId: string
  areaId: string
  activityType: ActivityType
  activityLabel?: string
  occurredAt: string
  productName?: string | null
  notes?: string | null
  amountApplied?: number | null
  amountUnit?: string | null
  mowHeightMm?: number | null
}

export interface CreateMeasureResult {
  activityId: string
}

/** @deprecated */
export type CreateFertilizationInput = CreateMeasureInput & { productName: string }
/** @deprecated */
export type UpdateFertilizationInput = UpdateMeasureInput & { productName: string }
/** @deprecated */
export type CreateFertilizationResult = CreateMeasureResult

function dateInputToIso(dateValue: string): string {
  const [year, month, day] = dateValue.split('-').map(Number)

  if (!year || !month || !day) {
    throw new Error('Ungültiges Datum.')
  }

  return new Date(year, month - 1, day, 12, 0, 0).toISOString()
}

export function isoToDateInput(iso: string): string {
  const date = new Date(iso)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function buildApplicationRate(
  amountApplied: number | null,
  amountUnit: string | null,
): string | null {
  if (amountApplied == null || !amountUnit) {
    return null
  }

  return `${amountApplied} ${amountUnit}`
}

export function parseAmountApplied(value: number | string | null | undefined): number | null {
  if (value == null || value === '') {
    return null
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function resolveActivityTitle(activityType: ActivityType, activityLabel?: string): string {
  return activityLabel?.trim() || ACTIVITY_TYPE_LABELS[activityType]
}

export async function createMeasureActivity(input: CreateMeasureInput): Promise<CreateMeasureResult> {
  const title = resolveActivityTitle(input.activityType, input.activityLabel)
  const amountApplied = input.amountApplied ?? null
  const amountUnit = input.amountUnit?.trim() || null
  const applicationRate = buildApplicationRate(amountApplied, amountUnit)
  const productName = input.productName?.trim() || null
  const mowHeightMm = input.mowHeightMm ?? null

  if (input.activityType === 'fertilization' && !productName) {
    throw new Error('Produktname ist erforderlich.')
  }

  const { data: activity, error: activityError } = await supabase
    .from('activities')
    .insert({
      area_id: input.areaId,
      user_id: input.userId,
      activity_type: input.activityType,
      title,
      notes: input.notes?.trim() || null,
      occurred_at: dateInputToIso(input.occurredAt),
    })
    .select('id')
    .single()

  if (activityError) {
    throw new Error(getErrorMessage(activityError, 'Die Maßnahme konnte nicht gespeichert werden.'))
  }

  if (input.activityType === 'fertilization') {
    const { error: detailsError } = await supabase.from('fertilization_details').insert({
      activity_id: activity.id,
      product_name: productName,
      amount_applied: amountApplied,
      amount_unit: amountUnit,
      application_rate: applicationRate,
    })

    if (detailsError) {
      await supabase.from('activities').delete().eq('id', activity.id)
      throw new Error(getErrorMessage(detailsError, 'Die Maßnahme konnte nicht gespeichert werden.'))
    }

    return { activityId: activity.id }
  }

  const { error: detailsError } = await supabase.from('measure_details').insert({
    activity_id: activity.id,
    product_name: productName,
    amount_applied: amountApplied,
    amount_unit: amountUnit,
    mow_height_mm: mowHeightMm,
    application_rate: applicationRate,
  })

  if (detailsError) {
    await supabase.from('activities').delete().eq('id', activity.id)
    throw new Error(getErrorMessage(detailsError, 'Die Maßnahme konnte nicht gespeichert werden.'))
  }

  return { activityId: activity.id }
}

export async function updateMeasureActivity(input: UpdateMeasureInput): Promise<void> {
  const title = resolveActivityTitle(input.activityType, input.activityLabel)
  const amountApplied = input.amountApplied ?? null
  const amountUnit = input.amountUnit?.trim() || null
  const applicationRate = buildApplicationRate(amountApplied, amountUnit)
  const productName = input.productName?.trim() || null
  const mowHeightMm = input.mowHeightMm ?? null

  if (input.activityType === 'fertilization' && !productName) {
    throw new Error('Produktname ist erforderlich.')
  }

  const { error: activityError } = await supabase
    .from('activities')
    .update({
      activity_type: input.activityType,
      title,
      notes: input.notes?.trim() || null,
      occurred_at: dateInputToIso(input.occurredAt),
    })
    .eq('id', input.activityId)
    .eq('area_id', input.areaId)

  if (activityError) {
    throw new Error(getErrorMessage(activityError, 'Die Maßnahme konnte nicht aktualisiert werden.'))
  }

  if (input.activityType === 'fertilization') {
    const { error: detailsError } = await supabase
      .from('fertilization_details')
      .update({
        product_name: productName,
        amount_applied: amountApplied,
        amount_unit: amountUnit,
        application_rate: applicationRate,
      })
      .eq('activity_id', input.activityId)

    if (detailsError) {
      throw new Error(getErrorMessage(detailsError, 'Die Maßnahme konnte nicht aktualisiert werden.'))
    }

    return
  }

  const { error: deleteFertilizationError } = await supabase
    .from('fertilization_details')
    .delete()
    .eq('activity_id', input.activityId)

  if (deleteFertilizationError) {
    throw new Error(
      getErrorMessage(deleteFertilizationError, 'Die Maßnahme konnte nicht aktualisiert werden.'),
    )
  }

  const { error: upsertError } = await supabase.from('measure_details').upsert({
    activity_id: input.activityId,
    product_name: productName,
    amount_applied: amountApplied,
    amount_unit: amountUnit,
    mow_height_mm: mowHeightMm,
    application_rate: applicationRate,
  })

  if (upsertError) {
    throw new Error(getErrorMessage(upsertError, 'Die Maßnahme konnte nicht aktualisiert werden.'))
  }
}

export async function deleteMeasureActivity(activityId: string, areaId: string): Promise<void> {
  const { error } = await supabase
    .from('activities')
    .delete()
    .eq('id', activityId)
    .eq('area_id', areaId)

  if (error) {
    throw new Error(getErrorMessage(error, 'Die Maßnahme konnte nicht gelöscht werden.'))
  }
}

/** @deprecated */
export const createFertilizationActivity = createMeasureActivity
/** @deprecated */
export const updateFertilizationActivity = updateMeasureActivity
/** @deprecated */
export const deleteFertilizationActivity = deleteMeasureActivity

function todayDateInputValue(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export { todayDateInputValue }
