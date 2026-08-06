import type { ProductRecognizeFormValue, ProductRecognizeImageAnalysis } from '../types/productRecognize'
import {
  extractPackageSizeFromTextFragments,
  normalizePackageSizeUnit,
  parsePackageSizeFromRawText,
} from './productRecognizePackageSizeParseCore'

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
    packageSizeValue: { type: ['number', 'string', 'null'] },
    packageSizeUnit: { type: ['string', 'null'] },
    form: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
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
      'Analysiere ausschließlich die Vorderseite eines Düngersacks. Trenne fachlich: brand (Wortmarke, z. B. Rasendoktor), productLine (z. B. Professional), productName/variant (konkrete Sorte, z. B. Frühjahr & Neuansaat), productDescriptor (generische Bezeichnung wie Rasendünger mit Spurennährstoffen). manufacturer nur wenn ein separates Unternehmen sichtbar ist — niemals productLine als manufacturer. Extrahiere die Netto-Gebindegröße separat als packageSizeValue (Zahl) und packageSizeUnit (kg, g, l oder ml). Beispiele: „5 kg“ → packageSizeValue 5, packageSizeUnit „kg“; „500 g“ → 500, „g“; „1 l“ → 1, „l“; „500 ml“ → 500, „ml“. null wenn nicht sichtbar. Keine Halluzinationen. NPK nur wenn sichtbar. Confidence 0.0–1.0.',
  })
}

export function buildEmptyFieldConfidenceRecord(): Record<string, number> {
  return {
    brand: 0,
    productLine: 0,
    productName: 0,
    variant: 0,
    productDescriptor: 0,
    manufacturer: 0,
    npk: 0,
    packageSize: 0,
    form: 0,
    gtin: 0,
  }
}

function readNestedPackageSizeRecord(
  record: Record<string, unknown>,
): Record<string, unknown> | null {
  const nested = record.packageSize
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
    return null
  }

  return nested as Record<string, unknown>
}

function resolveRawPackageSizeFields(record: Record<string, unknown>): {
  value: unknown
  unit: unknown
} {
  if (record.packageSizeValue != null || record.packageSizeUnit != null) {
    return { value: record.packageSizeValue, unit: record.packageSizeUnit }
  }

  if (record.package_size_value != null || record.package_size_unit != null) {
    return { value: record.package_size_value, unit: record.package_size_unit }
  }

  const nested = readNestedPackageSizeRecord(record)
  if (nested) {
    return {
      value:
        nested.value ??
        nested.packageSizeValue ??
        nested.size ??
        nested.quantity ??
        nested.netWeight ??
        nested.weight ??
        null,
      unit: nested.unit ?? nested.packageSizeUnit ?? null,
    }
  }

  if (record.netWeight != null || record.quantity != null) {
    return {
      value: record.netWeight ?? record.quantity ?? null,
      unit: record.unit ?? null,
    }
  }

  return { value: null, unit: null }
}

function clampConfidence(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 0
  }

  return Math.min(1, Math.max(0, value))
}

export function coerceNumericPackageSizeValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    const parsed = Number(trimmed.replace(',', '.'))
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}

function parseForm(value: unknown): ProductRecognizeFormValue | null {
  if (value === 'granular' || value === 'liquid' || value === 'unknown') {
    return value
  }

  return null
}

function parseFormField(value: unknown): {
  form: ProductRecognizeFormValue | null
  formLabel: string | null
} {
  if (value == null) {
    return { form: null, formLabel: null }
  }

  if (typeof value !== 'string') {
    return { form: null, formLabel: null }
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return { form: null, formLabel: null }
  }

  const parsedEnum = parseForm(trimmed)
  if (parsedEnum != null) {
    return { form: parsedEnum, formLabel: null }
  }

  return { form: null, formLabel: trimmed }
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

  const rawPackage = resolveRawPackageSizeFields(record)
  let packageSizeValue = coerceNumericPackageSizeValue(rawPackage.value)
  let packageSizeUnit =
    typeof rawPackage.unit === 'string' ? normalizePackageSizeUnit(rawPackage.unit) : null

  if (packageSizeValue == null && typeof rawPackage.value === 'string') {
    const fromCombined = parsePackageSizeFromRawText(rawPackage.value)
    packageSizeValue = fromCombined.value
    packageSizeUnit = packageSizeUnit ?? fromCombined.unit
  }

  const textFragments = Array.isArray(record.textFragments)
    ? record.textFragments.filter((item): item is string => typeof item === 'string')
    : []

  if (packageSizeValue == null && textFragments.length > 0) {
    const fromFragments = extractPackageSizeFromTextFragments(textFragments)
    packageSizeValue = fromFragments.value
    packageSizeUnit = packageSizeUnit ?? fromFragments.unit
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
    packageSizeValue,
    packageSizeUnit,
    ...parseFormField(record.form),
    gtin: typeof record.gtin === 'string' ? record.gtin.replace(/\D/g, '') || null : null,
    textFragments,
    fieldConfidence,
  }
}
