import { describe, expect, it } from 'vitest'
import type { Product } from '../types/product'
import {
  LiquidFertilizerCalculationError,
  calculateLiquidNutrientPerSqm,
  convertLiquidVolumeToMassGrams,
  convertLiquidVolumeToMassKg,
} from './liquidFertilizerCalculations'

function makeLiquidProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'test-id',
    manufacturer: 'Test',
    officialName: 'Test Liquid',
    aliases: [],
    category: null,
    npk: '8-2-6',
    defaultUnit: null,
    productForm: 'liquid',
    productType: 'general',
    nPercent: 8,
    p2o5Percent: null,
    k2oPercent: null,
    mgoPercent: null,
    so3Percent: null,
    fePercent: null,
    mnPercent: null,
    recommendedRateMin: null,
    recommendedRateMax: null,
    recommendedRateUnit: null,
    densityKgPerL: 1.18,
    nutrientBasis: 'mass_mass',
    liquidRateMin: null,
    liquidRateMax: null,
    dilutionMin: null,
    dilutionMax: null,
    waterRateMin: null,
    waterRateMax: null,
    applicationMethod: null,
    longevityWeeksMin: null,
    longevityWeeksMax: null,
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

describe('convertLiquidVolumeToMassKg', () => {
  it('rechnet ml × kg/L in kg Produktmasse um', () => {
    expect(convertLiquidVolumeToMassKg(30, 1.18)).toBeCloseTo(0.0354, 6)
  })
})

describe('convertLiquidVolumeToMassGrams', () => {
  it('rechnet ml × kg/L in g Produktmasse um', () => {
    expect(convertLiquidVolumeToMassGrams(30, 1.18)).toBeCloseTo(35.4, 6)
  })
})

describe('calculateLiquidNutrientPerSqm', () => {
  it('berechnet mass_mass korrekt (30 ml/m², 1,18 kg/L, 8 % N → 2,832 g N/m²)', () => {
    const result = calculateLiquidNutrientPerSqm(makeLiquidProduct(), 30, 'N')

    expect(result.productMassKgPerSqm).toBeCloseTo(0.0354, 6)
    expect(result.gramsPerSqm).toBeCloseTo(2.832, 6)
  })

  it('berechnet mass_volume als Gramm Nährstoff pro 100 ml Produkt', () => {
    const result = calculateLiquidNutrientPerSqm(
      makeLiquidProduct({ nutrientBasis: 'mass_volume', nPercent: 8 }),
      30,
      'N',
    )

    // (30 ml / 100) × 8 g/100ml = 2,4 g N/m²
    expect(result.gramsPerSqm).toBeCloseTo(2.4, 6)
  })

  it('berechnet grams_per_liter als direkte g/L-Angabe im Label-Feld', () => {
    const result = calculateLiquidNutrientPerSqm(
      makeLiquidProduct({ nutrientBasis: 'grams_per_liter', nPercent: 80 }),
      30,
      'N',
    )

    // (30 ml / 1000 L) × 80 g/L = 2,4 g N/m²
    expect(result.gramsPerSqm).toBeCloseTo(2.4, 6)
  })

  it('wirft einen Fehler, wenn die Dichte fehlt', () => {
    expect(() =>
      calculateLiquidNutrientPerSqm(makeLiquidProduct({ densityKgPerL: null }), 30, 'N'),
    ).toThrow(LiquidFertilizerCalculationError)

    expect(() =>
      calculateLiquidNutrientPerSqm(makeLiquidProduct({ densityKgPerL: null }), 30, 'N'),
    ).toThrow('Für eine sichere Berechnung ist die Dichte (kg/L) erforderlich.')
  })

  it('wirft einen Fehler bei unbekannter Nährstoffbasis', () => {
    expect(() =>
      calculateLiquidNutrientPerSqm(makeLiquidProduct({ nutrientBasis: 'unknown' }), 30, 'N'),
    ).toThrow(LiquidFertilizerCalculationError)

    expect(() =>
      calculateLiquidNutrientPerSqm(makeLiquidProduct({ nutrientBasis: null }), 30, 'N'),
    ).toThrow('Für eine sichere Berechnung ist die Nährstoffbasis (nutrientBasis) erforderlich.')
  })
})
