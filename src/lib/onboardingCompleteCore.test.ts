import { describe, expect, it } from 'vitest'
import {
  buildCompleteOnboardingPayload,
  buildCompleteOnboardingAreas,
  isOnboardingAlreadyCompletedError,
  resolveOnboardingCareMode,
} from './onboardingCompleteCore'
import {
  buildMultipleLawnOnboardingPayload,
  buildSingleLawnOnboardingPayload,
} from './onboardingPersist'

describe('onboardingCompleteCore', () => {
  it('mappt eine Fläche auf care_mode single', () => {
    expect(
      resolveOnboardingCareMode({
        areaCount: 1,
      }),
    ).toBe('single')

    expect(buildSingleLawnOnboardingPayload(50)).toEqual({
      areas: [{ name: 'Rasenfläche 1', size_sqm: 50, sort_order: 0 }],
      care_mode: 'single',
    })
  })

  it('mappt gemeinsame Pflege auf care_mode together', () => {
    expect(
      buildMultipleLawnOnboardingPayload({
        names: ['Rasenfläche 1', 'Rasenfläche 2'],
        sizes: [40, null],
        carePreference: 'together',
      }),
    ).toEqual({
      areas: [
        { name: 'Rasenfläche 1', size_sqm: 40, sort_order: 0 },
        { name: 'Rasenfläche 2', size_sqm: null, sort_order: 1 },
      ],
      care_mode: 'together',
    })
  })

  it('mappt getrennte Pflege auf care_mode separate', () => {
    expect(
      buildCompleteOnboardingPayload({
        names: ['Rasenfläche 1', 'Rasenfläche 2', 'Rasenfläche 3'],
        sizes: [10, 20, null],
        carePreference: 'separate',
      }).care_mode,
    ).toBe('separate')
  })

  it('überträgt Größen als Zahl oder NULL', () => {
    expect(
      buildCompleteOnboardingAreas({
        names: ['Rasenfläche 1'],
        sizes: [null],
      }),
    ).toEqual([{ name: 'Rasenfläche 1', size_sqm: null, sort_order: 0 }])
  })

  it('erkennt einen bereits abgeschlossenen Onboarding-Fehler', () => {
    expect(isOnboardingAlreadyCompletedError('ONBOARDING_ALREADY_COMPLETED')).toBe(true)
    expect(isOnboardingAlreadyCompletedError('INVALID_PAYLOAD')).toBe(false)
  })

  it('lehnt ungültige Pflegekombinationen ab', () => {
    expect(() =>
      resolveOnboardingCareMode({
        areaCount: 2,
        carePreference: null,
      }),
    ).toThrow('INVALID_CARE_MODE')
  })
})
