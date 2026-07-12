import type { Area, PlusMenuItem } from '../types/area'

export const areas: Area[] = [
  {
    id: 'main',
    name: 'Rose Valley – Hauptfläche',
    subtitle: 'Hauptfläche',
    sizeLabel: '151 m²',
    status: 'excellent',
    statusLabel: 'Hervorragender Zustand',
    summary: 'Die Fläche entwickelt sich aktuell hervorragend.',
    dashboard: {
      score: 93,
      statusLabel: 'Hervorragend',
      briefing:
        'Die Fläche wirkt dicht und gleichmäßig. Die letzte Düngung liegt im Plan. Als Nächstes empfiehlt sich eine visuelle Kontrolle der Kanten und eine kurze Notiz zur Farbentwicklung.',
      lastFertilization: {
        date: '05.07.2026',
        product: 'ICL Sierraform GT Anti-Stress',
      },
      nutrients2026: {
        nitrogen: 17.72,
        phosphate: 0.9,
        potassium: 25.56,
        phosphorusTarget: 0,
      },
    },
  },
  {
    id: 'small',
    name: 'Rose Valley – Kleine Fläche',
    subtitle: 'Kleine Fläche',
    sizeLabel: 'Größe noch nicht festgelegt',
    status: 'observe',
    statusLabel: 'Entwicklung beobachten',
    summary: null,
  },
]

export const plusMenuItems: PlusMenuItem[] = [
  { id: 'fertilization', label: 'Düngung', icon: '◆' },
  { id: 'mowing', label: 'Mahd', icon: '▬' },
  { id: 'watering', label: 'Bewässerung', icon: '◉' },
  { id: 'care', label: 'Pflegemaßnahme', icon: '✦' },
  { id: 'photo', label: 'Foto', icon: '▣' },
  { id: 'observation', label: 'Beobachtung', icon: '◎' },
  { id: 'note', label: 'Notiz', icon: '▤' },
  { id: 'voice', label: 'Einfach erzählen', icon: '◐' },
]

export function getAreaById(id: string): Area | undefined {
  return areas.find((area) => area.id === id)
}
