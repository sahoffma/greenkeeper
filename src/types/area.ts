export type AreaStatus = 'excellent' | 'observe'

export interface NutrientBudget {
  nitrogen: number
  phosphate: number
  potassium: number
  phosphorusTarget: number
}

export interface LastFertilization {
  date: string
  product: string
}

export interface AreaDashboard {
  score: number
  statusLabel: string
  briefing: string
  lastFertilization: LastFertilization
  nutrients2026: NutrientBudget
}

export interface Area {
  id: string
  name: string
  subtitle: string
  sizeLabel: string
  sizeSqm?: number | null
  status: AreaStatus
  statusLabel: string
  summary: string | null
  dashboard?: AreaDashboard
}

export interface AreaOutletContext {
  area: Area
  refreshArea: () => Promise<void>
}

export type PlusMenuAction =
  | 'fertilization'
  | 'mowing'
  | 'watering'
  | 'care'
  | 'photo'
  | 'observation'
  | 'note'
  | 'voice'

export interface PlusMenuItem {
  id: PlusMenuAction
  label: string
  icon: string
}

export type NavTab = 'dashboard' | 'timeline' | 'assistant' | 'more'
