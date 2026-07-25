import { supabase } from './supabase'
import { getErrorMessage } from './errors'

export interface UserProfileState {
  onboardingCompletedAt: string | null
}

export async function fetchUserProfileState(userId: string): Promise<UserProfileState> {
  const { data, error } = await supabase
    .from('profiles')
    .select('onboarding_completed_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(getErrorMessage(error, 'Profil konnte nicht geladen werden.'))
  }

  return {
    onboardingCompletedAt: data?.onboarding_completed_at ?? null,
  }
}

export function isOnboardingCompleted(profile: UserProfileState | null): boolean {
  return profile?.onboardingCompletedAt != null
}
