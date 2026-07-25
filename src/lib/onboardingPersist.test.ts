import { describe, expect, it } from 'vitest'
import {
  getOnboardingSubmitLabel,
  isLastMultipleSizeStep,
  ONBOARDING_SAVE_ERROR_MESSAGE,
} from './onboardingPersist'

describe('onboardingPersist', () => {
  it('zeigt auf dem letzten Schritt „Los geht’s“, sonst „Weiter“', () => {
    expect(getOnboardingSubmitLabel(true)).toBe('Los geht’s')
    expect(getOnboardingSubmitLabel(false)).toBe('Weiter')
  })

  it('erkennt den letzten Mehrflächen-Größenschritt', () => {
    expect(isLastMultipleSizeStep(1, 2)).toBe(false)
    expect(isLastMultipleSizeStep(2, 2)).toBe(true)
    expect(isLastMultipleSizeStep(3, 3)).toBe(true)
  })

  it('verwendet den vorgeschlagenen Fehlertext', () => {
    expect(ONBOARDING_SAVE_ERROR_MESSAGE).toBe(
      'Das hat gerade nicht geklappt. Bitte versuche es noch einmal.',
    )
  })
})
