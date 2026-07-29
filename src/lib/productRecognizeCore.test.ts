import { describe, expect, it } from 'vitest'
import {
  runProductRecognition,
  validateProductRecognizeInput,
  type ProductRecognizeDeps,
} from './productRecognizeCore'
import type {
  ProductRecognizeCatalogItem,
  ProductRecognizeImageAnalysis,
  ProductRecognizeWebExtraction,
} from '../types/productRecognize'
import type { ProductRecognizeSearchProvider } from './productRecognizeSearchCore'

const rasendoktorImage: ProductRecognizeImageAnalysis = {
  brand: 'RASEN DOKTOR',
  productLine: null,
  productName: 'Rasendünger',
  variant: 'Frühjahr & Neuansaat',
  productDescriptor: null,
  manufacturer: 'PROFESSIONAL',
  npkLabel: '14-28-10',
  nitrogen: 14,
  phosphate: 28,
  potash: 10,
  packageSizeValue: 5,
  packageSizeUnit: 'kg',
  form: 'granular',
  gtin: null,
  textFragments: ['Rasendoktor Professional', 'Frühjahr & Neuansaat', 'NPK 14-28-10', '5 kg'],
  fieldConfidence: {
    brand: 0.95,
    productLine: 0,
    productName: 0.9,
    variant: 0.92,
    productDescriptor: 0,
    manufacturer: 0.8,
    npk: 0.93,
    packageSize: 0.9,
    form: 0.85,
    gtin: 0,
  },
}

const catalogExact: ProductRecognizeCatalogItem[] = [
  {
    id: 'prod-rasendoktor',
    manufacturer: 'Rasendoktor',
    officialName: 'Frühjahr & Neuansaat',
    aliases: ['Rasendoktor Professional Frühjahr & Neuansaat'],
    npk: '14-28-10',
    productForm: 'granular',
    nPercent: 14,
    p2o5Percent: 28,
    k2oPercent: 10,
    recommendedRateMin: 20,
    recommendedRateMax: 25,
    recommendedRateUnit: 'g/m²',
    defaultUnit: 'kg',
  },
]

const catalogAmbiguous: ProductRecognizeCatalogItem[] = [
  {
    id: 'prod-a',
    manufacturer: 'Rasendoktor',
    officialName: 'Frühjahr & Neuansaat',
    aliases: ['5 kg Gebinde'],
    npk: '14-28-10',
    productForm: 'granular',
  },
  {
    id: 'prod-b',
    manufacturer: 'Rasendoktor',
    officialName: 'Frühjahr & Neuansaat',
    aliases: ['10 kg Gebinde'],
    npk: '14-28-10',
    productForm: 'granular',
  },
]

function mockSearchProvider(
  extraction: ProductRecognizeWebExtraction | 'throw' = {
    fields: [],
    sources: [],
    conflicts: [],
    provider: 'mock',
  },
): ProductRecognizeSearchProvider {
  return {
    name: 'mock_search',
    searchAndExtract: async () => {
      if (extraction === 'throw') {
        throw new Error('Web-Suche nicht verfügbar')
      }
      return extraction
    },
  }
}

function createDeps(overrides: Partial<ProductRecognizeDeps> = {}): ProductRecognizeDeps {
  return {
    analyzeImage: async () => rasendoktorImage,
    loadCatalog: async () => [],
    searchProvider: mockSearchProvider(),
    prepareImage: async ({ base64, mimeType }) => ({
      base64,
      mimeType,
      prep: {
        originalFormat: mimeType,
        processedFormat: mimeType,
        originalBytes: 1000,
        processedBytes: 1000,
        originalWidth: 1200,
        originalHeight: 900,
        processedWidth: 1200,
        processedHeight: 900,
        conversionMs: 0,
        compressionMs: 0,
        converted: false,
      },
    }),
    now: () => '2026-07-28T12:00:00.000Z',
    ...overrides,
  }
}

describe('validateProductRecognizeInput', () => {
  it('rejects empty image', () => {
    const result = validateProductRecognizeInput({ imageBase64: '', mimeType: 'image/jpeg' })
    expect(result?.error).toMatch(/hoch/)
  })
})

describe('runProductRecognition', () => {
  it('Katalogtreffer mit verified_catalog Quelle', async () => {
    const result = await runProductRecognition(
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      createDeps({ loadCatalog: async () => catalogExact }),
    )

    expect(result.status).toBe('identified')
    expect(result.catalogMatch.matched).toBe(true)
    expect(result.recognition.npk.source).toBe('verified_catalog')
    expect(result.nextAction.type).toBe('none')
  })

  it('9/10 — offizielle Webquelle priorisiert und quellenbezogen', async () => {
    const extraction: ProductRecognizeWebExtraction = {
      provider: 'mock_search',
      conflicts: [],
      sources: [
        {
          url: 'https://www.rasendoktor.de/produkte/fruehjahr-neuansaat',
          title: 'Frühjahr & Neuansaat',
          category: 'official_brand',
          retrievedAt: '2026-07-28T12:00:00.000Z',
        },
      ],
      fields: [
        {
          field: 'applicationRate',
          value: 25,
          unit: 'g/m²',
          confidence: 0.9,
          sourceUrl: 'https://www.rasendoktor.de/produkte/fruehjahr-neuansaat',
          sourceTitle: 'Frühjahr & Neuansaat',
          sourceCategory: 'official_brand',
          evidence: '25 g/m²',
          retrievedAt: '2026-07-28T12:00:00.000Z',
        },
      ],
    }

    const result = await runProductRecognition(
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      createDeps({ searchProvider: mockSearchProvider(extraction) }),
    )

    expect(result.recognition.application.rate.source).toBe('official_brand')
    expect(result.sources.some((source) => source.type === 'official_brand')).toBe(true)
  })

  it('6 — kein Katalog und keine Webquelle ohne Rückseitenfoto', async () => {
    const result = await runProductRecognition(
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      createDeps({ searchProvider: mockSearchProvider() }),
    )

    expect(result.status).toBe('identified')
    expect(result.identityConfidence).toBeGreaterThan(0.72)
    expect(result.nextAction.type).toBe('none')
    expect(result.stockCapture.allowed).toBe(true)
    expect(result.stockCapture.persistToCatalog).toBe(false)
  })

  it('7 — mehrdeutige Variante fordert Rückseitenfoto', async () => {
    const result = await runProductRecognition(
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      createDeps({ loadCatalog: async () => catalogAmbiguous }),
    )

    expect(result.status).toBe('needs_clarification')
    expect(result.nextAction.type).toBe('request_back_photo')
    expect(result.nextAction.message).toMatch(/Variante/)
  })

  it('8 — widersprüchliche Quellen führen zur Klärung', async () => {
    const result = await runProductRecognition(
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      createDeps({
        searchProvider: mockSearchProvider({
          fields: [],
          conflicts: ['npk: 14-28-10 vs 10-10-10'],
          sources: [],
          provider: 'mock_search',
        }),
      }),
    )

    expect(result.status).toBe('needs_clarification')
    expect(result.nextAction.type).toBe('request_back_photo')
  })

  it('11 — fehlgeschlagene Web-Anreicherung blockiert Bestand nicht', async () => {
    const result = await runProductRecognition(
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      createDeps({ searchProvider: mockSearchProvider('throw') }),
    )

    expect(result.stockCapture.allowed).toBe(true)
    expect(result.diagnostics.warnings.some((warning) => warning.includes('Web-Anreicherung'))).toBe(
      true,
    )
  })

  it('12 — keine automatische Katalogpersistenz', async () => {
    const result = await runProductRecognition(
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      createDeps(),
    )

    expect(result.stockCapture.recognitionCandidate).toBe(true)
    expect(result.stockCapture.persistToCatalog).toBe(false)
  })

  it('Produkt nicht identifizierbar', async () => {
    const result = await runProductRecognition(
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      createDeps({
        analyzeImage: async () => ({
          ...rasendoktorImage,
          brand: null,
          productLine: null,
          productName: null,
          variant: null,
          manufacturer: null,
          nitrogen: null,
          phosphate: null,
          potash: null,
          packageSizeValue: null,
          fieldConfidence: {},
        }),
      }),
    )

    expect(result.status).toBe('not_identified')
    expect(result.stockCapture.allowed).toBe(false)
  })

  it('OpenAI-API-Fehler', async () => {
    const result = await runProductRecognition(
      { imageBase64: 'abc', mimeType: 'image/jpeg' },
      createDeps({
        analyzeImage: async () => {
          throw new Error('OpenAI rate limit')
        },
      }),
    )

    expect(result.status).toBe('error')
    expect(result.steps.find((step) => step.id === 'image_analysis')?.status).toBe('failed')
  })
})
