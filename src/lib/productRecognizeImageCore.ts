import type { ProductRecognizeFormValue, ProductRecognizeImageAnalysis } from '../types/productRecognize'

export const PRODUCT_RECOGNIZE_IMAGE_MODEL = 'gpt-4o-mini'

const fieldConfidenceSchema = {
  type: 'object',
  properties: {
    brand: { type: 'number' },
    productLine: { type: 'number' },
    productName: { type: 'number' },
    variant: { type: 'number' },
    productDescriptor: { type: 'number' },
    manufacturer: { type: 'number' },
    npk: { type: 'number' },
    packageSize: { type: 'number' },
    form: { type: 'number' },
    gtin: { type: 'number' },
  },
  required: [
    'brand',
    'productLine',
    'productName',
    'variant',
    'productDescriptor',
    'manufacturer',
    'npk',
    'packageSize',
    'form',
    'gtin',
  ],
  additionalProperties: false,
} as const

export const productRecognizeImageSchema = {
  type: 'object',
  properties: {
    brand: { type: ['string', 'null'] },
    productLine: { type: ['string', 'null'] },
    productName: { type: ['string', 'null'] },
    variant: { type: ['string', 'null'] },
    productDescriptor: { type: ['string', 'null'] },
    manufacturer: { type: ['string', 'null'] },
    npkLabel: { type: ['string', 'null'] },
    nitrogen: { type: ['number', 'null'] },
    phosphate: { type: ['number', 'null'] },
    potash: { type: ['number', 'null'] },
    packageSizeValue: { type: ['number', 'null'] },
    packageSizeUnit: { type: ['string', 'null'] },
    form: {
      anyOf: [
        { type: 'string', enum: ['granular', 'liquid', 'unknown'] },
        { type: 'null' },
      ],
    },
    gtin: { type: ['string', 'null'] },
    textFragments: { type: 'array', items: { type: 'string' } },
    fieldConfidence: fieldConfidenceSchema,
  },
  required: [
    'brand',
    'productLine',
    'productName',
    'variant',
    'productDescriptor',
    'manufacturer',
    'npkLabel',
    'nitrogen',
    'phosphate',
    'potash',
    'packageSizeValue',
    'packageSizeUnit',
    'form',
    'gtin',
    'textFragments',
    'fieldConfidence',
  ],
  additionalProperties: false,
} as const

export function buildImageAnalysisInstruction(): string {
  return JSON.stringify({
    instruction:
      'Analysiere ausschließlich die Vorderseite eines Düngersacks. Trenne fachlich: brand (Wortmarke, z. B. Rasendoktor), productLine (z. B. Professional), productName/variant (konkrete Sorte, z. B. Frühjahr & Neuansaat), productDescriptor (generische Bezeichnung wie Rasendünger mit Spurennährstoffen). manufacturer nur wenn ein separates Unternehmen sichtbar ist — niemals productLine als manufacturer. Keine Halluzinationen. NPK nur wenn sichtbar. Confidence 0.0–1.0.',
  })
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }

  return Math.min(1, Math.max(0, value))
}

function parseForm(value: unknown): ProductRecognizeFormValue | null {
  if (value === 'granular' || value === 'liquid' || value === 'unknown') {
    return value
  }

  return null
}

export function parseImageAnalysisResponse(
  record: Record<string, unknown>,
): ProductRecognizeImageAnalysis {
  const confidenceRecord =
    record.fieldConfidence && typeof record.fieldConfidence === 'object'
      ? (record.fieldConfidence as Record<string, unknown>)
      : {}

  const fieldConfidence: Record<string, number> = {
    brand: clampConfidence(confidenceRecord.brand),
    productLine: clampConfidence(confidenceRecord.productLine),
    productName: clampConfidence(confidenceRecord.productName),
    variant: clampConfidence(confidenceRecord.variant),
    productDescriptor: clampConfidence(confidenceRecord.productDescriptor),
    manufacturer: clampConfidence(confidenceRecord.manufacturer),
    npk: clampConfidence(confidenceRecord.npk),
    packageSize: clampConfidence(confidenceRecord.packageSize),
    form: clampConfidence(confidenceRecord.form),
    gtin: clampConfidence(confidenceRecord.gtin),
  }

  return {
    brand: typeof record.brand === 'string' ? record.brand.trim() || null : null,
    productLine:
      typeof record.productLine === 'string' ? record.productLine.trim() || null : null,
    productName:
      typeof record.productName === 'string' ? record.productName.trim() || null : null,
    variant: typeof record.variant === 'string' ? record.variant.trim() || null : null,
    productDescriptor:
      typeof record.productDescriptor === 'string'
        ? record.productDescriptor.trim() || null
        : null,
    manufacturer:
      typeof record.manufacturer === 'string' ? record.manufacturer.trim() || null : null,
    npkLabel: typeof record.npkLabel === 'string' ? record.npkLabel.trim() || null : null,
    nitrogen: typeof record.nitrogen === 'number' ? record.nitrogen : null,
    phosphate: typeof record.phosphate === 'number' ? record.phosphate : null,
    potash: typeof record.potash === 'number' ? record.potash : null,
    packageSizeValue:
      typeof record.packageSizeValue === 'number' ? record.packageSizeValue : null,
    packageSizeUnit:
      typeof record.packageSizeUnit === 'string' ? record.packageSizeUnit.trim() || null : null,
    form: parseForm(record.form),
    gtin: typeof record.gtin === 'string' ? record.gtin.replace(/\D/g, '') || null : null,
    textFragments: Array.isArray(record.textFragments)
      ? record.textFragments.filter((item): item is string => typeof item === 'string')
      : [],
    fieldConfidence,
  }
}
