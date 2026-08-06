import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProductRecognizeResult } from '../types/productRecognize'
import type { FertilizerEnrichmentOrchestrationResult } from '../types/fertilizerEnrichmentOrchestration'
import { acceptRecognitionResult, createInitialCaptureDraft } from './fertilizerCaptureCore'
import { buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft } from './fertilizerCaptureEnrichmentInputCore'
import { CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID } from './fertilizerCaptureRecognitionPackagingCore'
import { createFertilizerEnrichmentOrchestrationDependencies } from './fertilizerEnrichmentAdapterCompositionCore'
import { orchestrateFertilizerEnrichment } from './fertilizerEnrichmentOrchestrationCore'
import { createFertilizerEnrichmentProductionAdapterDependencies } from './fertilizerEnrichmentProductionAdapterCore'
import { validateFertilizerManufacturerDocumentSource } from './fertilizerManufacturerDocumentSourceValidatorCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const MANUFACTURER_URL = 'https://www.rasendoktor.de/duenger/stress-manager'

function stressManagerRecognitionResult(): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 0.96,
    dataCompleteness: 0.82,
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
      packageSizeValue: 20,
      packageSizeUnit: 'kg',
      form: 'granular',
      gtin: null,
      textFragments: ['Rasendoktor Stress-Manager', 'NPK 0-0-30'],
      fieldConfidence: {
        brand: 0.95,
        productName: 0.94,
        npk: 0.93,
        packageSize: 0.9,
      },
    }),
    catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
    sources: [
      {
        type: 'official_brand',
        title: 'Rasendoktor Stress-Manager',
        url: MANUFACTURER_URL,
        retrievedAt: '2026-07-28T12:00:00.000Z',
        evidence: 'Offizielle Produktseite',
      },
    ],
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

function buildStressManagerCaptureDraft() {
  let draft = createInitialCaptureDraft()
  draft = acceptRecognitionResult(draft, stressManagerRecognitionResult(), {
    stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
  })
  return draft
}

function mockManufacturerHtmlResponse(): Response {
  const body = new TextEncoder().encode(
    `<html><body>
      <h1>Stress-Manager</h1>
      <p>Manufacturer: Rasendoktor GmbH</p>
      <p>Product: Stress-Manager</p>
      <p>Product variant: 0-0-30</p>
      <p>NPK 0-0-30</p>
      <p>Declaration basis (N / P2O5 / K2O)</p>
      <p>Nitrogen (N): 0%</p>
      <p>Phosphate (P2O5): 0%</p>
      <p>Potash (K2O): 30%</p>
      <p>Declaration section complete</p>
    </body></html>`,
  ).buffer

  return {
    status: 200,
    ok: true,
    url: MANUFACTURER_URL,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-type' ? 'text/html' : null),
    },
    arrayBuffer: async () => body,
  } as Response
}

function expectOrchestrationAvoidsNoViableSource(result: FertilizerEnrichmentOrchestrationResult) {
  if (result.status === 'failed') {
    expect(result.failureReason).not.toBe('no_viable_source')
    return
  }

  expect(result.rawDeclarationInput?.npk?.potash?.value).toBe(30)

  if (result.status === 'intake_ready' || result.status === 'needs_input') {
    expect(result.pipelineResult?.normalizationResult).toBeDefined()
  }
}

function expectOrchestrationIntakeReadyWithoutRecognitionGaps(
  result: FertilizerEnrichmentOrchestrationResult,
) {
  if (result.status !== 'intake_ready') {
    throw new Error(`Expected intake_ready, received ${result.status}`)
  }

  expect(result.pipelineResult.readinessResult.status).toBe('ready')
  expect(result.pipelineResult.readinessResult.missingRequirements).not.toContain('identity.manufacturer')
  expect(result.pipelineResult.readinessResult.missingRequirements).not.toContain('basis.product_form')
  expect(result.pipelineResult.readinessResult.missingRequirements).not.toContain('ingredients.matrix')
}

describe('fertilizerEnrichmentRecognitionSourceIntegration', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('maps recognition sources into enrichment sourceHints', () => {
    const draft = buildStressManagerCaptureDraft()
    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-key:enrichment',
    })

    expect(
      input.sourceHints?.some(
        (hint) =>
          hint.adapterType === 'manufacturer_product_document' &&
          hint.sourceUrl === MANUFACTURER_URL &&
          hint.hintType === 'recognition',
      ),
    ).toBe(true)
    expect(input.captureInlineSourceTexts?.[CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID]).toContain(
      'Stress-Manager',
    )
  })

  it('accepts HTTPS recognition URLs for manufacturer validation', () => {
    const validation = validateFertilizerManufacturerDocumentSource(MANUFACTURER_URL)
    expect(validation.status).toBe('valid')
  })

  it('rejects HTTP recognition URLs at manufacturer validation', () => {
    const validation = validateFertilizerManufacturerDocumentSource(
      'http://www.rasendoktor.de/duenger/stress-manager',
    )
    expect(validation).toEqual({ status: 'invalid', reason: 'unsupported_protocol' })
  })

  it('runs recognition sources through production adapters and orchestration without no_viable_source', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockManufacturerHtmlResponse()))

    const draft = buildStressManagerCaptureDraft()
    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-key:enrichment',
    })

    const orchestrationDependencies = createFertilizerEnrichmentOrchestrationDependencies(
      createFertilizerEnrichmentProductionAdapterDependencies({ now: () => FIXED_NOW }),
    )

    expect(orchestrationDependencies.adapters.length).toBeGreaterThan(0)

    const result = await orchestrateFertilizerEnrichment(input, {
      ...orchestrationDependencies,
      now: () => FIXED_NOW,
      createOrchestrationRunId: () => 'orch-recognition-integration',
      createNormalizationRunId: () => 'norm-recognition-integration',
    })

    expectOrchestrationAvoidsNoViableSource(result)
    expect(result.attemptedAdapters).toContain('manufacturer_product_document')
    expect(result.attemptedAdapters).toContain('packaging')
  })

  it('still avoids no_viable_source when manufacturer fetch fails but recognition packaging is inline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 404,
        ok: false,
        url: MANUFACTURER_URL,
        headers: { get: () => null },
        arrayBuffer: async () => new ArrayBuffer(0),
      })),
    )

    const draft = buildStressManagerCaptureDraft()
    const input = buildFertilizerEnrichmentOrchestrationInputFromCaptureDraft(draft, {
      enrichmentIdempotencyKey: 'capture-key:enrichment',
    })

    const result = await orchestrateFertilizerEnrichment(input, {
      ...createFertilizerEnrichmentOrchestrationDependencies(
        createFertilizerEnrichmentProductionAdapterDependencies({ now: () => FIXED_NOW }),
      ),
      now: () => FIXED_NOW,
      createOrchestrationRunId: () => 'orch-inline-packaging',
      createNormalizationRunId: () => 'norm-inline-packaging',
    })

    expectOrchestrationAvoidsNoViableSource(result)
    expect(result.successfulAdapters).toContain('packaging')
    expect(result.status).toBe('intake_ready')
    expectOrchestrationIntakeReadyWithoutRecognitionGaps(result)
  })
})
