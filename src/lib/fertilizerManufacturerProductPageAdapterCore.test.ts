import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import { runFertilizerManufacturerProductPageAdapter } from './fertilizerManufacturerProductPageAdapterCore'
import { buildStructuredResearchProviderResultFromRecord } from './fertilizerManufacturerStructuredResearchCore'

const OFFICIAL_URL = 'https://www.rasendoktor.de/duenger/stress-manager'

describe('fertilizerManufacturerProductPageAdapterCore', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns a successful adapter result for a discovered official page', async () => {
    const html = `Manufacturer: Rasendoktor
Product: Stress-Manager
Form: Granular
NPK 0-0-30
Declaration basis (N / P2O5 / K2O)
Nitrogen (N): 0%
Phosphate (P2O5): 0%
Potash (K2O): 30%
Zusammensetzung: 30 % Kaliumoxid (K2O), 10,2 % Schwefel (S), 3,0 % Eisen (Fe)
Declaration section complete`

    const input: FertilizerEnrichmentOrchestrationInput = {
      objectCategory: 'fertilizer' as const,
      identity: {
        manufacturer: 'Rasendoktor',
        officialName: 'Stress-Manager',
        productLine: 'Professional',
        variant: '0-0-30',
        identityFingerprint: 'fp',
        identityConfidence: 1,
        hasIdentityAmbiguity: false,
      },
      allowedInputChannels: ['capture_flow' as const],
      sourceHints: [],
    }

    const result = await runFertilizerManufacturerProductPageAdapter(
      {
        input,
        adapterType: 'manufacturer_product_page',
        orchestrationRunId: 'test',
        attempt: 1,
        successfulResults: [],
        partialResults: [],
        isCancelled: () => false,
        shouldTimeout: () => false,
      },
      {
        fetchDocument: async () => ({
          ok: true,
          finalUrl: OFFICIAL_URL,
          contentType: 'text/plain',
          text: html,
          retrievedAt: '2026-07-29T10:00:00.000Z',
          statusCode: 200,
        }),
        structuredResearchProvider: {
          runStructuredWebResearch: async () =>
            buildStructuredResearchProviderResultFromRecord({
              record: {
                manufacturer: 'Rasendoktor',
                productLine: 'Professional',
                productName: 'Stress-Manager',
                productForm: 'granular',
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
                  sulfur: 10.2,
                  iron: 3,
                  manganese: null,
                  copper: null,
                  zinc: null,
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
                  sulfur: 'S',
                  iron: 'Fe',
                  manganese: null,
                  copper: null,
                  zinc: null,
                  boron: null,
                  molybdenum: null,
                },
                declarationComplete: true,
                identityMatch: true,
                confidence: 0.95,
                sources: [
                  {
                    url: OFFICIAL_URL,
                    title: OFFICIAL_URL,
                    category: 'official_manufacturer',
                  },
                ],
              },
              identity: input.identity,
              npkLabel: '0-0-30',
              manufacturerDomain: 'rasendoktor.de',
            }),
        },
      },
    )

    expect(result.status).toMatch(/success|partial/)
    expect(input.manufacturerResearchDiagnostics?.automaticResearchAttempted).toBe(true)
  })
})
