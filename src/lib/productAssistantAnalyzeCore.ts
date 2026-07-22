import type {
  ApplicationMethod,
  NutrientBasis,
  ProductForm,
} from '../types/product'
import type { ProductAssistantAnalysisResult } from '../types/productAssistant'

const PRODUCT_FORMS: ProductForm[] = ['granular', 'liquid', 'soluble_powder', 'other']
const NUTRIENT_BASES: NutrientBasis[] = ['mass_mass', 'mass_volume', 'grams_per_liter', 'unknown']
const APPLICATION_METHODS: ApplicationMethod[] = ['foliar', 'soil', 'both']

export const productAssistantAnalysisSchema = {
  type: 'object',
  properties: {
    manufacturer: { type: ['string', 'null'] },
    officialName: { type: ['string', 'null'] },
    productForm: {
      anyOf: [{ type: 'string', enum: PRODUCT_FORMS }, { type: 'null' }],
    },
    npk: { type: ['string', 'null'] },
    nPercent: { type: ['number', 'null'] },
    p2o5Percent: { type: ['number', 'null'] },
    k2oPercent: { type: ['number', 'null'] },
    mgoPercent: { type: ['number', 'null'] },
    so3Percent: { type: ['number', 'null'] },
    fePercent: { type: ['number', 'null'] },
    mnPercent: { type: ['number', 'null'] },
    recommendedRateMin: { type: ['number', 'null'] },
    recommendedRateMax: { type: ['number', 'null'] },
    recommendedRateUnit: { type: ['string', 'null'] },
    liquidRateMin: { type: ['number', 'null'] },
    liquidRateMax: { type: ['number', 'null'] },
    densityKgPerL: { type: ['number', 'null'] },
    nutrientBasis: {
      anyOf: [{ type: 'string', enum: NUTRIENT_BASES }, { type: 'null' }],
    },
    applicationMethod: {
      anyOf: [{ type: 'string', enum: APPLICATION_METHODS }, { type: 'null' }],
    },
    longevityWeeksMin: { type: ['number', 'null'] },
    longevityWeeksMax: { type: ['number', 'null'] },
    sourceDescription: { type: ['string', 'null'] },
    missingFields: { type: 'array', items: { type: 'string' } },
    uncertainFields: { type: 'array', items: { type: 'string' } },
    warnings: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'manufacturer',
    'officialName',
    'productForm',
    'npk',
    'nPercent',
    'p2o5Percent',
    'k2oPercent',
    'mgoPercent',
    'so3Percent',
    'fePercent',
    'mnPercent',
    'recommendedRateMin',
    'recommendedRateMax',
    'recommendedRateUnit',
    'liquidRateMin',
    'liquidRateMax',
    'densityKgPerL',
    'nutrientBasis',
    'applicationMethod',
    'longevityWeeksMin',
    'longevityWeeksMax',
    'sourceDescription',
    'missingFields',
    'uncertainFields',
    'warnings',
  ],
  additionalProperties: false,
} as const

export function isDevModeEnabled(): boolean {
  return process.env.PRODUCT_ASSISTANT_DEV_MODE === 'true'
}

export function buildDevModeAnalysis(input: {
  manufacturer?: string
  officialName?: string
  spokenProductName?: string
  sourceType?: string
  hasImage?: boolean
  hasPdf?: boolean
  hasUrl?: boolean
}): ProductAssistantAnalysisResult | { error: string } {
  const hasImage = input.hasImage ?? false
  const hasPdf = input.hasPdf ?? false
  const hasUrl = input.hasUrl ?? false

  if (hasImage || hasPdf) {
    const spoken = input.spokenProductName?.trim() ?? ''
    const manufacturer = input.manufacturer?.trim() ?? ''
    const officialName = input.officialName?.trim() ?? spoken

    if (!officialName) {
      return {
        error:
          'Bildanalyse ist im Entwicklungsmodus deaktiviert. Bitte OPENAI_API_KEY konfigurieren oder Hersteller und Produktname ergänzen.',
      }
    }

    const sourceDescription =
      hasPdf
        ? 'PDF-Upload (Entwicklungsmodus – Inhalt nicht ausgewertet)'
        : 'Verpackungsfotos (Entwicklungsmodus – Bilder nicht ausgewertet)'

    return {
      devMode: true,
      manufacturer: manufacturer || null,
      officialName,
      productForm: null,
      npk: null,
      nPercent: null,
      p2o5Percent: null,
      k2oPercent: null,
      mgoPercent: null,
      so3Percent: null,
      fePercent: null,
      mnPercent: null,
      recommendedRateMin: null,
      recommendedRateMax: null,
      recommendedRateUnit: null,
      liquidRateMin: null,
      liquidRateMax: null,
      densityKgPerL: null,
      nutrientBasis: null,
      applicationMethod: null,
      longevityWeeksMin: null,
      longevityWeeksMax: null,
      sourceDescription,
      missingFields: [
        'productForm',
        'npk',
        'nPercent',
        'p2o5Percent',
        'k2oPercent',
        'fePercent',
        'mnPercent',
        'recommendedRateMin',
        'longevityWeeksMin',
        'applicationMethod',
      ],
      uncertainFields: manufacturer ? [] : ['manufacturer'],
      warnings: [
        'Entwicklungsmodus: Bild- und PDF-Analyse ist deaktiviert. Der Produktname aus deiner Spracheingabe wurde übernommen.',
      ],
    }
  }

  const manufacturer = input.manufacturer?.trim() ?? ''
  const officialName =
    input.officialName?.trim() ?? input.spokenProductName?.trim() ?? ''

  if (!officialName) {
    return {
      error: 'Bitte gib mindestens einen Produktnamen an.',
    }
  }

  if (!manufacturer && !hasUrl) {
    return {
      devMode: true,
      manufacturer: null,
      officialName,
      productForm: null,
      npk: null,
      nPercent: null,
      p2o5Percent: null,
      k2oPercent: null,
      mgoPercent: null,
      so3Percent: null,
      fePercent: null,
      mnPercent: null,
      recommendedRateMin: null,
      recommendedRateMax: null,
      recommendedRateUnit: null,
      liquidRateMin: null,
      liquidRateMax: null,
      densityKgPerL: null,
      nutrientBasis: null,
      applicationMethod: null,
      longevityWeeksMin: null,
      longevityWeeksMax: null,
      sourceDescription: 'Spracheingabe (Entwicklungsmodus)',
      missingFields: [
        'manufacturer',
        'productForm',
        'npk',
        'nPercent',
        'p2o5Percent',
        'k2oPercent',
        'fePercent',
        'mnPercent',
        'recommendedRateMin',
        'longevityWeeksMin',
        'applicationMethod',
      ],
      uncertainFields: ['manufacturer'],
      warnings: [
        'Entwicklungsmodus: Es wurden keine Nährstoff- oder Dosierungswerte erfunden.',
      ],
    }
  }

  if (!manufacturer || !officialName) {
    return {
      error: 'Bitte gib Hersteller und Produktname an.',
    }
  }

  const missingFields = [
    'productForm',
    'npk',
    'nPercent',
    'p2o5Percent',
    'k2oPercent',
    'fePercent',
    'mnPercent',
    'recommendedRateMin',
    'longevityWeeksMin',
    'applicationMethod',
  ]

  return {
    devMode: true,
    manufacturer,
    officialName,
    productForm: null,
    npk: null,
    nPercent: null,
    p2o5Percent: null,
    k2oPercent: null,
    mgoPercent: null,
    so3Percent: null,
    fePercent: null,
    mnPercent: null,
    recommendedRateMin: null,
    recommendedRateMax: null,
    recommendedRateUnit: null,
    liquidRateMin: null,
    liquidRateMax: null,
    densityKgPerL: null,
    nutrientBasis: null,
    applicationMethod: null,
    longevityWeeksMin: null,
    longevityWeeksMax: null,
    sourceDescription: hasUrl
      ? `URL-Quelle (${input.sourceType ?? 'link'}) – Entwicklungsmodus`
      : 'Manuelle Eingabe (Entwicklungsmodus)',
    missingFields,
    uncertainFields: [],
    warnings: [
      'Entwicklungsmodus: Es wurden keine Nährstoff- oder Dosierungswerte erfunden.',
    ],
  }
}

export function parseAnalysisResponse(
  record: Record<string, unknown>,
  devMode = false,
): ProductAssistantAnalysisResult {
  return {
    devMode,
    manufacturer: typeof record.manufacturer === 'string' ? record.manufacturer : null,
    officialName: typeof record.officialName === 'string' ? record.officialName : null,
    productForm: PRODUCT_FORMS.includes(record.productForm as ProductForm)
      ? (record.productForm as ProductForm)
      : null,
    npk: typeof record.npk === 'string' ? record.npk : null,
    nPercent: typeof record.nPercent === 'number' ? record.nPercent : null,
    p2o5Percent: typeof record.p2o5Percent === 'number' ? record.p2o5Percent : null,
    k2oPercent: typeof record.k2oPercent === 'number' ? record.k2oPercent : null,
    mgoPercent: typeof record.mgoPercent === 'number' ? record.mgoPercent : null,
    so3Percent: typeof record.so3Percent === 'number' ? record.so3Percent : null,
    fePercent: typeof record.fePercent === 'number' ? record.fePercent : null,
    mnPercent: typeof record.mnPercent === 'number' ? record.mnPercent : null,
    recommendedRateMin:
      typeof record.recommendedRateMin === 'number' ? record.recommendedRateMin : null,
    recommendedRateMax:
      typeof record.recommendedRateMax === 'number' ? record.recommendedRateMax : null,
    recommendedRateUnit:
      typeof record.recommendedRateUnit === 'string' ? record.recommendedRateUnit : null,
    liquidRateMin: typeof record.liquidRateMin === 'number' ? record.liquidRateMin : null,
    liquidRateMax: typeof record.liquidRateMax === 'number' ? record.liquidRateMax : null,
    densityKgPerL: typeof record.densityKgPerL === 'number' ? record.densityKgPerL : null,
    nutrientBasis: NUTRIENT_BASES.includes(record.nutrientBasis as NutrientBasis)
      ? (record.nutrientBasis as NutrientBasis)
      : null,
    applicationMethod: APPLICATION_METHODS.includes(record.applicationMethod as ApplicationMethod)
      ? (record.applicationMethod as ApplicationMethod)
      : null,
    longevityWeeksMin:
      typeof record.longevityWeeksMin === 'number' ? record.longevityWeeksMin : null,
    longevityWeeksMax:
      typeof record.longevityWeeksMax === 'number' ? record.longevityWeeksMax : null,
    sourceDescription:
      typeof record.sourceDescription === 'string' ? record.sourceDescription : null,
    missingFields: Array.isArray(record.missingFields)
      ? record.missingFields.filter((item): item is string => typeof item === 'string')
      : [],
    uncertainFields: Array.isArray(record.uncertainFields)
      ? record.uncertainFields.filter((item): item is string => typeof item === 'string')
      : [],
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024

export function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

export function stripDataUrl(base64OrDataUrl: string): { base64: string; mimeType: string | null } {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(base64OrDataUrl)

  if (!match) {
    return { base64: base64OrDataUrl, mimeType: null }
  }

  return { base64: match[2], mimeType: match[1] }
}
