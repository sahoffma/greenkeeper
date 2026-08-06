import type {
  ProductRecognizeEvidenceField,
  ProductRecognizeFieldSource,
  ProductRecognizeImageAnalysis,
  ProductRecognizeRecognition,
} from '../types/productRecognize'

export const IDENTITY_CONFIDENCE_THRESHOLD = 0.72

const PRODUCT_LINE_MARKERS = new Set([
  'professional',
  'premium',
  'classic',
  'plus',
  'max',
  'eco',
])

const MANUFACTURER_FALSE_POSITIVES = new Set(['professional', 'premium', 'classic', 'plus'])

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function titleCaseSegment(segment: string): string {
  if (!segment) {
    return segment
  }

  return segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase()
}

function titleCaseWords(value: string): string {
  return collapseWhitespace(value)
    .split(' ')
    .map((word) => {
      if (!word) return word
      if (word === '&') return word
      return word.split('-').map(titleCaseSegment).join('-')
    })
    .join(' ')
}

export function normalizeBrand(raw: string | null): string | null {
  if (!raw) return null
  const collapsed = collapseWhitespace(raw.replace(/rasen\s*doktor/gi, 'Rasendoktor'))
  return titleCaseWords(collapsed.replace(/professional/gi, '').trim()) || null
}

export function normalizeProductLine(raw: string | null): string | null {
  if (!raw) return null
  const value = titleCaseWords(raw)
  return PRODUCT_LINE_MARKERS.has(value.toLowerCase()) ? value : value
}

export function normalizeVariant(raw: string | null): string | null {
  if (!raw) return null
  let value = collapseWhitespace(raw)
  if (/neuasaat/i.test(value) && !/neuansaat/i.test(value)) {
    value = value.replace(/neuasaat/gi, 'Neuansaat')
  }
  return titleCaseWords(value)
}

export function normalizeDescriptor(raw: string | null): string | null {
  if (!raw) return null
  return collapseWhitespace(raw)
}

export function sanitizeManufacturer(
  manufacturer: string | null,
  productLine: string | null,
): string | null {
  if (!manufacturer) return null

  const normalizedManufacturer = collapseWhitespace(manufacturer)
  const lower = normalizedManufacturer.toLowerCase()

  if (MANUFACTURER_FALSE_POSITIVES.has(lower)) {
    return null
  }

  if (productLine && lower === productLine.toLowerCase()) {
    return null
  }

  return normalizedManufacturer
}

export function sanitizeImageAnalysis(
  analysis: ProductRecognizeImageAnalysis,
): ProductRecognizeImageAnalysis {
  let brand = analysis.brand
  let productLine = analysis.productLine
  let manufacturer = analysis.manufacturer
  let productName = analysis.productName
  let variant = analysis.variant
  let productDescriptor = analysis.productDescriptor
  const fieldConfidence = { ...analysis.fieldConfidence }

  if (manufacturer?.toLowerCase() === 'professional' && !productLine) {
    productLine = 'Professional'
    manufacturer = null
    fieldConfidence.productLine = fieldConfidence.manufacturer ?? 0.85
  }

  if (brand && /rasen\s*doktor/i.test(brand)) {
    if (/professional/i.test(brand) && !productLine) {
      productLine = 'Professional'
    }
    brand = brand.replace(/professional/gi, '').trim()
  }

  if (
    productName &&
    /rasendünger/i.test(productName) &&
    variant &&
    !productDescriptor
  ) {
    productDescriptor = productName
    productName = null
  }

  manufacturer = sanitizeManufacturer(manufacturer, productLine)

  return {
    ...analysis,
    brand,
    productLine,
    manufacturer,
    productName,
    variant,
    productDescriptor,
    fieldConfidence,
  }
}

function evidenceField(
  rawValue: string | null,
  normalizedValue: string | null,
  confidence: number,
  source: ProductRecognizeFieldSource,
  evidence: string | null = rawValue,
): ProductRecognizeEvidenceField {
  return {
    rawValue,
    normalizedValue,
    confidence,
    source,
    evidence,
  }
}

function emptyRecognition(): ProductRecognizeRecognition {
  const emptyEvidence = evidenceField(null, null, 0, null, null)

  return {
    brand: emptyEvidence,
    productLine: emptyEvidence,
    productName: emptyEvidence,
    variant: emptyEvidence,
    manufacturer: emptyEvidence,
    productDescriptor: emptyEvidence,
    form: {
      rawValue: null,
      normalizedValue: 'unknown',
      confidence: 0,
      source: null,
      evidence: null,
    },
    packageSize: {
      rawValue: null,
      normalizedValue: null,
      unit: null,
      confidence: 0,
      source: null,
      evidence: null,
    },
    npk: {
      rawLabel: null,
      nitrogen: null,
      phosphate: null,
      potash: null,
      confidence: 0,
      source: null,
      evidence: null,
    },
    nutrients: [],
    application: {
      rate: { value: null, unit: null, source: null, evidence: null },
      coverage: { value: null, unit: null, source: null, evidence: null },
      applicationPeriod: [],
      duration: { value: null, unit: null, source: null, evidence: null },
    },
  }
}

export function recognitionFromImageAnalysis(
  analysis: ProductRecognizeImageAnalysis,
): ProductRecognizeRecognition {
  const sanitized = sanitizeImageAnalysis(analysis)
  const recognition = emptyRecognition()

  if (sanitized.brand) {
    const normalized = normalizeBrand(sanitized.brand)
    recognition.brand = evidenceField(
      sanitized.brand,
      normalized,
      sanitized.fieldConfidence.brand ?? 0,
      'image',
      sanitized.brand,
    )
  }

  if (sanitized.productLine) {
    const normalized = normalizeProductLine(sanitized.productLine)
    recognition.productLine = evidenceField(
      sanitized.productLine,
      normalized,
      sanitized.fieldConfidence.productLine ?? 0,
      'image',
      sanitized.productLine,
    )
  }

  const primaryName = sanitized.productName ?? sanitized.variant
  if (primaryName) {
    const normalized = normalizeVariant(primaryName)
    recognition.productName = evidenceField(
      primaryName,
      normalized,
      sanitized.fieldConfidence.productName ?? sanitized.fieldConfidence.variant ?? 0,
      'image',
      primaryName,
    )
  }

  if (sanitized.variant) {
    const normalized = normalizeVariant(sanitized.variant)
    recognition.variant = evidenceField(
      sanitized.variant,
      normalized,
      sanitized.fieldConfidence.variant ?? 0,
      'image',
      sanitized.variant,
    )
  }

  if (sanitized.productDescriptor) {
    recognition.productDescriptor = evidenceField(
      sanitized.productDescriptor,
      normalizeDescriptor(sanitized.productDescriptor),
      sanitized.fieldConfidence.productDescriptor ?? 0.7,
      'image',
      sanitized.productDescriptor,
    )
  }

  if (sanitized.manufacturer) {
    const normalized = sanitizeManufacturer(sanitized.manufacturer, sanitized.productLine)
    if (normalized) {
      recognition.manufacturer = evidenceField(
        sanitized.manufacturer,
        normalized,
        sanitized.fieldConfidence.manufacturer ?? 0,
        'image',
        sanitized.manufacturer,
      )
    }
  }

  if (sanitized.form) {
    recognition.form = {
      rawValue: sanitized.form,
      normalizedValue: sanitized.form,
      confidence: sanitized.fieldConfidence.form ?? 0,
      source: 'image',
      evidence: sanitized.form,
    }
  } else if (sanitized.formLabel) {
    recognition.form = {
      rawValue: sanitized.formLabel,
      normalizedValue: 'unknown',
      confidence: sanitized.fieldConfidence.form ?? 0,
      source: 'image',
      evidence: sanitized.formLabel,
    }
  }

  if (sanitized.packageSizeValue != null) {
    const raw = `${sanitized.packageSizeValue} ${sanitized.packageSizeUnit ?? 'kg'}`.trim()
    recognition.packageSize = {
      rawValue: raw,
      normalizedValue: sanitized.packageSizeValue,
      unit: (sanitized.packageSizeUnit ?? 'kg').toLowerCase(),
      confidence: sanitized.fieldConfidence.packageSize ?? 0,
      source: 'image',
      evidence: raw,
    }
  }

  if (
    sanitized.nitrogen != null ||
    sanitized.phosphate != null ||
    sanitized.potash != null
  ) {
    recognition.npk = {
      rawLabel: sanitized.npkLabel,
      nitrogen: sanitized.nitrogen,
      phosphate: sanitized.phosphate,
      potash: sanitized.potash,
      confidence: sanitized.fieldConfidence.npk ?? 0,
      source: 'image',
      evidence: sanitized.npkLabel,
    }
  }

  return recognition
}

export function computeIdentityConfidence(recognition: ProductRecognizeRecognition): number {
  const brand = recognition.brand.confidence * (recognition.brand.normalizedValue ? 1 : 0)
  const line =
    recognition.productLine.confidence * (recognition.productLine.normalizedValue ? 1 : 0)
  const name =
    Math.max(recognition.productName.confidence, recognition.variant.confidence) *
    (recognition.productName.normalizedValue || recognition.variant.normalizedValue ? 1 : 0)
  const npk =
    recognition.npk.confidence *
    (recognition.npk.nitrogen != null &&
    recognition.npk.phosphate != null &&
    recognition.npk.potash != null
      ? 1
      : 0)
  const size =
    recognition.packageSize.confidence * (recognition.packageSize.normalizedValue != null ? 1 : 0)

  return Math.min(
    1,
    brand * 0.2 + line * 0.15 + name * 0.25 + npk * 0.25 + size * 0.15,
  )
}

export function computeDataCompleteness(recognition: ProductRecognizeRecognition): number {
  const checks = [
    Boolean(recognition.manufacturer.normalizedValue),
    recognition.form.normalizedValue !== 'unknown',
    recognition.nutrients.length > 0,
    recognition.application.rate.value != null,
    recognition.application.coverage.value != null,
    recognition.application.duration.value != null,
    Boolean(recognition.productDescriptor.normalizedValue),
  ]

  const present = checks.filter(Boolean).length
  return Math.round((present / checks.length) * 100) / 100
}

export function hasStrongProductIdentity(recognition: ProductRecognizeRecognition): boolean {
  return computeIdentityConfidence(recognition) >= IDENTITY_CONFIDENCE_THRESHOLD
}

export function evaluateStockCapture(input: {
  identityConfidence: number
  ambiguousVariant: boolean
}): {
  allowed: boolean
  recognitionCandidate: true
  persistToCatalog: false
  message: string | null
} {
  const allowed =
    input.identityConfidence >= IDENTITY_CONFIDENCE_THRESHOLD && !input.ambiguousVariant

  return {
    allowed,
    recognitionCandidate: true,
    persistToCatalog: false,
    message: allowed
      ? 'Bestandserfassung möglich — persönlicher Recognition Candidate, kein Katalog-Eintrag.'
      : 'Bestandserfassung erst nach eindeutiger Produktidentität.',
  }
}

export function summarizeIdentity(recognition: ProductRecognizeRecognition): string {
  const parts = [
    recognition.brand.normalizedValue,
    recognition.productLine.normalizedValue,
    recognition.variant.normalizedValue ?? recognition.productName.normalizedValue,
    recognition.npk.rawLabel,
    recognition.packageSize.rawValue,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' · ') : 'Keine eindeutigen Merkmale erkannt'
}
