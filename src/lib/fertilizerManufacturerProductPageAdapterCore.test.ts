import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import { runFertilizerManufacturerProductPageAdapter } from './fertilizerManufacturerProductPageAdapterCore'

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
        searchProvider: {
          discoverOfficialSources: async () => [
            {
              url: OFFICIAL_URL,
              title: OFFICIAL_URL,
              category: 'official_manufacturer',
              priority: 5,
            },
          ],
        },
      },
    )

    expect(result.status).toMatch(/success|partial/)
    expect(input.manufacturerResearchDiagnostics?.automaticResearchAttempted).toBe(true)
  })
})
