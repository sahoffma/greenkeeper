import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductRecognizeResult } from '../types/productRecognize'
import { acceptRecognitionResult, createInitialCaptureDraft } from './fertilizerCaptureCore'
import { buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft } from './fertilizerCaptureEnrichmentInputCore'
import { createFertilizerEnrichmentOrchestrationDependencies } from './fertilizerEnrichmentAdapterCompositionCore'
import { orchestrateFertilizerEnrichment } from './fertilizerEnrichmentOrchestrationCore'
import { createFertilizerEnrichmentProductionAdapterDependencies } from './fertilizerEnrichmentProductionAdapterCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import { buildFertilizerEnrichmentOrchestrationInputFromTextIdentity } from './fertilizerTextIdentityEnrichmentInputCore'
import { mapEnrichmentNutrientMatrixToSaved } from './fertilizerProductProfileSaveCore'
import type { FertilizerManufacturerStructuredResearchProvider } from './fertilizerManufacturerStructuredResearchCore'
import { buildStructuredResearchProviderResultFromRecord } from './fertilizerManufacturerStructuredResearchCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const OFFICIAL_PRODUCT_URL = 'https://www.rasendoktor.de/professional/stress-manager-0-0-30'
const OFFICIAL_PDF_URL = 'https://www.rasendoktor.de/downloads/professional-stress-manager-0-0-30.pdf'

function createOfficialStructuredResearchProvider(options?: {
  declarationComplete?: boolean
  sourceUrl?: string
  outcome?: 'success' | 'empty'
  includeMicronutrients?: boolean
}): FertilizerManufacturerStructuredResearchProvider {
  return {
    runStructuredWebResearch: async () => {
      if (options?.outcome === 'empty') {
        return null
      }

      const sourceUrl = options?.sourceUrl ?? OFFICIAL_PRODUCT_URL
      const includeMicronutrients = options?.includeMicronutrients ?? true
      const record = {
        manufacturer: 'Rasendoktor',
        productLine: 'Professional',
        productName: 'Stress-Manager',
        productForm: 'granular' as const,
        npk: { nitrogen: 0, phosphate: 0, potash: 30 },
        nutrientMatrix: {
          nitrogen: 0,
          phosphate: 0,
          potash: 30,
          nitrateNitrogen: null,
          ammoniumNitrogen: null,
          ureaNitrogen: null,
          organicNitrogen: null,
          magnesium: null,
          calcium: null,
          sulfur: includeMicronutrients ? 10.2 : null,
          iron: includeMicronutrients ? 3 : null,
          manganese: includeMicronutrients ? 0.1 : null,
          copper: includeMicronutrients ? 0.1 : null,
          zinc: includeMicronutrients ? 0.1 : null,
          boron: null,
          molybdenum: null,
        },
        nutrientDeclarationBases: {
          nitrogen: 'N',
          phosphate: 'P2O5',
          potash: 'K2O',
          nitrateNitrogen: null,
          ammoniumNitrogen: null,
          ureaNitrogen: null,
          organicNitrogen: null,
          magnesium: null,
          calcium: null,
          sulfur: includeMicronutrients ? 'S' : null,
          iron: includeMicronutrients ? 'Fe' : null,
          manganese: includeMicronutrients ? 'Mn' : null,
          copper: includeMicronutrients ? 'Cu' : null,
          zinc: includeMicronutrients ? 'Zn' : null,
          boron: null,
          molybdenum: null,
        },
        declarationComplete: options?.declarationComplete ?? true,
        identityMatch: true,
        confidence: 0.95,
        sources: [
          {
            url: sourceUrl,
            title: 'Professional Stress-Manager 0-0-30',
            category: sourceUrl.endsWith('.pdf') ? ('official_document' as const) : ('official_manufacturer' as const),
            sourceIdentity: {
              manufacturer: 'Rasendoktor',
              productLine: 'Professional',
              productName: 'Stress-Manager',
              npkLabel: '0-0-30',
            },
          },
        ],
      }

      return buildStructuredResearchProviderResultFromRecord({
        record,
        identity: {
          manufacturer: 'Rasendoktor GmbH',
          officialName: 'Stress-Manager',
          productLine: 'Professional',
          variant: '0-0-30',
          identityFingerprint: 'fp-integration',
          identityConfidence: 1,
          hasIdentityAmbiguity: false,
        },
        npkLabel: '0-0-30',
        manufacturerDomain: 'rasendoktor.de',
      })
    },
  }
}

function createProductionDependencies(options?: {
  declarationComplete?: boolean
  sourceUrl?: string
  outcome?: 'success' | 'empty'
  includeMicronutrients?: boolean
}) {
  return createFertilizerEnrichmentOrchestrationDependencies({
    ...createFertilizerEnrichmentProductionAdapterDependencies({ now: () => FIXED_NOW }),
    manufacturerResearchStructuredProvider: createOfficialStructuredResearchProvider(options),
  })
}

function fullOfficialDeclarationHtml(): string {
  return `<html><body>
    <h1>Stress Manager</h1>
    <p>Manufacturer: Rasendoktor</p>
    <p>Product: Stress-Manager</p>
    <p>Form: Granular</p>
    <p>NPK 0-0-30</p>
    <p>Declaration basis (N / P2O5 / K2O)</p>
    <p>Nitrogen (N): 0%</p>
    <p>Phosphate (P2O5): 0%</p>
    <p>Potash (K2O): 30%</p>
    <p>Zusammensetzung: 30 % Kaliumoxid (K2O), 10,2 % Schwefel (S), 0,1 % Kupfer (Cu), 3,0 % Eisen (Fe), 0,1 % Mangan (Mn), 0,1 % Zink (Zn)</p>
    <p>Magnesium (MgO): 0%</p>
    <p>Calcium (CaO): 0%</p>
    <p>Declaration section complete</p>
  </body></html>`
}

function fullOfficialDeclarationPdfText(): string {
  return `Manufacturer: Rasendoktor
Product: Stress-Manager
Form: Granular
NPK 0-0-30
Declaration basis (N / P2O5 / K2O)
Nitrogen (N): 0%
Phosphate (P2O5): 0%
Potash (K2O): 30%
Zusammensetzung: 30 % Kaliumoxid (K2O), 10,2 % Schwefel (S), 3,0 % Eisen (Fe)
Declaration section complete`
}

function mockFetchForOfficialSources() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('rasendoktor.de') && url.includes('stress-manager') && !url.endsWith('.pdf')) {
      return {
        status: 200,
        ok: true,
        url: OFFICIAL_PRODUCT_URL,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null,
        },
        arrayBuffer: async () => new TextEncoder().encode(fullOfficialDeclarationHtml()).buffer,
      } as unknown as Response
    }

    if (url.includes('rasendoktor.de') && url.endsWith('.pdf')) {
      const pdfBody = `%PDF-1.4\n1 0 obj\n<<>>\nendobj\nstream\n(${fullOfficialDeclarationPdfText()})\nendstream`
      return {
        status: 200,
        ok: true,
        url: OFFICIAL_PDF_URL,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type' ? 'application/pdf' : null,
        },
        arrayBuffer: async () => new TextEncoder().encode(pdfBody).buffer,
      } as unknown as Response
    }

    return {
      status: 404,
      ok: false,
      url,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response
  })
}

function frontPhotoRecognitionWithoutCompositionOcr(): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 0.96,
    dataCompleteness: 0.72,
    recognition: recognitionFromImageAnalysis({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
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
      textFragments: ['Rasendoktor', 'Professional', 'Stress-Manager', 'NPK 0-0-30', '5 kg'],
      fieldConfidence: {
        brand: 0.95,
        productName: 0.94,
        npk: 0.93,
        packageSize: 0.9,
        form: 0.88,
      },
    }),
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
  }
}

function npkOnlyDeclarationHtml(): string {
  return `<html><body>
    <h1>Stress Manager</h1>
    <p>Manufacturer: Rasendoktor</p>
    <p>Product: Stress-Manager</p>
    <p>Form: Granular</p>
    <p>NPK 0-0-30</p>
    <p>Declaration basis (N / P2O5 / K2O)</p>
    <p>Nitrogen (N): 0%</p>
    <p>Phosphate (P2O5): 0%</p>
    <p>Potash (K2O): 30%</p>
    <p>Declaration section complete</p>
  </body></html>`
}

function mockFetchForNpkOnlySources() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)

    if (url.includes('rasendoktor.de') && url.includes('stress-manager') && !url.endsWith('.pdf')) {
      return {
        status: 200,
        ok: true,
        url: OFFICIAL_PRODUCT_URL,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null,
        },
        arrayBuffer: async () => new TextEncoder().encode(npkOnlyDeclarationHtml()).buffer,
      } as unknown as Response
    }

    return {
      status: 404,
      ok: false,
      url,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Response
  })
}

describe('fertilizerManufacturerResearchIntegration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('researches official HTML for front photo with clear identity but without composition OCR', async () => {
    vi.stubGlobal('fetch', mockFetchForOfficialSources())

    let draft = createInitialCaptureDraft()
    draft = acceptRecognitionResult(draft, frontPhotoRecognitionWithoutCompositionOcr(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'front-photo-research',
    })

    const result = await orchestrateFertilizerEnrichment(input, {
      ...createProductionDependencies(),
      now: () => FIXED_NOW,
      createOrchestrationRunId: () => 'orch-front-photo-research',
      createNormalizationRunId: () => 'norm-front-photo-research',
    })

    expect(result.attemptedAdapters).toContain('manufacturer_product_page')
    expect(result.manufacturerResearchDiagnostics?.automaticResearchAttempted).toBe(true)
    expect(result.status).toBe('intake_ready')
    if (result.status === 'intake_ready') {
      expect(result.rawDeclarationInput?.nutrientMatrix.iron?.value).toBe(3)
      expect(result.rawDeclarationInput?.nutrientMatrix.sulfur?.value).toBe(10.2)
    }
  })

  it('uses the same research path for text identity without photo or OCR', async () => {
    vi.stubGlobal('fetch', mockFetchForOfficialSources())

    const input = buildFertilizerEnrichmentOrchestrationInputFromTextIdentity(
      {
        manufacturer: 'Rasendoktor',
        productLine: 'Professional',
        officialName: 'Stress-Manager',
        variant: '0-0-30',
        productForm: 'granular',
        npk: { nitrogen: 0, phosphate: 0, potash: 30 },
        packageSizeValue: 5,
        packageSizeUnit: 'kg',
      },
      { enrichmentIdempotencyKey: 'text-identity-research' },
    )

    const result = await orchestrateFertilizerEnrichment(input, {
      ...createProductionDependencies(),
      now: () => FIXED_NOW,
      createOrchestrationRunId: () => 'orch-text-identity-research',
      createNormalizationRunId: () => 'norm-text-identity-research',
    })

    expect(result.status).toBe('intake_ready')
    expect(result.manufacturerResearchDiagnostics?.manufacturerSearchAttempted).toBe(true)
    expect(result.rawDeclarationInput?.nutrientMatrix.iron?.value).toBe(3)
    expect(result.rawDeclarationInput?.nutrientMatrix.sulfur?.value).toBe(10.2)
  })

  it('parses official PDF datasheets during automatic research', async () => {
    vi.stubGlobal('fetch', mockFetchForOfficialSources())

    const input = buildFertilizerEnrichmentOrchestrationInputFromTextIdentity(
      {
        manufacturer: 'Rasendoktor',
        productLine: 'Professional',
        officialName: 'Stress-Manager',
        variant: '0-0-30',
        productForm: 'granular',
        npk: { nitrogen: 0, phosphate: 0, potash: 30 },
      },
      { enrichmentIdempotencyKey: 'pdf-research' },
    )

    const result = await orchestrateFertilizerEnrichment(input, {
      ...createProductionDependencies({ sourceUrl: OFFICIAL_PDF_URL }),
      now: () => FIXED_NOW,
    })

    expect(result.status).toBe('intake_ready')
    expect(result.manufacturerResearchDiagnostics?.structuredResearchResultPresent).toBe(true)
  })

  it('does not recommend upload_back_photo before automatic research has been attempted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      status: 404,
      ok: false,
      url: 'https://example.test/missing',
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(0),
    })))

    const input = buildFertilizerEnrichmentOrchestrationInputFromTextIdentity(
      {
        manufacturer: 'Rasendoktor',
        productLine: 'Professional',
        officialName: 'Stress-Manager',
        variant: '0-0-30',
        productForm: 'granular',
        npk: { nitrogen: 0, phosphate: 0, potash: 30 },
      },
      { enrichmentIdempotencyKey: 'failed-research-readiness' },
    )

    const result = await orchestrateFertilizerEnrichment(input, {
      ...createProductionDependencies({ outcome: 'empty' }),
      now: () => FIXED_NOW,
    })

    if (result.status === 'needs_input') {
      expect(result.recommendedNextAction).not.toBe('upload_back_photo')
      expect(result.recommendedNextAction).toBe('provide_product_document')
    }
  })

  it('does not invent zero values when research finds no declaration', async () => {
    const input = buildFertilizerEnrichmentOrchestrationInputFromTextIdentity(
      {
        manufacturer: 'Rasendoktor',
        productLine: 'Professional',
        officialName: 'Stress-Manager',
        variant: '0-0-30',
        productForm: 'granular',
        npk: { nitrogen: 0, phosphate: 0, potash: 30 },
      },
      { enrichmentIdempotencyKey: 'partial-research' },
    )

    const result = await orchestrateFertilizerEnrichment(input, {
      ...createProductionDependencies({
        declarationComplete: false,
        includeMicronutrients: false,
      }),
      now: () => FIXED_NOW,
    })

    expect(result.status).not.toBe('intake_ready')
    expect(result.rawDeclarationInput?.nutrientMatrix.iron?.status).not.toBe('not_declared')
  })

  it('rejects NPK-only canonical source declarations during phase B extraction', async () => {
    vi.stubGlobal('fetch', mockFetchForNpkOnlySources())

    const input = buildFertilizerEnrichmentOrchestrationInputFromTextIdentity(
      {
        manufacturer: 'Rasendoktor',
        productLine: 'Professional',
        officialName: 'Stress-Manager',
        variant: '0-0-30',
        productForm: 'granular',
        npk: { nitrogen: 0, phosphate: 0, potash: 30 },
      },
      { enrichmentIdempotencyKey: 'npk-only-structured-research' },
    )

    const result = await orchestrateFertilizerEnrichment(input, {
      ...createProductionDependencies({
        declarationComplete: true,
        includeMicronutrients: false,
      }),
      now: () => FIXED_NOW,
      createOrchestrationRunId: () => 'orch-npk-only-structured',
      createNormalizationRunId: () => 'norm-npk-only-structured',
    })

    expect(result.status).not.toBe('intake_ready')
    expect(result.rawDeclarationInput?.nutrientMatrix.sulfur?.value).toBeUndefined()
  })

  it('reaches intake_ready and profile-save mapping through structured research', async () => {
    vi.stubGlobal('fetch', mockFetchForOfficialSources())

    const input = buildFertilizerEnrichmentOrchestrationInputFromTextIdentity(
      {
        manufacturer: 'Rasendoktor',
        productLine: 'Professional',
        officialName: 'Stress-Manager',
        variant: '0-0-30',
        productForm: 'granular',
        npk: { nitrogen: 0, phosphate: 0, potash: 30 },
      },
      { enrichmentIdempotencyKey: 'structured-profile-save' },
    )

    const result = await orchestrateFertilizerEnrichment(input, {
      ...createProductionDependencies(),
      now: () => FIXED_NOW,
      createOrchestrationRunId: () => 'orch-structured-profile-save',
      createNormalizationRunId: () => 'norm-structured-profile-save',
    })

    expect(result.status).toBe('intake_ready')
    if (result.status !== 'intake_ready') {
      return
    }

    const saved = mapEnrichmentNutrientMatrixToSaved(
      result.pipelineResult.normalizationResult.enrichmentResult.nutrientMatrix,
    )
    expect(saved.iron?.value).toBe(3)
    expect(saved.sulfur?.value).toBe(10.2)
    expect(
      result.manufacturerResearchDiagnostics?.nutrientChainDiagnostics?.normalizedPositiveEntryCount,
    ).toBeGreaterThan(1)
  })
})
