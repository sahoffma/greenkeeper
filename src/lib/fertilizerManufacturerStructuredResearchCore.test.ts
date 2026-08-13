import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import { runAutomaticManufacturerResearch } from './fertilizerManufacturerResearchCore'
import {
  MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS,
} from './fertilizerManufacturerResearchTimingCore'
import {
  MANUFACTURER_RESEARCH_STRUCTURED_BUDGET_MS,
  countStructuredPositiveNutrients,
  mapStructuredResearchToAdapterResult,
  parseManufacturerStructuredResearchRecord,
  selectPrimaryStructuredResearchSource,
  type FertilizerManufacturerStructuredResearchProvider,
  type ManufacturerStructuredResearchRecord,
} from './fertilizerManufacturerStructuredResearchCore'

const IDENTITY: FertilizerEnrichmentIdentity = {
  manufacturer: 'Example Manufacturer GmbH',
  officialName: 'Universal Feed',
  productLine: 'Professional',
  variant: '10-5-20',
  identityFingerprint: 'fp',
  identityConfidence: 1,
  hasIdentityAmbiguity: false,
}

const OFFICIAL_URL = 'https://example-manufacturer.de/universal-feed'
const RETAILER_URL = 'https://shop.example/universal-feed'

function buildStructuredRecord(
  overrides: Partial<ManufacturerStructuredResearchRecord> = {},
): ManufacturerStructuredResearchRecord {
  return {
    manufacturer: 'Example Manufacturer GmbH',
    productLine: 'Professional',
    productName: 'Universal Feed',
    productForm: 'granular',
    npk: { nitrogen: 10, phosphate: 5, potash: 20 },
    nutrientMatrix: {
      nitrogen: 10,
      phosphate: 5,
      potash: 20,
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
    declarationComplete: true,
    identityMatch: true,
    confidence: 0.95,
    sources: [
      {
        url: OFFICIAL_URL,
        title: 'Official product page',
        category: 'official_manufacturer',
      },
    ],
    ...overrides,
  }
}

function createStructuredProvider(
  handler: FertilizerManufacturerStructuredResearchProvider['runStructuredWebResearch'],
): FertilizerManufacturerStructuredResearchProvider {
  return { runStructuredWebResearch: handler }
}

function fullDeclarationText(): string {
  return `Manufacturer: Example Manufacturer
Product: Universal Feed
Form: Granular
NPK 10-5-20
Declaration basis (N / P2O5 / K2O)
Nitrogen (N): 10%
Phosphate (P2O5): 5%
Potash (K2O): 20%
Zusammensetzung: 10 % Stickstoff (N), 10,2 % Schwefel (S), 3,0 % Eisen (Fe)
Declaration section complete`
}

describe('fertilizerManufacturerStructuredResearchCore', () => {
  it('selects official manufacturer source over retailer source', () => {
    const primary = selectPrimaryStructuredResearchSource([
      { url: RETAILER_URL, title: 'shop', category: 'retailer' },
      { url: OFFICIAL_URL, title: 'official', category: 'official_manufacturer' },
    ])

    expect(primary?.category).toBe('official_manufacturer')
  })

  it('maps structured research with iron and sulfur greater than zero', () => {
    const record = buildStructuredRecord()
    const adapterResult = mapStructuredResearchToAdapterResult({
      record,
      identity: IDENTITY,
      retrievedAt: '2026-07-29T10:00:00.000Z',
    })

    expect(adapterResult?.status).toBe('success')
    if (adapterResult?.status === 'success' || adapterResult?.status === 'partial') {
      expect(adapterResult.extraction?.extractedNutrients?.some((entry) => entry.key === 'iron')).toBe(
        true,
      )
      expect(adapterResult.extraction?.extractedNutrients?.find((entry) => entry.key === 'iron')?.value).toBe(3)
      expect(
        adapterResult.extraction?.extractedNutrients?.find((entry) => entry.key === 'sulfur')?.value,
      ).toBe(10.2)
    }
    expect(countStructuredPositiveNutrients(record)).toBeGreaterThanOrEqual(2)
  })

  it('keeps sources in structured adapter result metadata', () => {
    const record = buildStructuredRecord()
    const adapterResult = mapStructuredResearchToAdapterResult({
      record,
      identity: IDENTITY,
      retrievedAt: '2026-07-29T10:00:00.000Z',
    })

    expect(adapterResult?.sourceUrl).toBe(OFFICIAL_URL)
    expect(adapterResult?.sourceType).toBe('web_search')
  })

  it('does not invent zero values for undeclared nutrients in incomplete declarations', () => {
    const record = buildStructuredRecord({
      declarationComplete: false,
      nutrientMatrix: {
        nitrogen: 10,
        phosphate: 5,
        potash: 20,
        nitrateNitrogen: null,
        ammoniumNitrogen: null,
        ureaNitrogen: null,
        organicNitrogen: null,
        magnesium: null,
        calcium: null,
        sulfur: null,
        iron: null,
        manganese: null,
        copper: null,
        zinc: null,
        boron: null,
        molybdenum: null,
      },
    })

    const adapterResult = mapStructuredResearchToAdapterResult({
      record,
      identity: IDENTITY,
      retrievedAt: '2026-07-29T10:00:00.000Z',
    })

    expect(adapterResult?.status).toBe('partial')
    if (adapterResult?.status === 'success' || adapterResult?.status === 'partial') {
      expect(adapterResult.extraction?.extractedNutrients?.some((entry) => entry.key === 'iron')).toBe(
        false,
      )
      expect(adapterResult.extraction?.extractedNutrients?.some((entry) => entry.key === 'sulfur')).toBe(
        false,
      )
    }
  })

  it('allows structured research longer than four seconds within the configured budget', async () => {
    let currentTime = 0

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: createStructuredProvider(async () => {
        currentTime += 6_000
        return {
          record: buildStructuredRecord(),
          webSearchToolCallObserved: true,
        }
      }),
      fetchProvider: {
        fetchSource: async () => ({ ok: false, errorCode: 'source_not_found', retryable: false }),
      },
      runtime: {
        now: () => currentTime,
        totalBudgetMs: MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS,
        logTiming: false,
      },
    })

    expect(result.diagnostics.searchProviderDurationMs).toBeGreaterThan(4_000)
    expect(result.diagnostics.searchProviderDurationMs).toBeLessThanOrEqual(
      MANUFACTURER_RESEARCH_STRUCTURED_BUDGET_MS,
    )
    expect(result.diagnostics.researchSourceStrategy).toBe('structured_web_research')
    expect(result.adapterResult?.status).toBe('success')
  })

  it('falls back to direct URL candidates after structured research timeout', async () => {
    let fetchCount = 0

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: createStructuredProvider(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return {
          record: buildStructuredRecord({ declarationComplete: false }),
          webSearchToolCallObserved: true,
        }
      }),
      fetchProvider: {
        fetchSource: async () => {
          fetchCount += 1
          return { ok: false, errorCode: 'source_not_found', retryable: false }
        },
      },
      runtime: {
        structuredBudgetMs: 5,
        logTiming: false,
      },
    })

    expect(result.diagnostics.searchProviderOutcome).toBe('timeout')
    expect(result.diagnostics.directCandidateFallbackUsed).toBe(true)
    expect(result.diagnostics.researchSourceStrategy).toBe('structured_then_direct_fallback')
    expect(fetchCount).toBeGreaterThan(0)
  })

  it('returns controlled diagnostics when structured research finds no source', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: createStructuredProvider(async () => null),
      fetchProvider: {
        fetchSource: async () => ({ ok: false, errorCode: 'source_not_found', retryable: false }),
      },
      runtime: { logTiming: false },
    })

    expect(result.adapterResult).toBeNull()
    expect(result.diagnostics.searchProviderOutcome).toBe('no_results')
    expect(result.diagnostics.fallbackRecommendation).toBe('retry_search')
  })

  it('returns success diagnostics for complete declarations', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: createStructuredProvider(async () => ({
        record: buildStructuredRecord(),
        webSearchToolCallObserved: true,
      })),
      fetchProvider: {
        fetchSource: async () => ({ ok: false, errorCode: 'source_not_found', retryable: false }),
      },
      runtime: { logTiming: false },
    })

    expect(result.adapterResult?.status).toBe('success')
    expect(result.diagnostics.researchFailureStage).toBe('none')
    expect(result.diagnostics.structuredDeclarationComplete).toBe(true)
  })

  it('uses the same research core for text identity without image input', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      npkLabel: '10-5-20',
      packageSizeLabel: '5 kg',
      structuredResearchProvider: createStructuredProvider(async (input) => {
        expect(input.identity.officialName).toBe('Universal Feed')
        expect(input.npkLabel).toBe('10-5-20')
        expect(input.packageSizeLabel).toBe('5 kg')
        return {
          record: buildStructuredRecord(),
          webSearchToolCallObserved: true,
        }
      }),
      fetchProvider: {
        fetchSource: async () => ({ ok: false, errorCode: 'source_not_found', retryable: false }),
      },
      runtime: { logTiming: false },
    })

    expect(result.diagnostics.researchSourceStrategy).toBe('structured_web_research')
    expect(result.adapterResult?.status).toBe('success')
  })

  it('parses structured research records from provider JSON', () => {
    const parsed = parseManufacturerStructuredResearchRecord({
      manufacturer: 'Example Manufacturer GmbH',
      productLine: 'Professional',
      productName: 'Universal Feed',
      productForm: 'granular',
      npk: { nitrogen: 10, phosphate: 5, potash: 20 },
      nutrientMatrix: buildStructuredRecord().nutrientMatrix,
      declarationComplete: true,
      identityMatch: true,
      confidence: 0.9,
      sources: [{ url: OFFICIAL_URL, title: 'official', category: 'official_manufacturer' }],
    })

    expect(parsed?.sources).toHaveLength(1)
    expect(parsed?.sources[0]?.category).toBe('official_manufacturer')
  })

  it('uses direct fetch fallback when structured research is incomplete', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: createStructuredProvider(async () => ({
        record: buildStructuredRecord({ declarationComplete: false }),
        webSearchToolCallObserved: true,
      })),
      fetchProvider: {
        fetchSource: async () => ({
          ok: true,
          finalUrl: 'https://www.example-manufacturer.de/universal-feed',
          contentType: 'text/plain',
          text: fullDeclarationText(),
          retrievedAt: '2026-07-29T10:00:00.000Z',
          statusCode: 200,
        }),
      },
      runtime: { logTiming: false, maxParallelFetches: 1 },
    })

    expect(result.diagnostics.directCandidateFallbackUsed).toBe(true)
    expect(result.adapterResult?.status).toBe('success')
  })
})
