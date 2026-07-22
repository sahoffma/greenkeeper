export type ActivityType =
  | 'fertilization'
  | 'mowing'
  | 'watering'
  | 'aerating'
  | 'overseeding'
  | 'application'
  | 'other'

export interface TimelineActivity {
  id: string
  date: string
  occurredAt: string
  createdAt: string
  title: string
  typeLabel: string
  activityType: ActivityType
  productName: string | null
  amountApplied: number | null
  amountUnit: string | null
  mowHeightMm: number | null
  notes: string | null
}

export interface MeasureActivityFormData {
  id: string
  areaId: string
  activityType: ActivityType
  activityLabel: string
  occurredAt: string
  productName: string | null
  amountApplied: number | null
  amountUnit: string | null
  mowHeightMm: number | null
  notes: string | null
}

/** @deprecated Alias für Abwärtskompatibilität */
export type FertilizationActivityFormData = MeasureActivityFormData
