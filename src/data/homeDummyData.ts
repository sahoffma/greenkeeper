export const conversationPrompts = [
  'Ich habe heute gemäht.',
  'Ich habe einen neuen Dünger gekauft.',
  'Wann habe ich zuletzt vertikutiert?',
  'Lege eine zweite Rasenfläche an.',
] as const

export interface DummyLawnArea {
  id: string
  name: string
  lastActivity: string
  imageVariant: 'main' | 'side'
}

export const dummyLawnAreas: DummyLawnArea[] = [
  {
    id: 'main',
    name: 'Hauptfläche',
    lastActivity: 'Heute gemäht',
    imageVariant: 'main',
  },
  {
    id: 'side',
    name: 'Seitenfläche',
    lastActivity: 'Samstag gedüngt',
    imageVariant: 'side',
  },
]
