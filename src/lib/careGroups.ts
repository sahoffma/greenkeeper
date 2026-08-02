import { supabase } from './supabase'
import { getErrorMessage } from './errors'
import type { CareGroupMembershipRow } from '../types/careGroup'

const CARE_GROUP_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Bitte melde dich erneut an.',
  MIN_TWO_AREAS_REQUIRED: 'Wähle mindestens zwei Rasenflächen aus.',
  DUPLICATE_AREA_IDS: 'Die Auswahl ist ungültig. Bitte versuche es erneut.',
  FOREIGN_OR_MISSING_AREA: 'Eine ausgewählte Rasenfläche ist nicht mehr verfügbar.',
  AREA_ALREADY_GROUPED: 'Mindestens eine Fläche wird bereits gemeinsam betrachtet.',
  INVALID_AREA_IDS: 'Die Auswahl ist ungültig.',
  INVALID_AREA_ID: 'Die Rasenfläche ist nicht mehr verfügbar.',
  INVALID_GROUP_ID: 'Diese Verbindung ist nicht mehr verfügbar.',
  FOREIGN_OR_MISSING_GROUP: 'Diese Verbindung gehört nicht zu deinem Konto.',
}

function mapCareGroupError(error: unknown, fallback: string): Error {
  const message = getErrorMessage(error, fallback)

  for (const [code, userMessage] of Object.entries(CARE_GROUP_ERROR_MESSAGES)) {
    if (message.includes(code)) {
      return new Error(userMessage)
    }
  }

  return new Error(fallback)
}

export async function fetchCareGroupMemberships(): Promise<CareGroupMembershipRow[]> {
  const { data: groups, error: groupsError } = await supabase
    .from('care_groups')
    .select('id')
    .is('archived_at', null)

  if (groupsError) {
    throw new Error(getErrorMessage(groupsError, 'Verbindungen konnten nicht geladen werden.'))
  }

  const groupIds = (groups ?? []).map((group) => group.id as string)

  if (groupIds.length === 0) {
    return []
  }

  const { data, error } = await supabase
    .from('care_group_areas')
    .select('care_group_id, area_id')
    .in('care_group_id', groupIds)

  if (error) {
    throw new Error(getErrorMessage(error, 'Verbindungen konnten nicht geladen werden.'))
  }

  return (data ?? []).map((row) => ({
    careGroupId: row.care_group_id as string,
    areaId: row.area_id as string,
  }))
}

export async function connectAreasCareGroup(areaIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('connect_areas_care_group', {
    p_area_ids: areaIds,
  })

  if (error) {
    throw mapCareGroupError(error, 'Die Rasenflächen konnten nicht verbunden werden.')
  }

  return data as string
}

export async function disconnectAreaFromCareGroup(areaId: string): Promise<void> {
  const { error } = await supabase.rpc('disconnect_area_from_care_group', {
    p_area_id: areaId,
  })

  if (error) {
    throw mapCareGroupError(error, 'Die Rasenfläche konnte nicht gelöst werden.')
  }
}

export async function dissolveCareGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('dissolve_care_group', {
    p_group_id: groupId,
  })

  if (error) {
    throw mapCareGroupError(error, 'Die Verbindung konnte nicht aufgehoben werden.')
  }
}
