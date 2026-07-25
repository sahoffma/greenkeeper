import { buildLawnAreaName } from './onboardingFlow'
import {
  buildCompleteOnboardingPayload,
  isOnboardingAlreadyCompletedError,
} from './onboardingCompleteCore'
import type { LawnCarePreference } from './onboardingFlow'
import type { CompleteOnboardingPayload, CompleteOnboardingResult } from '../types/onboardingComplete'
import { supabase } from './supabase'

export const GREENKEEPER_HOME_ROUTE = '/' as const

export const ONBOARDING_SAVE_ERROR_MESSAGE =
  'Das hat gerade nicht geklappt. Bitte versuche es noch einmal.'

export function getOnboardingSubmitLabel(isFinalStep: boolean): string {
  return isFinalStep ? 'Los geht’s' : 'Weiter'
}

export function isLastMultipleSizeStep(index: number, count: number): boolean {
  return index >= count
}

export function buildSingleLawnOnboardingPayload(
  sizeSqm: number | null,
): CompleteOnboardingPayload {
  return buildCompleteOnboardingPayload({
    names: [buildLawnAreaName(1)],
    sizes: [sizeSqm],
  })
}

export function buildMultipleLawnOnboardingPayload(input: {
  names: string[]
  sizes: Array<number | null>
  carePreference: LawnCarePreference
}): CompleteOnboardingPayload {
  return buildCompleteOnboardingPayload({
    names: input.names,
    sizes: input.sizes,
    carePreference: input.carePreference,
  })
}

function parseCompleteOnboardingResult(value: unknown): CompleteOnboardingResult {
  if (typeof value !== 'object' || value === null) {
    throw new Error(ONBOARDING_SAVE_ERROR_MESSAGE)
  }

  const result = value as Partial<CompleteOnboardingResult>

  if (
    typeof result.onboarding_completed_at !== 'string' ||
    !Array.isArray(result.area_ids) ||
    !Array.isArray(result.care_group_ids) ||
    !Array.isArray(result.memberships)
  ) {
    throw new Error(ONBOARDING_SAVE_ERROR_MESSAGE)
  }

  return {
    onboarding_completed_at: result.onboarding_completed_at,
    area_ids: result.area_ids,
    care_group_ids: result.care_group_ids,
    memberships: result.memberships,
  }
}

export async function completeOnboarding(
  payload: CompleteOnboardingPayload,
): Promise<CompleteOnboardingResult> {
  const { data, error } = await supabase.rpc('complete_onboarding', {
    payload,
  })

  if (error) {
    if (isOnboardingAlreadyCompletedError(error.message)) {
      throw new Error('ONBOARDING_ALREADY_COMPLETED')
    }

    throw new Error(ONBOARDING_SAVE_ERROR_MESSAGE)
  }

  return parseCompleteOnboardingResult(data)
}

export async function saveSingleLawnOnboarding(sizeSqm: number | null): Promise<CompleteOnboardingResult> {
  return completeOnboarding(buildSingleLawnOnboardingPayload(sizeSqm))
}

export async function saveMultipleLawnOnboarding(input: {
  names: string[]
  sizes: Array<number | null>
  carePreference: LawnCarePreference
}): Promise<CompleteOnboardingResult> {
  return completeOnboarding(buildMultipleLawnOnboardingPayload(input))
}
