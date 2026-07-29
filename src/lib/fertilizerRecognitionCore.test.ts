import { describe, expect, it } from 'vitest'
import {
  acceptRecognitionResult,
  applyStockRemainderAmount,
  applyStockRemainderAnswer,
  createInitialCaptureDraft,
  prototypeActionNotice,
} from './fertilizerCaptureCore'
import {
  assertNoCatalogPersist,
  buildRecognitionCandidateFromResult,
  catalogProductIdFromResult,
  formatRecognizedProductDisplay,
  planRecognitionStockTransition,
  recognitionAllowsAcceptance,
  recognitionNeedsClarification,
  RECOGNITION_ERROR_FALLBACK_MESSAGE,
} from './fertilizerRecognitionCore'
import {
  clearFertilizerRecognitionTelemetryLog,
  getFertilizerRecognitionTelemetryLog,
  setFertilizerRecognitionTelemetryEnabled,
  telemetryPayloadIsSafe,
  trackFertilizerRecognition,
} from './fertilizerRecognitionTelemetry'
import { runProductRecognition, type ProductRecognizeDeps } from './productRecognizeCore'
import type {
  ProductRecognizeImageAnalysis,
  ProductRecognizeResult,
  ProductRecognizeWebExtraction,
} from '../types/productRecognize'
import type { ProductRecognizeSearchProvider } from './productRecognizeSearchCore'
import { mergeWebExtractionIntoRecognition } from './productRecognizeWebCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'

const rasendoktorImage: ProductRecognizeImageAnalysis = {
  brand: 'Rasendoktor',
  productLine: 'Professional',
  productName: 'Frühjahr & Neuansaat',
  variant: null,
  productDescriptor: 'Rasendünger für Frühjahr und Neuansaat',
  manufacturer: null,
  npkLabel: '14-28-10',
  nitrogen: 14,
  phosphate: 28,
  potash: 10,
  packageSizeValue: 5,
  packageSizeUnit: 'kg',
  form: 'granular',
  gtin: null,
  textFragments: [],
  fieldConfidence: { brand: 0.95, productLine: 0.9, productName: 0.92, npk: 0.93, packageSize: 0.9 },
}

function mockSearch(extraction: ProductRecognizeWebExtraction | 'throw'): ProductRecognizeSearchProvider {
  return {
    name: 'mock',
    searchAndExtract: async () => {
      if (extraction === 'throw') throw new Error('web down')
      return extraction
    },
  }
}

function prepMock(mimeType: string, converted = false) {
  return async ({ base64, mimeType: mt }: { base64: string; mimeType: string }) => ({
    base64,
    mimeType: converted ? 'image/jpeg' : mt,
    prep: {
      originalFormat: mimeType,
      processedFormat: converted ? 'image/jpeg' : mimeType,
      originalBytes: 1_770_000,
      processedBytes: converted ? 900_000 : 512_000,
      originalWidth: 4032,
      originalHeight: 3024,
      processedWidth: 1600,
      processedHeight: 1200,
      conversionMs: converted ? 980 : 0,
      compressionMs: 120,
      converted,
    },
  })
}

function createDeps(overrides: Partial<ProductRecognizeDeps> = {}): ProductRecognizeDeps {
  return {
    analyzeImage: async () => rasendoktorImage,
    loadCatalog: async () => [],
    searchProvider: mockSearch({ fields: [], sources: [], conflicts: [], provider: 'mock' }),
    prepareImage: prepMock('image/jpeg'),
    ...overrides,
  }
}

async function runRasendoktor(overrides: Partial<ProductRecognizeDeps> = {}): Promise<ProductRecognizeResult> {
  return runProductRecognition(
    { imageBase64: 'abc', mimeType: 'image/jpeg' },
    createDeps(overrides),
  )
}

describe('fertilizerRecognitionCore integration', () => {
  it('5 — eindeutiger Katalogtreffer ohne parallelen Candidate', async () => {
    const result = await runRasendoktor({
      loadCatalog: async () => [
        {
          id: 'cat-rasendoktor',
          manufacturer: 'Rasendoktor',
          officialName: 'Frühjahr & Neuansaat',
          aliases: ['Professional Frühjahr & Neuansaat'],
          npk: '14-28-10',
          productForm: 'granular',
        },
      ],
    })

    expect(result.catalogMatch.matched).toBe(true)
    expect(buildRecognitionCandidateFromResult(result)).toBeNull()
    expect(catalogProductIdFromResult(result)).toBe('cat-rasendoktor')
  })

  it('6 — eindeutige Identität ohne Katalogtreffer erzeugt Candidate', async () => {
    const result = await runRasendoktor()
    expect(result.status).toBe('identified')
    const candidate = buildRecognitionCandidateFromResult(result)
    expect(candidate).not.toBeNull()
    expect(candidate?.catalogProductId).toBeNull()
    expect(candidate?.brand?.value).toBe('Rasendoktor')
  })

  it('7 — offizielle Webquelle wird gefunden', async () => {
    const result = await runRasendoktor({
      searchProvider: mockSearch({
        fields: [],
        sources: [
          {
            url: 'https://www.rasendoktor.de/duenger/...',
            title: 'Rasendoktor Professional',
            category: 'official_brand',
            retrievedAt: '2026-07-28T12:00:00.000Z',
          },
        ],
        conflicts: [],
        provider: 'mock',
      }),
    })

    expect(result.sources.some((s) => s.type === 'official_brand')).toBe(true)
  })

  it('8 — Webanreicherung liefert zusätzliche Produktdaten', () => {
    let recognition = recognitionFromImageAnalysis(rasendoktorImage)
    const merged = mergeWebExtractionIntoRecognition(recognition, {
      fields: [
        {
          field: 'manufacturer',
          value: 'Rasendoktor GmbH',
          confidence: 0.9,
          sourceUrl: 'https://www.rasendoktor.de/',
          sourceTitle: 'Rasendoktor',
          sourceCategory: 'official_brand',
          evidence: 'Verantwortlich: Rasendoktor GmbH',
          retrievedAt: '2026-07-28T12:00:00.000Z',
        },
        {
          field: 'applicationRate',
          value: 25,
          unit: 'g/m²',
          confidence: 0.88,
          sourceUrl: 'https://www.rasendoktor.de/',
          sourceTitle: 'Rasendoktor',
          sourceCategory: 'official_brand',
          evidence: '25 g/m²',
          retrievedAt: '2026-07-28T12:00:00.000Z',
        },
      ],
      sources: [],
      conflicts: [],
      provider: 'mock',
    })

    expect(merged.manufacturer.normalizedValue).toBe('Rasendoktor GmbH')
    expect(merged.application.rate.value).toBe(25)
  })

  it('9 — Webanreicherung schlägt fehl, Identität bleibt nutzbar', async () => {
    const result = await runRasendoktor({ searchProvider: mockSearch('throw') })
    expect(result.status).toBe('identified')
    expect(recognitionAllowsAcceptance(result)).toBe(true)
    expect(result.diagnostics.warnings.some((w) => w.includes('Web-Anreicherung'))).toBe(true)
  })

  it('10 — fehlende optionale Daten blockieren nicht', async () => {
    const result = await runRasendoktor()
    expect(result.dataCompleteness).toBeLessThan(0.5)
    expect(result.stockCapture.allowed).toBe(true)
    expect(formatRecognizedProductDisplay(result).incompleteOptionalHint).toBeTruthy()
  })

  it('11 — mehrdeutige Identität fordert Rückseitenfoto', async () => {
    const result = await runRasendoktor({
      loadCatalog: async () => [
        {
          id: 'a',
          manufacturer: 'Rasendoktor',
          officialName: 'Frühjahr & Neuansaat',
          aliases: ['5 kg'],
          npk: '14-28-10',
        },
        {
          id: 'b',
          manufacturer: 'Rasendoktor',
          officialName: 'Frühjahr & Neuansaat',
          aliases: ['10 kg'],
          npk: '14-28-10',
        },
      ],
    })

    expect(recognitionNeedsClarification(result)).toBe(true)
    expect(result.nextAction.type).toBe('request_back_photo')
  })

  it('12 — sichere Identität fordert kein Rückseitenfoto', async () => {
    const result = await runRasendoktor()
    expect(result.nextAction.type).toBe('none')
    expect(result.nextAction.type).not.toBe('request_back_photo')
  })

  it('15 — kein Katalog-Write', async () => {
    const result = await runRasendoktor()
    expect(assertNoCatalogPersist(result)).toBe(true)
    expect(result.stockCapture.persistToCatalog).toBe(false)
  })

  it('16 — bestehendes Produkt im Bestand: keine Restbestandsfrage', () => {
    const plan = planRecognitionStockTransition({
      result: {
        recognition: recognitionFromImageAnalysis(rasendoktorImage),
      } as ProductRecognizeResult,
      stockStatus: { status: 'has_stock', currentBalance: 2, unit: 'kg' },
      purchaseAmount: 5,
    })

    expect(plan.kind).toBe('add_to_existing')
    expect(plan.totalStock).toBe(7)
  })

  it('17 — erstmaliges Produkt ohne früheren Restbestand', () => {
    let draft = createInitialCaptureDraft()
    const result = {
      status: 'identified',
      identityConfidence: 1,
      dataCompleteness: 0.2,
      recognition: recognitionFromImageAnalysis(rasendoktorImage),
      catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
      sources: [],
      missingRequiredFields: [],
      nextAction: { type: 'none', message: null },
      stockCapture: {
        allowed: true,
        recognitionCandidate: true,
        persistToCatalog: false,
        message: null,
      },
      diagnostics: { model: 'test', latencyMs: 1, estimatedCost: null, warnings: [] },
      steps: [],
      spike: true,
    } as ProductRecognizeResult

    draft = acceptRecognitionResult(draft, result, {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })
    expect(draft.step).toBe('stock-remainder')
    draft = applyStockRemainderAnswer(draft, false)
    expect(draft.step).toBe('confirm')
    expect(draft.quantity).toBe(5)
    expect(draft.purchaseQuantity).toBe(5)
  })

  it('18/19 — Restbestand + Kaufmenge wird von Greenkeeper addiert', () => {
    let draft = createInitialCaptureDraft()
    const result = {
      status: 'identified',
      identityConfidence: 1,
      dataCompleteness: 0.2,
      recognition: recognitionFromImageAnalysis(rasendoktorImage),
      catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
      sources: [],
      missingRequiredFields: [],
      nextAction: { type: 'none', message: null },
      stockCapture: {
        allowed: true,
        recognitionCandidate: true,
        persistToCatalog: false,
        message: null,
      },
      diagnostics: { model: 'test', latencyMs: 1, estimatedCost: null, warnings: [] },
      steps: [],
      spike: true,
    } as ProductRecognizeResult

    draft = acceptRecognitionResult(draft, result, {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })
    draft = applyStockRemainderAnswer(draft, true)
    expect(draft.step).toBe('stock-remainder-amount')
    draft = applyStockRemainderAmount(draft, 1.5)
    expect(draft.quantity).toBe(6.5)
    expect(draft.purchaseQuantity).toBe(5)
    expect(draft.previousRemainder).toBe(1.5)
  })

  it('13 — Timeout-Fallback-Text ist verständlich', () => {
    expect(RECOGNITION_ERROR_FALLBACK_MESSAGE).toMatch(/Produkt suchen/)
  })

  it('1 — deaktiviertes Flag: Prototyp-Hinweis unverändert', () => {
    expect(prototypeActionNotice('photo')).toMatch(/noch nicht angebunden/)
  })

  it('22 — Telemetrie enthält keine Bild- oder OCR-Inhalte', () => {
    clearFertilizerRecognitionTelemetryLog()
    setFertilizerRecognitionTelemetryEnabled(true)
    trackFertilizerRecognition({
      outcome: 'success',
      catalogHit: false,
      webSourceFound: true,
      backPhotoRequested: false,
      totalLatencyMs: 1000,
      fileFormat: 'image/heic',
      identityConfidence: 1,
      dataCompleteness: 0.2,
      userAccepted: true,
      userDiscarded: false,
    })

    const [event] = getFertilizerRecognitionTelemetryLog()
    expect(telemetryPayloadIsSafe(event)).toBe(true)
    expect(JSON.stringify(event)).not.toMatch(/base64|ocr|textFragments/i)
  })
})
