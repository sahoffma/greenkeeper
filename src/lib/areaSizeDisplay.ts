export const ONBOARDING_GROUPING_SIZE_UNKNOWN = 'Größe nicht angegeben'
export const ONBOARDING_SUMMARY_SIZE_UNKNOWN = 'Größe noch nicht angegeben'
export const AREA_SIZE_UNKNOWN_LABEL = 'Größe noch nicht angegeben'
export const HOME_SIZE_HINT = 'Größe ergänzen'

export function formatOnboardingSummarySize(sizeSqm: number | null): string {
  if (sizeSqm == null) {
    return ONBOARDING_SUMMARY_SIZE_UNKNOWN
  }

  return `${sizeSqm.toLocaleString('de-DE')} m²`
}

export function formatOnboardingGroupingSize(sizeSqm: number | null): string {
  if (sizeSqm == null) {
    return ONBOARDING_GROUPING_SIZE_UNKNOWN
  }

  return `${sizeSqm.toLocaleString('de-DE')} m²`
}

export function formatAreaSizeForScreenReader(sizeSqm: number | null): string {
  if (sizeSqm == null) {
    return 'Größe der Rasenfläche nicht angegeben. Kann später ergänzt werden.'
  }

  return `${sizeSqm.toLocaleString('de-DE')} Quadratmeter`
}

export function getHomeAreaSizeDetail(area: {
  sizeSqm?: number | null
  sizeLabel: string
}): string {
  if (area.sizeSqm != null) {
    return area.sizeLabel
  }

  return HOME_SIZE_HINT
}
