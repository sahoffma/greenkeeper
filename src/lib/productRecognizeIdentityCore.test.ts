import { describe, expect, it } from 'vitest'
import {
  computeDataCompleteness,
  computeIdentityConfidence,
  recognitionFromImageAnalysis,
  sanitizeImageAnalysis,
  sanitizeManufacturer,
} from './productRecognizeIdentityCore'
import type { ProductRecognizeImageAnalysis } from '../types/productRecognize'

const rasendoktorRawVision: ProductRecognizeImageAnalysis = {
  brand: 'RASEN DOKTOR',
  productLine: null,
  productName: 'Rasendünger',
  variant: 'Frühjahr & Neuasaat',
  productDescriptor: null,
  manufacturer: 'PROFESSIONAL',
  npkLabel: '14-28-10',
  nitrogen: 14,
  phosphate: 28,
  potash: 10,
  packageSizeValue: 5,
  packageSizeUnit: 'KG',
  form: 'granular',
  formLabel: null,
  gtin: null,
  textFragments: [],
  fieldConfidence: {
    brand: 0.9,
    productLine: 0,
    productName: 0.9,
    variant: 0.9,
    productDescriptor: 0,
    manufacturer: 0.8,
    npk: 0.9,
    packageSize: 0.9,
    form: 0.85,
    gtin: 0,
  },
}

describe('productRecognizeIdentityCore', () => {
  it('3 — Professional wird als Produktlinie, nicht als Hersteller erkannt', () => {
    const sanitized = sanitizeImageAnalysis(rasendoktorRawVision)
    expect(sanitized.productLine).toBe('Professional')
    expect(sanitized.manufacturer).toBeNull()
  })

  it('4 — Hersteller bleibt unbekannt ohne belastbare Quelle', () => {
    expect(sanitizeManufacturer('Professional', 'Professional')).toBeNull()
    const recognition = recognitionFromImageAnalysis(rasendoktorRawVision)
    expect(recognition.manufacturer.normalizedValue).toBeNull()
  })

  it('5 — Produktidentität hoch trotz fehlender optionaler Daten', () => {
    const recognition = recognitionFromImageAnalysis(rasendoktorRawVision)
    expect(recognition.brand.normalizedValue).toBe('Rasendoktor')
    expect(recognition.productLine.normalizedValue).toBe('Professional')
    expect(recognition.variant.normalizedValue).toBe('Frühjahr & Neuansaat')
    expect(recognition.productDescriptor.normalizedValue).toBe('Rasendünger')
    expect(computeIdentityConfidence(recognition)).toBeGreaterThan(0.72)
    expect(computeDataCompleteness(recognition)).toBeLessThan(0.6)
  })

  it('normalisiert OCR Neuasaat → Neuansaat', () => {
    const recognition = recognitionFromImageAnalysis(rasendoktorRawVision)
    expect(recognition.variant.normalizedValue).toBe('Frühjahr & Neuansaat')
    expect(recognition.variant.rawValue).toBe('Frühjahr & Neuasaat')
  })

  it('behält Bindestrich-Großschreibung in Produktnamen', () => {
    const recognition = recognitionFromImageAnalysis({
      ...rasendoktorRawVision,
      productName: 'Stress-Manager',
      variant: null,
      productDescriptor: null,
    })

    expect(recognition.productName.normalizedValue).toBe('Stress-Manager')
  })
})
