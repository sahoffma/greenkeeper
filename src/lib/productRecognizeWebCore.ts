import type {
  ProductRecognizeFieldSource,
  ProductRecognizeRecognition,
  ProductRecognizeWebExtraction,
  ProductRecognizeWebFieldExtraction,
  ProductRecognizeWebSourceCategory,
} from '../types/productRecognize'
import { sourceCategoryPriority } from './productRecognizeSearchCore'

function shouldApplyWebField(
  existingSource: ProductRecognizeFieldSource,
  incomingCategory: ProductRecognizeWebSourceCategory,
): boolean {
  if (!existingSource || existingSource === 'image') {
    return sourceCategoryPriority(incomingCategory) >= 2
  }

  const existingCategory =
    existingSource === 'catalog'
      ? 'verified_catalog'
      : (existingSource as ProductRecognizeWebSourceCategory)

  return sourceCategoryPriority(incomingCategory) > sourceCategoryPriority(existingCategory)
}

export function mergeWebExtractionIntoRecognition(
  recognition: ProductRecognizeRecognition,
  extraction: ProductRecognizeWebExtraction,
): ProductRecognizeRecognition {
  const next = structuredClone(recognition)

  for (const field of extraction.fields) {
    applyWebField(next, field)
  }

  return next
}

function mapWebSource(category: ProductRecognizeWebSourceCategory): ProductRecognizeFieldSource {
  return category
}

function applyWebField(
  recognition: ProductRecognizeRecognition,
  field: ProductRecognizeWebFieldExtraction,
): void {
  const source = mapWebSource(field.sourceCategory)

  switch (field.field) {
    case 'brand':
      if (
        typeof field.value === 'string' &&
        shouldApplyWebField(recognition.brand.source, field.sourceCategory)
      ) {
        recognition.brand = {
          rawValue: field.value,
          normalizedValue: field.value,
          confidence: field.confidence,
          source,
          evidence: field.evidence,
          sourceUrl: field.sourceUrl,
          sourceTitle: field.sourceTitle,
          sourceCategory: field.sourceCategory,
          retrievedAt: field.retrievedAt,
        }
      }
      break
    case 'productLine':
      if (
        typeof field.value === 'string' &&
        shouldApplyWebField(recognition.productLine.source, field.sourceCategory)
      ) {
        recognition.productLine = {
          rawValue: field.value,
          normalizedValue: field.value,
          confidence: field.confidence,
          source,
          evidence: field.evidence,
          sourceUrl: field.sourceUrl,
          sourceTitle: field.sourceTitle,
          sourceCategory: field.sourceCategory,
          retrievedAt: field.retrievedAt,
        }
      }
      break
    case 'manufacturer':
      if (
        typeof field.value === 'string' &&
        shouldApplyWebField(recognition.manufacturer.source, field.sourceCategory)
      ) {
        recognition.manufacturer = {
          rawValue: field.value,
          normalizedValue: field.value,
          confidence: field.confidence,
          source,
          evidence: field.evidence,
          sourceUrl: field.sourceUrl,
          sourceTitle: field.sourceTitle,
          sourceCategory: field.sourceCategory,
          retrievedAt: field.retrievedAt,
        }
      }
      break
    case 'productName':
      if (
        typeof field.value === 'string' &&
        shouldApplyWebField(recognition.productName.source, field.sourceCategory)
      ) {
        recognition.productName = {
          rawValue: field.value,
          normalizedValue: field.value,
          confidence: field.confidence,
          source,
          evidence: field.evidence,
          sourceUrl: field.sourceUrl,
          sourceTitle: field.sourceTitle,
          sourceCategory: field.sourceCategory,
          retrievedAt: field.retrievedAt,
        }
      }
      break
    case 'variant':
      if (
        typeof field.value === 'string' &&
        shouldApplyWebField(recognition.variant.source, field.sourceCategory)
      ) {
        recognition.variant = {
          rawValue: field.value,
          normalizedValue: field.value,
          confidence: field.confidence,
          source,
          evidence: field.evidence,
          sourceUrl: field.sourceUrl,
          sourceTitle: field.sourceTitle,
          sourceCategory: field.sourceCategory,
          retrievedAt: field.retrievedAt,
        }
      }
      break
    case 'productDescriptor':
      if (
        typeof field.value === 'string' &&
        shouldApplyWebField(recognition.productDescriptor.source, field.sourceCategory)
      ) {
        recognition.productDescriptor = {
          rawValue: field.value,
          normalizedValue: field.value,
          confidence: field.confidence,
          source,
          evidence: field.evidence,
          sourceUrl: field.sourceUrl,
          sourceTitle: field.sourceTitle,
          sourceCategory: field.sourceCategory,
          retrievedAt: field.retrievedAt,
        }
      }
      break
    case 'form':
      if (
        (field.value === 'granular' || field.value === 'liquid') &&
        shouldApplyWebField(recognition.form.source, field.sourceCategory)
      ) {
        recognition.form = {
          rawValue: String(field.value),
          normalizedValue: field.value,
          confidence: field.confidence,
          source,
          evidence: field.evidence,
        }
      }
      break
    case 'packageSize':
      if (
        typeof field.value === 'number' &&
        shouldApplyWebField(recognition.packageSize.source, field.sourceCategory)
      ) {
        recognition.packageSize = {
          rawValue: `${field.value} ${field.unit ?? 'kg'}`,
          normalizedValue: field.value,
          unit: field.unit ?? 'kg',
          confidence: field.confidence,
          source,
          evidence: field.evidence,
          sourceUrl: field.sourceUrl,
          sourceTitle: field.sourceTitle,
          sourceCategory: field.sourceCategory,
          retrievedAt: field.retrievedAt,
        }
      }
      break
    case 'npk':
      if (
        typeof field.value === 'object' &&
        field.value != null &&
        shouldApplyWebField(recognition.npk.source, field.sourceCategory)
      ) {
        const npk = field.value as Record<string, number>
        recognition.npk = {
          rawLabel: recognition.npk.rawLabel,
          nitrogen: npk.nitrogen ?? recognition.npk.nitrogen,
          phosphate: npk.phosphate ?? recognition.npk.phosphate,
          potash: npk.potash ?? recognition.npk.potash,
          confidence: field.confidence,
          source,
          evidence: field.evidence,
          sourceUrl: field.sourceUrl,
          sourceTitle: field.sourceTitle,
          sourceCategory: field.sourceCategory,
          retrievedAt: field.retrievedAt,
        }
      }
      break
    case 'applicationRate':
      if (typeof field.value === 'number') {
        recognition.application.rate = {
          value: field.value,
          unit: field.unit ?? 'g/m²',
          source,
          evidence: field.evidence,
          sourceUrl: field.sourceUrl,
          sourceTitle: field.sourceTitle,
          sourceCategory: field.sourceCategory,
          retrievedAt: field.retrievedAt,
        }
      }
      break
    case 'coverage':
      if (typeof field.value === 'number') {
        recognition.application.coverage = {
          value: field.value,
          unit: field.unit ?? 'm²',
          source,
          evidence: field.evidence,
          sourceUrl: field.sourceUrl,
          sourceTitle: field.sourceTitle,
          sourceCategory: field.sourceCategory,
          retrievedAt: field.retrievedAt,
        }
      }
      break
    case 'durationMonths':
      if (typeof field.value === 'number') {
        recognition.application.duration = {
          value: field.value,
          unit: 'months',
          source,
          evidence: field.evidence,
          sourceUrl: field.sourceUrl,
          sourceTitle: field.sourceTitle,
          sourceCategory: field.sourceCategory,
          retrievedAt: field.retrievedAt,
        }
      }
      break
    case 'nutrients':
      if (
        typeof field.value === 'object' &&
        field.value != null &&
        !Array.isArray(field.value)
      ) {
        const entries = field.value as Record<string, number>
        for (const [name, value] of Object.entries(entries)) {
          if (typeof value !== 'number' || Number.isNaN(value)) {
            continue
          }

          const existing = recognition.nutrients.find(
            (nutrient) => nutrient.name.toLowerCase() === name.toLowerCase(),
          )

          if (!existing) {
            recognition.nutrients.push({
              name,
              value,
              unit: '%',
              confidence: field.confidence,
              source: source as Exclude<typeof source, 'image' | null>,
              evidence: field.evidence,
              sourceUrl: field.sourceUrl,
              sourceTitle: field.sourceTitle,
              sourceCategory: field.sourceCategory,
              retrievedAt: field.retrievedAt,
            })
          }
        }
      }
      break
    case 'applicationPeriod':
      if (
        typeof field.value === 'object' &&
        field.value != null &&
        !Array.isArray(field.value)
      ) {
        const period = field.value as { label?: string; fromMonth?: number; toMonth?: number }
        if (period.fromMonth != null && period.toMonth != null) {
          recognition.application.applicationPeriod.push({
            label: period.label ?? `${period.fromMonth}–${period.toMonth}`,
            fromMonth: period.fromMonth,
            toMonth: period.toMonth,
            source,
            evidence: field.evidence,
            sourceUrl: field.sourceUrl,
          })
        }
      }
      break
    default:
      break
  }
}
