import type { ActivityType } from '../types/activity'

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  fertilization: 'Düngung',
  mowing: 'Mähen',
  watering: 'Bewässerung',
  aerating: 'Vertikutieren',
  overseeding: 'Nachsäen',
  application: 'Ausbringung',
  other: 'Maßnahme',
}

export function activityTypeRequiresProduct(activityType: ActivityType): boolean {
  return activityType === 'fertilization' || activityType === 'application'
}

export function formatRelativeDateLabel(dateValue: string, referenceDate: string): string {
  if (dateValue === referenceDate) {
    return 'Heute'
  }

  const reference = new Date(referenceDate)
  const target = new Date(dateValue)

  if (Number.isNaN(reference.getTime()) || Number.isNaN(target.getTime())) {
    return dateValue
  }

  const yesterday = new Date(reference)
  yesterday.setDate(reference.getDate() - 1)
  const yesterdayValue = yesterday.toISOString().slice(0, 10)

  if (dateValue === yesterdayValue) {
    return 'Gestern'
  }

  return target.toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
