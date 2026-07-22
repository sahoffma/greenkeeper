import { describe, expect, it } from 'vitest'
import type { Product } from '../types/product'
import {
  formatJournalProductName,
  isProductKnownInCatalog,
  lookupSpokenProductName,
} from './productLookup'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    manufacturer: 'ICL',
    officialName: 'Spring Start',
    aliases: ['Spring Star'],
    category: 'fertilization',
    npk: '16-0-16',
    defaultUnit: 'g/m²',
    productForm: 'granular',
    productType: null,
    nPercent: 16,
    p2o5Percent: 0,
    k2oPercent: 16,
    mgoPercent: null,
    so3Percent: null,
    fePercent: 2,
    mnPercent: null,
    recommendedRateMin: 20,
    recommendedRateMax: 30,
    recommendedRateUnit: 'g/m²',
    densityKgPerL: null,
    nutrientBasis: null,
    liquidRateMin: null,
    liquidRateMax: null,
    dilutionMin: null,
    dilutionMax: null,
    waterRateMin: null,
    waterRateMax: null,
    applicationMethod: 'soil',
    longevityWeeksMin: 8,
    longevityWeeksMax: 10,
    releaseType: null,
    seasonMonths: null,
    description: null,
    manufacturerUrl: null,
    datasheetUrl: null,
    sourceName: null,
    sourceCheckedAt: null,
    verificationStatus: 'verified',
    verifiedAt: null,
    verifiedBy: null,
    lastReviewedAt: null,
    currentVersion: 1,
    confidenceScore: null,
    fieldConfidence: {},
    aiConfidenceScore: null,
    reviewConfidenceScore: null,
    aiFieldConfidence: {},
    reviewFieldConfidence: {},
    sources: [],
    primarySourceType: null,
    primarySourceUrl: null,
    hasOpenChangeRequest: false,
    legacyImportedAt: null,
    legacyImportNote: null,
    ...overrides,
  }
}

describe('productLookup', () => {
  const catalog = [
    makeProduct(),
    makeProduct({
      id: 'p2',
      officialName: 'Sierraform GT Antistress',
      aliases: [],
    }),
  ]

  it('erkennt bekannte Produkte exakt und über Aliase', () => {
    expect(isProductKnownInCatalog('Spring Start', catalog)).toBe(true)
    expect(isProductKnownInCatalog('spring star', catalog)).toBe(true)
    expect(isProductKnownInCatalog('Unbekanntes Produkt', catalog)).toBe(false)
  })

  it('liefert known für exakte Bibliothekstreffer', () => {
    const result = lookupSpokenProductName('Spring Star', catalog)
    expect(result.kind).toBe('known')
    if (result.kind === 'known') {
      expect(result.officialName).toBe('Spring Start')
    }
  })

  it('liefert unknown für unbekannte Produktnamen', () => {
    const result = lookupSpokenProductName('Neues Testprodukt XYZ', catalog)
    expect(result.kind).toBe('unknown')
    if (result.kind === 'unknown') {
      expect(result.spokenName).toBe('Neues Testprodukt XYZ')
    }
  })

  it('formatiert Journal-Produktnamen', () => {
    expect(formatJournalProductName('ICL', 'Spring Start')).toBe('ICL Spring Start')
    expect(formatJournalProductName('', 'Spring Start')).toBe('Spring Start')
  })
})
