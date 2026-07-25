export type OnboardingCareMode = 'single' | 'together' | 'separate'

export interface CompleteOnboardingAreaInput {
  name: string
  size_sqm: number | null
  sort_order: number
}

export interface CompleteOnboardingPayload {
  areas: CompleteOnboardingAreaInput[]
  care_mode: OnboardingCareMode
}

export interface CompleteOnboardingMembership {
  care_group_id: string
  area_id: string
}

export interface CompleteOnboardingResult {
  onboarding_completed_at: string
  area_ids: string[]
  care_group_ids: string[]
  memberships: CompleteOnboardingMembership[]
}

export interface ProfileRow {
  id: string
  onboarding_completed_at: string | null
}

export interface CareGroupRow {
  id: string
  user_id: string
  name: string
  sort_order: number
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface CareGroupAreaRow {
  care_group_id: string
  area_id: string
  created_at: string
}
