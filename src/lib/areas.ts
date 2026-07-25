import { supabase } from './supabase'
import { fetchAreaDashboard } from './dashboard'
import { getErrorMessage } from './errors'
import type { Area, AreaStatus } from '../types/area'

interface AreaRow {
  id: string
  name: string
  subtitle: string | null
  size_sqm: number | string | null
  status: DbAreaStatus | string | null
  status_label: string | null
  summary: string | null
  sort_order: number | null
  archived_at: string | null
}

type DbAreaStatus = 'excellent' | 'good' | 'observe' | 'critical'

function mapStatus(status: DbAreaStatus | string | null | undefined): AreaStatus {
  if (status === 'excellent' || status === 'observe') {
    return status
  }

  if (status === 'good') {
    return 'excellent'
  }

  return 'observe'
}

function parseSizeSqm(value: AreaRow['size_sqm']): number | null {
  if (value == null || value === '') {
    return null
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function formatSizeLabel(sizeSqm: AreaRow['size_sqm']): string {
  const numeric = parseSizeSqm(sizeSqm)

  if (numeric == null) {
    return 'Größe noch nicht festgelegt'
  }

  return `${numeric.toLocaleString('de-DE')} m²`
}

export function mapAreaRow(row: AreaRow): Area {
  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle ?? '',
    sizeLabel: formatSizeLabel(row.size_sqm),
    status: mapStatus(row.status),
    statusLabel: row.status_label ?? 'Entwicklung beobachten',
    summary: row.summary,
  }
}

export interface CreateAreaInput {
  name: string
  sizeSqm: number | null
  sortOrder: number
}

export async function createAreas(userId: string, areas: CreateAreaInput[]): Promise<void> {
  if (areas.length === 0) {
    throw new Error('Es wurden keine Rasenflächen übergeben.')
  }

  const rows = areas.map((area) => ({
    user_id: userId,
    name: area.name,
    size_sqm: area.sizeSqm,
    sort_order: area.sortOrder,
  }))

  const { error } = await supabase.from('areas').insert(rows)

  if (error) {
    throw new Error(getErrorMessage(error, 'Flächen konnten nicht gespeichert werden.'))
  }
}

export async function fetchAreas(): Promise<Area[]> {
  const { data, error } = await supabase
    .from('areas')
    .select('id, name, subtitle, size_sqm, status, status_label, summary, sort_order, archived_at')
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) {
    throw new Error(getErrorMessage(error, 'Flächen konnten nicht geladen werden.'))
  }

  return (data ?? []).map((row) => mapAreaRow(row as AreaRow))
}

export async function fetchAreaById(id: string): Promise<Area | null> {
  const [areaResult, dashboard] = await Promise.all([
    supabase
      .from('areas')
      .select('id, name, subtitle, size_sqm, status, status_label, summary, sort_order, archived_at')
      .eq('id', id)
      .is('archived_at', null)
      .maybeSingle(),
    fetchAreaDashboard(id),
  ])

  if (areaResult.error) {
    throw new Error(getErrorMessage(areaResult.error, 'Fläche konnte nicht geladen werden.'))
  }

  if (!areaResult.data) {
    return null
  }

  return {
    ...mapAreaRow(areaResult.data as AreaRow),
    dashboard,
  }
}
