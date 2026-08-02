export interface CareGroupMembershipRow {
  careGroupId: string
  areaId: string
}

export interface CareGroupSummary {
  id: string
  areaIds: string[]
}

export interface AreaCareGroupState {
  memberships: CareGroupMembershipRow[]
  groups: CareGroupSummary[]
}
