import type { Area } from '../types/area'
import type { CareGroupMembershipRow } from '../types/careGroup'
import { buildManageAreasLayout } from './careGroupsCore'

export type CareViewTargetType = 'group' | 'area'

export interface CareViewOption {
  type: CareViewTargetType
  id: string
  label: string
  ariaLabel: string
  hint?: string
}

export type CareViewMode = 'separate' | 'connect'

export function formatCareGroupLabel(areaNames: string[], maxVisible = 2): string {
  if (areaNames.length === 0) {
    return ''
  }

  if (areaNames.length <= maxVisible) {
    return areaNames.join(' + ')
  }

  const visible = areaNames.slice(0, maxVisible)
  const remaining = areaNames.length - maxVisible
  return `${visible.join(' + ')} + ${remaining} weitere`
}

export function shouldShowCareViewSection(existingAreaCount: number): boolean {
  return existingAreaCount > 0
}

export function buildCareViewOptions(
  areas: Area[],
  memberships: CareGroupMembershipRow[],
): CareViewOption[] {
  const layout = buildManageAreasLayout(areas, memberships)
  const options: CareViewOption[] = []

  for (const group of layout.groups) {
    const label = formatCareGroupLabel(group.areas.map((area) => area.name))
    options.push({
      type: 'group',
      id: group.id,
      label,
      ariaLabel: `Mit ${label} gemeinsam betrachten. Bestehende gemeinsame Betrachtung wird erweitert.`,
    })
  }

  for (const area of layout.ungroupedAreas) {
    options.push({
      type: 'area',
      id: area.id,
      label: area.name,
      hint: 'Es entsteht eine neue gemeinsame Betrachtung.',
      ariaLabel: `Mit ${area.name} gemeinsam betrachten. Es entsteht eine neue gemeinsame Betrachtung.`,
    })
  }

  return options
}

export function canSubmitCareViewSelection(
  mode: CareViewMode,
  selectedOptionId: string | null,
  options: CareViewOption[],
): boolean {
  if (mode === 'separate') {
    return true
  }

  if (!selectedOptionId) {
    return false
  }

  return options.some((option) => option.id === selectedOptionId)
}

export function resolveCareAssignmentFromSelection(
  mode: CareViewMode,
  selectedOptionId: string | null,
  options: CareViewOption[],
): { joinCareGroupId: string | null; joinAreaId: string | null } {
  if (mode === 'separate' || !selectedOptionId) {
    return { joinCareGroupId: null, joinAreaId: null }
  }

  const selected = options.find((option) => option.id === selectedOptionId)

  if (!selected) {
    return { joinCareGroupId: null, joinAreaId: null }
  }

  if (selected.type === 'group') {
    return { joinCareGroupId: selected.id, joinAreaId: null }
  }

  return { joinCareGroupId: null, joinAreaId: selected.id }
}
