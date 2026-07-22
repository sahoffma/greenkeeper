import { supabase } from './supabase'
import type { AreaDashboard } from '../types/area'

interface HealthScoreRow {
  score: number
  status_label: string
}

interface BriefingRow {
  content: string
  briefing_date: string
}

interface NutrientBudgetRow {
  nitrogen_g_per_sqm: number
  phosphate_g_per_sqm: number
  potassium_g_per_sqm: number
  phosphorus_target_g_per_sqm: number
}

interface FertilizationActivityRow {
  occurred_at: string
  fertilization_details: { product_name: string } | { product_name: string }[] | null
}

function formatGermanDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function pickBriefing(rows: BriefingRow[]): BriefingRow | null {
  if (rows.length === 0) {
    return null
  }

  const today = new Date().toISOString().slice(0, 10)
  return rows.find((row) => row.briefing_date === today) ?? rows[0]
}

function pickProductName(
  details: FertilizationActivityRow['fertilization_details'],
): string | null {
  if (!details) {
    return null
  }

  if (Array.isArray(details)) {
    return details[0]?.product_name ?? null
  }

  return details.product_name
}

function buildDashboard(
  health: HealthScoreRow | null,
  briefing: BriefingRow | null,
  nutrients: NutrientBudgetRow | null,
  fertilization: FertilizationActivityRow | null,
): AreaDashboard | undefined {
  if (!health && !briefing && !nutrients && !fertilization) {
    return undefined
  }

  const productName = fertilization ? pickProductName(fertilization.fertilization_details) : null

  return {
    score: health?.score ?? 0,
    statusLabel: health?.status_label ?? 'Noch nicht bewertet',
    briefing: briefing?.content ?? 'Noch kein Tagesbriefing vorhanden.',
    lastFertilization: fertilization
      ? {
          date: formatGermanDate(fertilization.occurred_at),
          product: productName ?? 'Unbekanntes Produkt',
        }
      : {
          date: '—',
          product: 'Noch keine Düngung erfasst',
        },
    nutrients2026: {
      nitrogen: Number(nutrients?.nitrogen_g_per_sqm ?? 0),
      phosphate: Number(nutrients?.phosphate_g_per_sqm ?? 0),
      potassium: Number(nutrients?.potassium_g_per_sqm ?? 0),
      phosphorusTarget: Number(nutrients?.phosphorus_target_g_per_sqm ?? 0),
    },
  }
}

export async function fetchAreaDashboard(areaId: string): Promise<AreaDashboard | undefined> {
  const currentYear = new Date().getFullYear()

  const [healthResult, briefingResult, nutrientResult, fertilizationResult] = await Promise.all([
    supabase
      .from('area_health_scores')
      .select('score, status_label')
      .eq('area_id', areaId)
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('daily_briefings')
      .select('content, briefing_date')
      .eq('area_id', areaId)
      .order('briefing_date', { ascending: false })
      .limit(31),
    supabase
      .from('nutrient_budgets')
      .select(
        'nitrogen_g_per_sqm, phosphate_g_per_sqm, potassium_g_per_sqm, phosphorus_target_g_per_sqm',
      )
      .eq('area_id', areaId)
      .eq('year', currentYear)
      .maybeSingle(),
    supabase
      .from('activities')
      .select('occurred_at, fertilization_details(product_name)')
      .eq('area_id', areaId)
      .eq('activity_type', 'fertilization')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (healthResult.error) {
    throw healthResult.error
  }

  if (briefingResult.error) {
    throw briefingResult.error
  }

  if (nutrientResult.error) {
    throw nutrientResult.error
  }

  if (fertilizationResult.error) {
    throw fertilizationResult.error
  }

  return buildDashboard(
    healthResult.data,
    pickBriefing(briefingResult.data ?? []),
    nutrientResult.data,
    fertilizationResult.data,
  )
}
