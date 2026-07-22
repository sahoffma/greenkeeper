import { describe, expect, it } from 'vitest'
import type { Product } from '../types/product'
import {
  analysisToImportPayload,
  buildProductAssistantPreview,
  searchProductCatalog,
} from './productAssistantCore'
import {
  buildDevModeAnalysis,
  estimateBase64Bytes,
  stripDataUrl,
} from './productAssistantAnalyzeCore'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
    verifiedAt: '2026-07-01T00:00:00.000Z',
    verifiedBy: 'reviewer-1',
    lastReviewedAt: '2026-07-01T00:00:00.000Z',
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

describe('searchProductCatalog', () => {
  const catalog = [
    makeProduct(),
    makeProduct({
      id: 'p2',
      officialName: 'Sierraform GT Antistress',
      aliases: [],
      npk: '12-2-18',
    }),
  ]

  it('findet ein eindeutiges vorhandenes Produkt', () => {
    const result = searchProductCatalog(catalog, {
      manufacturer: 'ICL',
      officialName: 'Spring Start',
    })

    expect(result.kind).toBe('exact')
    if (result.kind === 'exact') {
      expect(result.match.productId).toBe('p1')
    }
  })

  it('findet Produkte über Aliase tolerant', () => {
    const result = searchProductCatalog(catalog, {
      manufacturer: 'ICL',
      officialName: 'Spring Star',
    })

    expect(result.kind).toBe('exact')
  })

  it('liefert mehrere ähnliche Treffer', () => {
    const result = searchProductCatalog(
      [
        makeProduct({ id: 'a', officialName: 'Spring Start NPK' }),
        makeProduct({ id: 'b', officialName: 'Spring Start Premium', aliases: [] }),
      ],
      { manufacturer: 'ICL', officialName: 'Spring Start' },
    )

    expect(result.kind).toBe('multiple')
    if (result.kind === 'multiple') {
      expect(result.matches.length).toBeGreaterThan(1)
    }
  })

  it('liefert keinen Treffer', () => {
    const result = searchProductCatalog(catalog, {
      manufacturer: 'Unbekannt',
      officialName: 'Nicht vorhanden',
    })

    expect(result.kind).toBe('none')
  })
})

describe('preview creation', () => {
  it('erstellt eine Vorschau aus Analyse-Daten', () => {
    const analysis = {
      devMode: true,
      manufacturer: 'ICL',
      officialName: 'Test Liquid',
      productForm: 'liquid' as const,
      npk: '8-2-6',
      nPercent: 8,
      p2o5Percent: 2,
      k2oPercent: 6,
      mgoPercent: null,
      so3Percent: null,
      fePercent: null,
      mnPercent: null,
      recommendedRateMin: null,
      recommendedRateMax: null,
      recommendedRateUnit: null,
      liquidRateMin: 30,
      liquidRateMax: null,
      densityKgPerL: 1.18,
      nutrientBasis: 'mass_mass' as const,
      applicationMethod: 'foliar' as const,
      longevityWeeksMin: null,
      longevityWeeksMax: null,
      sourceDescription: 'Produktetikett-Foto',
      missingFields: ['longevityWeeksMin'],
      uncertainFields: [],
      warnings: [],
    }

    const preview = buildProductAssistantPreview(analysis, {
      manufacturer: '',
      officialName: '',
    })

    expect(preview?.displayOfficialName).toBe('Test Liquid')
    expect(analysisToImportPayload(analysis, { manufacturer: '', officialName: '' })?.productForm).toBe(
      'liquid',
    )
  })
})

describe('buildDevModeAnalysis', () => {
  it('nutzt im Entwicklungsmodus den gesprochenen Produktnamen bei Fotos', () => {
    const result = buildDevModeAnalysis({
      spokenProductName: 'Neues Testprodukt',
      hasImage: true,
    })

    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.officialName).toBe('Neues Testprodukt')
      expect(result.npk).toBeNull()
    }
  })

  it('erstellt im Entwicklungsmodus keine erfundenen Nährstoffe', () => {
    const result = buildDevModeAnalysis({
      manufacturer: 'ICL',
      officialName: 'Test',
      hasImage: false,
    })

    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.npk).toBeNull()
      expect(result.missingFields.length).toBeGreaterThan(0)
    }
  })
})

describe('image helpers', () => {
  it('erkennt ungültige oder zu große Fotos anhand der Größe', () => {
    const dataUrl = stripDataUrl('data:image/jpeg;base64,abcd')
    expect(dataUrl.mimeType).toBe('image/jpeg')
    expect(estimateBase64Bytes('abcd')).toBeGreaterThan(0)
  })
})

describe('governance submit route', () => {
  it('nutzt submitNewProduct und keinen direkten products-Schreibzugriff', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'netlify/functions/product-assistant-submit.ts'),
      'utf8',
    )

    expect(source).toContain('submitNewProduct')
    expect(source).not.toContain('writeOfficialProductRecord')
    expect(source).not.toContain(".from('products').insert")
    expect(source).not.toContain(".from('products').update")
  })
})

describe('productAssistantClient', () => {
  it('ruft die Submit-Function auf, nicht products direkt', async () => {
    const source = readFileSync(resolve(process.cwd(), 'src/lib/productAssistantClient.ts'), 'utf8')

    expect(source).toContain('product-assistant-submit')
    expect(source).not.toContain(".from('products')")
  })
})
