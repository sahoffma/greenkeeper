import type { LawnCarePreference } from './onboardingFlow'
import type {
  CompleteOnboardingAreaInput,
  CompleteOnboardingPayload,
  OnboardingCareMode,
} from '../types/onboardingComplete'

export function resolveOnboardingCareMode(input: {
  areaCount: number
  carePreference?: LawnCarePreference | null
}): OnboardingCareMode {
  if (input.areaCount === 1) {
    return 'single'
  }

  if (input.carePreference === 'together') {
    return 'together'
  }

  if (input.carePreference === 'separate') {
    return 'separate'
  }

  throw new Error('INVALID_CARE_MODE')
}

export function buildCompleteOnboardingAreas(input: {
  names: string[]
  sizes: Array<number | null>
}): CompleteOnboardingAreaInput[] {
  return input.names.map((name, index) => ({
    name,
    size_sqm: input.sizes[index] ?? null,
    sort_order: index,
  }))
}

export function buildCompleteOnboardingPayload(input: {
  names: string[]
  sizes: Array<number | null>
  carePreference?: LawnCarePreference | null
}): CompleteOnboardingPayload {
  const areas = buildCompleteOnboardingAreas(input)

  return {
    areas,
    care_mode: resolveOnboardingCareMode({
      areaCount: areas.length,
      carePreference: input.carePreference,
    }),
  }
}

export function isOnboardingAlreadyCompletedError(message: string): boolean {
  return message.includes('ONBOARDING_ALREADY_COMPLETED')
}
