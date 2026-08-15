import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import { runAutomaticManufacturerResearch } from './fertilizerManufacturerResearchCore'
import {
  buildStructuredResearchProviderResultFromRecord,
  runManufacturerStructuredResearchAttempt,
} from './fertilizerManufacturerStructuredResearchCore'
import { orchestrateFertilizerEnrichment } from './fertilizerEnrichmentOrchestrationCore'
import { buildFertilizerEnrichmentOrchestrationInputFromTextIdentity } from './fertilizerTextIdentityEnrichmentInputCore'
import { createFertilizerEnrichmentOrchestrationDependencies } from './fertilizerEnrichmentAdapterCompositionCore'
import { createFertilizerEnrichmentProductionAdapterDependencies } from './fertilizerEnrichmentProductionAdapterCore'

const IDENTITY: FertilizerEnrichmentIdentity = {
  manufacturer: 'Rasendoktor GmbH',
  officialName: 'Stress-Manager',
  productLine: 'Professional',
  variant: '0-0-30',
  identityFingerprint: 'fp-live-phase-b',
  identityConfidence: 1,
  hasIdentityAmbiguity: false,
}

const PROFESSIONAL_URL =
  'https://www.rasendoktor.de/duenger/rasenduenger/kalium-rasenduenger-mit-spurennaehrstoffen/?awc=123&utm_source=openai'
const STANDARD_URL =
  'https://www.rasendoktor.de/duenger/rasenduenger/kalium-spezial-rasenduenger-stressmanager/'

const PROFESSIONAL_BODY = `<html><body>
  <h1>Rasendoktor Professional Kalium-Spezialdünger + Spurennährstoffe</h1>
  <p>Manufacturer: Rasendoktor</p>
  <p>Product: Stress-Manager</p>
  <p>Form: Granular</p>
  <p>NPK 0-0-30</p>
  <p>Zusammensetzung: 30 % Kaliumoxid (K2O), 10,2 % Schwefel (S), 0,1 % Kupfer (Cu), 3,0 % Eisen (Fe), 0,1 % Mangan (Mn), 0,1 % Zink (Zn)</p>
</body></html>`

const STANDARD_BODY = `<html><body>
  <h1>Kalium Spezial-Rasendünger Stressmanager</h1>
  <p>NPK 0-0-22</p>
  <p>Zusammensetzung: 22 % wasserlösliches Kaliumoxid (K), 16,4 % wasserlöslicher Schwefel (S)</p>
</body></html>`

function buildPhaseAResponseOutput() {
  const sources = [
    ...Array.from({ length: 10 }, (_entry, index) => ({
      url: `https://www.rasendoktor.de/search/result-${index}`,
      title: `Search result ${index}`,
    })),
    { url: STANDARD_URL, title: 'Stressmanager Standard 0-0-22' },
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

  return [
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
  ]
}

function createLivePhaseAStructuredProvider() {
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
        identity: IDENTITY,
        npkLabel: '0-0-30',
        manufacturerDomain: 'rasendoktor.de',
        queries: ['Rasendoktor Professional Stress-Manager 0-0-30'],
      })

      return {
        ...base,
        responseOutput: buildPhaseAResponseOutput(),
      }
    },
  }
}

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
          retrievedAt: '2026-08-15T10:58:37.514Z',
          statusCode: 200,
        }
      }
      if (normalized.includes('stressmanager')) {
        return {
          ok: true as const,
          finalUrl: url,
          text: STANDARD_BODY,
          contentType: 'text/html',
          retrievedAt: '2026-08-15T10:58:37.514Z',
          statusCode: 200,
        }
      }
      return { ok: false as const, errorCode: 'source_not_found' as const, retryable: false }
    },
  }
}

describe('fertilizerManufacturerPhaseBAdapterIntegration', () => {
  it('maps verified phase B nutrients through adapter bindings and readiness', async () => {
    const provider = createLivePhaseAStructuredProvider()

    const attempt = await runManufacturerStructuredResearchAttempt({
      structuredResearchProvider: provider,
      fetchProvider: createLiveFetchProvider(),
      identity: IDENTITY,
      queries: ['Rasendoktor Professional Stress-Manager 0-0-30'],
      manufacturerDomain: 'rasendoktor.de',
      npkLabel: '0-0-30',
    })

    expect(attempt.finalResearchDecision?.accepted).toBe(true)
    const bindings = attempt.finalResearchDecision?.nutrientSourceBindings ?? []
    expect(bindings.length).toBeGreaterThanOrEqual(6)
    expect(bindings.filter((binding) => binding.accepted)).toHaveLength(bindings.length)
    expect(attempt.structuredPositiveNutrientCount).toBeGreaterThanOrEqual(6)
    expect(attempt.structuredDeclarationComplete).toBe(true)
    expect(attempt.phaseBDiagnostics?.adapterPositiveEntryCount).toBeGreaterThanOrEqual(6)
    expect(attempt.phaseBDiagnostics?.phaseBAdapterAccepted).toBe(true)
    expect(attempt.adapterResult?.status).toBe('success')
    if (attempt.adapterResult?.status !== 'success') {
      throw new Error('expected successful manufacturer adapter result')
    }
    expect(
      attempt.adapterResult.extraction?.extractedNutrients?.find((entry) => entry.key === 'sulfur')?.value,
    ).toBe(10.2)
    expect(
      attempt.adapterResult.extraction?.extractedNutrients?.find((entry) => entry.key === 'potash')?.value,
    ).toBe(30)

    const research = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: provider,
      fetchProvider: createLiveFetchProvider(),
      npkLabel: '0-0-30',
      runtime: { logTiming: false },
    })

    expect(research.diagnostics.researchSourceStrategy).toBe('structured_web_research')
    expect(research.adapterResult?.status).toBe('success')
    expect(research.diagnostics.nutrientChainDiagnostics?.phaseB?.nutrientSourceBindingCount).toBeGreaterThanOrEqual(6)
    expect(research.diagnostics.nutrientChainDiagnostics?.adapterPositiveEntryCount).toBeGreaterThanOrEqual(6)

    const liveFetchProvider = createLiveFetchProvider()

    const orchestration = await orchestrateFertilizerEnrichment(
      buildFertilizerEnrichmentOrchestrationInputFromTextIdentity(
        {
          manufacturer: 'Rasendoktor GmbH',
          productLine: 'Professional',
          officialName: 'Stress-Manager',
          variant: '0-0-30',
          productForm: 'granular',
          npk: { nitrogen: 0, phosphate: 0, potash: 30 },
        },
        { enrichmentIdempotencyKey: 'live-phase-b-adapter-bridge' },
      ),
      {
        ...createFertilizerEnrichmentOrchestrationDependencies({
          ...createFertilizerEnrichmentProductionAdapterDependencies({ now: () => '2026-08-15T10:58:37.514Z' }),
          manufacturerResearchStructuredProvider: provider,
          fetchManufacturerDocument: (url) => liveFetchProvider.fetchSource(url),
        }),
        now: () => '2026-08-15T10:58:37.514Z',
      },
    )

    expect(orchestration.status).toBe('intake_ready')
    expect(orchestration.rawDeclarationInput?.nutrientMatrix.sulfur?.value).toBe(10.2)
    expect(orchestration.rawDeclarationInput?.nutrientMatrix.potash?.value).toBe(30)
    expect(
      orchestration.manufacturerResearchDiagnostics?.nutrientChainDiagnostics?.phaseB?.phaseBAdapterAccepted,
    ).toBe(true)
    expect(
      orchestration.manufacturerResearchDiagnostics?.finalResearchDecision?.nutrientSourceBindings.length,
    ).toBeGreaterThanOrEqual(6)
  })
})
