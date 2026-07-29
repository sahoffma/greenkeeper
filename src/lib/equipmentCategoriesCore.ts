export type EquipmentCategoryId =
  | 'duenger'
  | 'boden-hilfsstoffe'
  | 'saatgut'
  | 'pflanzenschutz'
  | 'bewaesserung'
  | 'geraete'

export interface EquipmentCategory {
  id: EquipmentCategoryId
  title: string
  subtitle: string
  path: string
}

export const EQUIPMENT_CATEGORIES: EquipmentCategory[] = [
  {
    id: 'geraete',
    title: 'Geräte',
    subtitle: 'Mäher, Werkzeug und zuverlässige Begleiter',
    path: '/ausruestung/geraete',
  },
  {
    id: 'duenger',
    title: 'Dünger',
    subtitle: 'Alles rund um deinen Dünger',
    path: '/ausruestung/duenger',
  },
  {
    id: 'saatgut',
    title: 'Saatgut',
    subtitle: 'Für Neubeginn und dichtere Flächen',
    path: '/ausruestung/saatgut',
  },
  {
    id: 'bewaesserung',
    title: 'Bewässerung',
    subtitle: 'Regner, Systeme und alles für Feuchtigkeit',
    path: '/ausruestung/bewaesserung',
  },
  {
    id: 'boden-hilfsstoffe',
    title: 'Boden & Hilfsstoffe',
    subtitle: 'Erde, Sand und Hilfsstoffe für deinen Boden',
    path: '/ausruestung/boden-hilfsstoffe',
  },
  {
    id: 'pflanzenschutz',
    title: 'Pflanzenschutz',
    subtitle: 'Schutz und Balance für deinen Rasen',
    path: '/ausruestung/pflanzenschutz',
  },
]

export function findEquipmentCategoryBySlug(slug: string): EquipmentCategory | undefined {
  return EQUIPMENT_CATEGORIES.find((category) => category.id === slug)
}
