import type { ActivityType } from './activity'

export type ParsedActivityUnit = 'g/m²' | 'kg' | 'g' | 'ml' | 'l' | 'l/m²' | 'mm'

export interface ParsedActivityResult {
  activityType: ActivityType
  activityLabel: string
  date: string
  productName: string | null
  amount: number | null
  unit: ParsedActivityUnit | null
  mowHeightMm: number | null
  note: string | null
  confidence: number
  warnings: string[]
}

export interface ParseActivityRequest {
  transcript: string
  currentDate: string
  currentAreaName: string
}
