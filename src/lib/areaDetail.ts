import { supabase } from './supabase'
import { AREA_UPDATE_ERROR_MESSAGE } from './areaCoverImageCore'
import { getErrorMessage } from './errors'
import type { Area } from '../types/area'

const AREA_SIZE_UNKNOWN_LABEL = 'Größe noch nicht angegeben'

const AREA_DETAIL_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Bitte melde dich erneut an.',
  FOREIGN_OR_MISSING_AREA: 'Diese Rasenfläche ist nicht mehr verfügbar.',
  EMPTY_AREA_NAME: 'Bitte gib einen Namen für die Rasenfläche ein.',
  INVALID_AREA_SIZE: 'Bitte gib eine gültige Größe in m² ein.',
}

const AREA_DETAIL_SELECT =
  'id, name, subtitle, size_sqm, status, status_label, summary, cover_image_path'

export interface AreaDetailRow {
  id: string
  name: string
  subtitle: string | null
  size_sqm: number | string | null
  status: string | null
  status_label: string | null
  summary: string | null
  cover_image_path: string | null
}

export interface AreaDetail extends Area {
  sizeSqm: number | null
  coverImagePath: string | null
}

function mapAreaDetailError(error: unknown, fallback: string): Error {
  const message = getErrorMessage(error, fallback)

  for (const [code, userMessage] of Object.entries(AREA_DETAIL_ERROR_MESSAGES)) {
    if (message.includes(code)) {
      return new Error(userMessage)
    }
  }

  return new Error(fallback)
}

function parseSizeSqm(value: AreaDetailRow['size_sqm']): number | null {
  if (value == null || value === '') {
    return null
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function formatSizeLabel(sizeSqm: number | null): string {
  if (sizeSqm == null) {
    return AREA_SIZE_UNKNOWN_LABEL
  }

  return `${sizeSqm.toLocaleString('de-DE')} m²`
}

export function mapAreaDetailRow(row: AreaDetailRow): AreaDetail {
  const sizeSqm = parseSizeSqm(row.size_sqm)

  return {
    id: row.id,
    name: row.name,
    subtitle: row.subtitle ?? '',
    sizeLabel: formatSizeLabel(sizeSqm),
    sizeSqm,
    status: row.status === 'excellent' || row.status === 'observe' ? row.status : 'observe',
    statusLabel: row.status_label ?? 'Entwicklung beobachten',
    summary: row.summary,
    coverImagePath: row.cover_image_path,
  }
}

export async function fetchAreaDetail(areaId: string): Promise<AreaDetail | null> {
  const { data, error } = await supabase
    .from('areas')
    .select(AREA_DETAIL_SELECT)
    .eq('id', areaId)
    .is('archived_at', null)
    .maybeSingle()

  if (error) {
    throw new Error(getErrorMessage(error, 'Fläche konnte nicht geladen werden.'))
  }

  if (!data) {
    return null
  }

  return mapAreaDetailRow(data as AreaDetailRow)
}

export async function updateAreaDetails(input: {
  areaId: string
  name: string
  sizeSqm: number
}): Promise<AreaDetail> {
  const { data, error } = await supabase.rpc('update_area_details', {
    p_area_id: input.areaId,
    p_name: input.name.trim(),
    p_size_sqm: input.sizeSqm,
  })

  if (error) {
    throw mapAreaDetailError(error, AREA_UPDATE_ERROR_MESSAGE)
  }

  if (!data || typeof data !== 'object') {
    throw new Error(AREA_UPDATE_ERROR_MESSAGE)
  }

  const result = data as {
    id?: string
    name?: string
    size_sqm?: number
    cover_image_path?: string | null
  }

  if (!result.id || !result.name || result.size_sqm == null) {
    throw new Error(AREA_UPDATE_ERROR_MESSAGE)
  }

  return mapAreaDetailRow({
    id: result.id,
    name: result.name,
    subtitle: null,
    size_sqm: result.size_sqm,
    status: 'observe',
    status_label: null,
    summary: null,
    cover_image_path: result.cover_image_path ?? null,
  })
}
