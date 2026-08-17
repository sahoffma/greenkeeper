import { describe, expect, it } from 'vitest'
import {
  formatAreaSizeForScreenReader,
  formatOnboardingGroupingSize,
  formatOnboardingSummarySize,
  getHomeAreaSizeDetail,
  HOME_SIZE_HINT,
  ONBOARDING_GROUPING_SIZE_UNKNOWN,
  ONBOARDING_SUMMARY_SIZE_UNKNOWN,
} from './areaSizeDisplay'

describe('areaSizeDisplay', () => {
  it('formatiert unbekannte Größen für Zusammenfassung und Gruppierung', () => {
    expect(formatOnboardingSummarySize(null)).toBe(ONBOARDING_SUMMARY_SIZE_UNKNOWN)
    expect(formatOnboardingGroupingSize(null)).toBe(ONBOARDING_GROUPING_SIZE_UNKNOWN)
    expect(formatOnboardingSummarySize(150)).toBe('150 m²')
  })

  it('liefert Screenreader-Text für unbekannte Größe', () => {
    expect(formatAreaSizeForScreenReader(null)).toContain('nicht angegeben')
  })

  it('zeigt auf der Startseite Größe ergänzen statt 0 m²', () => {
    expect(
      getHomeAreaSizeDetail({
        sizeSqm: null,
        sizeLabel: 'Größe noch nicht angegeben',
      }),
    ).toBe(HOME_SIZE_HINT)

    expect(
      getHomeAreaSizeDetail({
        sizeSqm: 120,
        sizeLabel: '120 m²',
      }),
    ).toBe('120 m²')
  })
})
