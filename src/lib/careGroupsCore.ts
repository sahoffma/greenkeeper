import type { Area } from '../types/area'
import type { CareGroupMembershipRow, CareGroupSummary } from '../types/careGroup'

export interface ManageAreasLayoutGroup {
  id: string
  areas: Area[]
}

export interface ManageAreasLayout {
  groups: ManageAreasLayoutGroup[]
  ungroupedAreas: Area[]
}

export function buildCareGroupSummaries(
  memberships: CareGroupMembershipRow[],
): CareGroupSummary[] {
  const byGroup = new Map<string, string[]>()

  for (const membership of memberships) {
    const current = byGroup.get(membership.careGroupId) ?? []
    current.push(membership.areaId)
    byGroup.set(membership.careGroupId, current)
  }

  return [...byGroup.entries()]
    .map(([id, areaIds]) => ({ id, areaIds }))
    .filter((group) => group.areaIds.length >= 2)
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function getCareGroupIdForArea(
  areaId: string,
  memberships: CareGroupMembershipRow[],
): string | null {
  const membership = memberships.find((entry) => entry.areaId === areaId)
  if (!membership) {
    return null
  }

  const groupSize = memberships.filter(
    (entry) => entry.careGroupId === membership.careGroupId,
  ).length

  return groupSize >= 2 ? membership.careGroupId : null
}

export function buildManageAreasLayout(
  areas: Area[],
  memberships: CareGroupMembershipRow[],
): ManageAreasLayout {
  const summaries = buildCareGroupSummaries(memberships)
  const groupedAreaIds = new Set<string>()

  const groups = summaries.map((summary) => {
    const groupAreas = summary.areaIds
      .map((areaId) => areas.find((area) => area.id === areaId))
      .filter((area): area is Area => area != null)

    groupAreas.forEach((area) => groupedAreaIds.add(area.id))

    return {
      id: summary.id,
      areas: groupAreas,
    }
  })

  const ungroupedAreas = areas.filter((area) => !groupedAreaIds.has(area.id))

  return { groups, ungroupedAreas }
}

export function getUngroupedAreaIds(
  areas: Area[],
  memberships: CareGroupMembershipRow[],
): string[] {
  return buildManageAreasLayout(areas, memberships).ungroupedAreas.map((area) => area.id)
}

export function canStartConnectMode(ungroupedCount: number): boolean {
  return ungroupedCount >= 2
}

export function canSubmitConnectSelection(selectedAreaIds: string[]): boolean {
  return selectedAreaIds.length >= 2
}

export function isAreaEligibleForConnect(
  areaId: string,
  memberships: CareGroupMembershipRow[],
): boolean {
  return getCareGroupIdForArea(areaId, memberships) == null
}

export function validateConnectSelection(
  selectedAreaIds: string[],
  eligibleAreaIds: string[],
): boolean {
  if (!canSubmitConnectSelection(selectedAreaIds)) {
    return false
  }

  const eligible = new Set(eligibleAreaIds)
  return selectedAreaIds.every((areaId) => eligible.has(areaId))
}

export function getCareGroupAccentIndex(groupId: string, groupIds: string[]): number {
  const sorted = [...groupIds].sort((left, right) => left.localeCompare(right))
  const index = sorted.indexOf(groupId)
  return index >= 0 ? index : 0
}

/** Orientierungsnummer ab 1 – nur bei mehr als einer Flächengruppe. */
export function getCareGroupDisplayNumber(groupId: string, groupIds: string[]): number | null {
  if (groupIds.length <= 1) {
    return null
  }

  return getCareGroupAccentIndex(groupId, groupIds) + 1
}
