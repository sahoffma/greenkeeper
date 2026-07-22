export type SharedActivityType =
  | 'fertilization'
  | 'mowing'
  | 'watering'
  | 'aerating'
  | 'overseeding'
  | 'application'
  | 'other'

export type SharedParsedActivityUnit = 'g/m²' | 'kg' | 'g' | 'ml' | 'l' | 'l/m²' | 'mm'

export interface SharedParsedActivityResult {
  activityType: SharedActivityType
  activityLabel: string
  date: string
  productName: string | null
  amount: number | null
  unit: SharedParsedActivityUnit | null
  mowHeightMm: number | null
  note: string | null
  confidence: number
  warnings: string[]
}

const ACTIVITY_TYPES: SharedActivityType[] = [
  'fertilization',
  'mowing',
  'watering',
  'aerating',
  'overseeding',
  'application',
  'other',
]

const ACTIVITY_TYPE_LABELS: Record<SharedActivityType, string> = {
  fertilization: 'Düngung',
  mowing: 'Mähen',
  watering: 'Bewässerung',
  aerating: 'Vertikutieren',
  overseeding: 'Nachsäen',
  application: 'Ausbringung',
  other: 'Maßnahme',
}

const PARSED_UNITS: SharedParsedActivityUnit[] = ['g/m²', 'kg', 'g', 'ml', 'l', 'l/m²', 'mm']

export const activityParseSchema = {
  type: 'object',
  properties: {
    activityType: {
      type: 'string',
      enum: ACTIVITY_TYPES,
    },
    activityLabel: {
      type: 'string',
    },
    date: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    productName: {
      type: ['string', 'null'],
    },
    amount: {
      type: ['number', 'null'],
    },
    unit: {
      anyOf: [
        {
          type: 'string',
          enum: PARSED_UNITS,
        },
        {
          type: 'null',
        },
      ],
    },
    mowHeightMm: {
      type: ['number', 'null'],
    },
    note: {
      type: ['string', 'null'],
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },
    warnings: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
  required: [
    'activityType',
    'activityLabel',
    'date',
    'productName',
    'amount',
    'unit',
    'mowHeightMm',
    'note',
    'confidence',
    'warnings',
  ],
  additionalProperties: false,
} as const

export function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function normalizeParsedActivity(
  record: Record<string, unknown>,
): SharedParsedActivityResult | null {
  const activityType = ACTIVITY_TYPES.includes(record.activityType as SharedActivityType)
    ? (record.activityType as SharedActivityType)
    : null

  if (
    !activityType ||
    typeof record.date !== 'string' ||
    !isValidIsoDate(record.date) ||
    typeof record.confidence !== 'number' ||
    !Array.isArray(record.warnings)
  ) {
    return null
  }

  const activityLabel =
    typeof record.activityLabel === 'string' && record.activityLabel.trim()
      ? record.activityLabel.trim()
      : ACTIVITY_TYPE_LABELS[activityType]

  const unit = PARSED_UNITS.includes(record.unit as SharedParsedActivityUnit)
    ? (record.unit as SharedParsedActivityUnit)
    : null

  return {
    activityType,
    activityLabel,
    date: record.date,
    productName: typeof record.productName === 'string' ? record.productName : null,
    amount: typeof record.amount === 'number' ? record.amount : null,
    unit,
    mowHeightMm: typeof record.mowHeightMm === 'number' ? record.mowHeightMm : null,
    note: typeof record.note === 'string' ? record.note : null,
    confidence: record.confidence,
    warnings: record.warnings.filter((item): item is string => typeof item === 'string'),
  }
}
