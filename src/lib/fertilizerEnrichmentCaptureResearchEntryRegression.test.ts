import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductRecognizeResult } from '../types/productRecognize'
import { acceptRecognitionResult, createInitialCaptureDraft } from './fertilizerCaptureCore'
import { buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft } from './fertilizerCaptureEnrichmentInputCore'
import { createFertilizerEnrichmentOrchestrationDependencies } from './fertilizerEnrichmentAdapterCompositionCore'
import { orchestrateFertilizerEnrichment } from './fertilizerEnrichmentOrchestrationCore'
import { createFertilizerEnrichmentProductionAdapterDependencies } from './fertilizerEnrichmentProductionAdapterCore'
import { isProductIdentityCompleteForResearch } from './fertilizerManufacturerResearchCore'
import { buildStructuredResearchProviderResultFromRecord } from './fertilizerManufacturerStructuredResearchCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'

const FIXED_NOW = '2026-08-15T11:48:55.924Z'
const PROFESSIONAL_URL =
  'https://www.rasendoktor.de/duenger/rasenduenger/kalium-rasenduenger-mit-spurennaehrstoffen/?awc=live'
const PROFESSIONAL_BODY = `<html><body>
  <h1>Rasendoktor Professional Kalium-Spezialdünger + Spurennährstoffe</h1>
  <p>Manufacturer: Rasendoktor</p>
  <p>Product: Stress-Manager</p>
  <p>Form: Granular</p>
  <p>NPK 0-0-30</p>
  <p>Zusammensetzung: 30 % Kaliumoxid (K2O), 10,2 % Schwefel (S), 0,1 % Kupfer (Cu), 3,0 % Eisen (Fe), 0,1 % Mangan (Mn), 0,1 % Zink (Zn)</p>
</body></html>`

function createLiveFetchProvider() {
  return {
    fetchSource: async (url: string) => {
      const normalized = url.split('?')[0] ?? url
      if (normalized.includes('spurennaehrstoffen')) {
        return {
          ok: true as const,
          finalUrl: url,
          text: PROFESSIONAL_BODY,
          contentType: 'text/html',
          retrievedAt: FIXED_NOW,
          statusCode: 200,
        }
      }

      return { ok: false as const, errorCode: 'source_not_found' as const, retryable: false }
    },
  }
}

function createPhaseBStructuredProvider(identity: FertilizerEnrichmentIdentity) {
  return {
    runStructuredWebResearch: async () => {
      const base = buildStructuredResearchProviderResultFromRecord({
        record: {
          manufacturer: 'Rasendoktor GmbH',
          productLine: 'Professional',
          productName: 'Stress-Manager',
          productForm: 'granular',
          npk: { nitrogen: 0, phosphate: 0, potash: 30 },
          nutrientMatrix: {},
          nutrientDeclarationBases: {},
          declarationComplete: false,
          identityMatch: true,
          confidence: 0.95,
          sources: [
            {
              url: PROFESSIONAL_URL,
              title: 'Professional Stress-Manager 0-0-30',
              category: 'official_manufacturer',
              sourceIdentity: {
                manufacturer: 'Rasendoktor GmbH',
                productLine: 'Professional',
                productName: 'Stress-Manager',
                npkLabel: '0-0-30',
              },
            },
          ],
        },
        identity: {
          ...identity,
          identityConfidence: 0.96,
          hasIdentityAmbiguity: false,
        },
        npkLabel: '0-0-30',
        manufacturerDomain: 'rasendoktor.de',
        queries: ['Rasendoktor Professional 0-0-30'],
      })

      const sources = [
        ...Array.from({ length: 10 }, (_entry, index) => ({
          url: `https://www.rasendoktor.de/search/result-${index}`,
          title: `Search result ${index}`,
        })),
        { url: PROFESSIONAL_URL, title: 'Professional Stress-Manager 0-0-30' },
      ]
      const text = sources.map((source) => source.title).join(' ')
      let cursor = 0
      const annotations = sources.map((source) => {
        const excerpt = source.title
        const startIndex = cursor
        const endIndex = startIndex + excerpt.length
        cursor = endIndex + 1
        return {
          type: 'url_citation',
          url: source.url,
          title: source.title,
          start_index: startIndex,
          end_index: endIndex,
        }
      })

      return {
        ...base,
        responseOutput: [
          {
            type: 'web_search_call',
            action: {
              type: 'search',
              sources: sources.map((source) => ({ type: 'url', url: source.url })),
            },
          },
          {
            type: 'message',
            content: [{ type: 'output_text', text, annotations }],
          },
        ],
      }
    },
  }
}

function buildOrchestrationDependencies(identity: FertilizerEnrichmentIdentity) {
  const liveFetchProvider = createLiveFetchProvider()

  return createFertilizerEnrichmentOrchestrationDependencies({
    ...createFertilizerEnrichmentProductionAdapterDependencies({ now: () => FIXED_NOW }),
    manufacturerResearchStructuredProvider: createPhaseBStructuredProvider(identity),
    fetchManufacturerDocument: (url) => liveFetchProvider.fetchSource(url),
  })
}

function buildCaptureRecognition(input?: {
  productName?: string | null
  sourceUrl?: string
}): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 0.96,
    dataCompleteness: 0.72,
    recognition: recognitionFromImageAnalysis({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: input?.productName ?? 'Stress-Manager',
      variant: '0-0-30',
      productDescriptor: null,
      manufacturer: 'Rasendoktor GmbH',
      npkLabel: '0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      packageSizeValue: 5,
      packageSizeUnit: 'kg',
      form: 'granular',
      gtin: null,
      textFragments: ['Rasendoktor', 'Professional', 'NPK 0-0-30', '5 kg'],
      fieldConfidence: {
        brand: 0.95,
        productName: input?.productName === '' ? 0.2 : 0.94,
        npk: 0.93,
        packageSize: 0.9,
        form: 0.88,
      },
    }),
    catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
    sources: input?.sourceUrl
      ? [
          {
            type: 'official_brand',
            title: 'Rasendoktor Professional',
            url: input.sourceUrl,
            retrievedAt: FIXED_NOW,
            evidence: 'Recognition source',
          },
        ]
      : [],
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
  }
}

describe('fertilizerEnrichmentCaptureResearchEntryRegression', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('treats variant-only capture identity as research-ready', () => {
    const identity = {
      manufacturer: 'Rasendoktor GmbH',
      officialName: null,
      productLine: 'Professional',
      variant: '0-0-30',
      identityFingerprint: 'rasendoktor|professional|0-0-30',
      identityConfidence: 0.96,
      hasIdentityAmbiguity: false,
    }

    expect(isProductIdentityCompleteForResearch(identity)).toBe(true)
  })

  it('keeps capture identity incomplete when productName and variant are both missing', () => {
    expect(
      isProductIdentityCompleteForResearch({
        manufacturer: 'Rasendoktor GmbH',
        officialName: null,
        productLine: 'Professional',
        variant: null,
        identityFingerprint: 'rasendoktor|professional',
        identityConfidence: 0.96,
        hasIdentityAmbiguity: false,
      }),
    ).toBe(false)
  })

  it('maps missing productName capture identity to variant officialName', () => {
    let draft = createInitialCaptureDraft()
    draft = acceptRecognitionResult(draft, buildCaptureRecognition({ productName: '' }), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-missing-product-name',
    })

    expect(input.identity.officialName).toBe('0-0-30')
    expect(isProductIdentityCompleteForResearch(input.identity)).toBe(true)
  })

  it('does not abort capture enrichment before manufacturer research when productName is missing', async () => {
    let draft = createInitialCaptureDraft()
    draft = acceptRecognitionResult(
      draft,
      buildCaptureRecognition({ productName: '', sourceUrl: PROFESSIONAL_URL }),
      {
        stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
      },
    )

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-live-regression',
    })

    const result = await orchestrateFertilizerEnrichment(input, {
      ...buildOrchestrationDependencies(input.identity),
      now: () => FIXED_NOW,
      createOrchestrationRunId: () => 'orch-capture-live-regression',
      createNormalizationRunId: () => 'norm-capture-live-regression',
    })

    if (result.status === 'failed') {
      expect(result.failureReason).not.toBe('no_viable_source')
    }
    expect(result.attemptedAdapters).toContain('manufacturer_product_page')
    expect(result.manufacturerResearchDiagnostics?.searchProviderAttempted).toBe(true)
    expect(result.manufacturerResearchDiagnostics?.automaticResearchAttempted).toBe(true)
  })

  it('reaches intake_ready for full Stress-Manager front capture through phase B research', async () => {
    let draft = createInitialCaptureDraft()
    draft = acceptRecognitionResult(
      draft,
      buildCaptureRecognition({ productName: 'Stress-Manager', sourceUrl: PROFESSIONAL_URL }),
      {
        stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
      },
    )

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-full-stress-manager',
    })

    const result = await orchestrateFertilizerEnrichment(input, {
      ...buildOrchestrationDependencies(input.identity),
      now: () => FIXED_NOW,
      createOrchestrationRunId: () => 'orch-capture-full-stress-manager',
      createNormalizationRunId: () => 'norm-capture-full-stress-manager',
    })

    expect(result.status).toBe('intake_ready')
    expect(result.manufacturerResearchDiagnostics?.searchProviderAttempted).toBe(true)
    expect(result.rawDeclarationInput?.nutrientMatrix.sulfur?.value).toBe(10.2)
    expect(result.rawDeclarationInput?.nutrientMatrix.potash?.value).toBe(30)
  })
})
