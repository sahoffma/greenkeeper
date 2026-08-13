import { describe, expect, it } from 'vitest'
import {
  buildManufacturerResearchWebSearchPrompt,
  computeSearchCandidatePriority,
  countOfficialSearchResults,
  mapSearchSourcesToCandidates,
  parseManufacturerResearchWebSearchSources,
  rankDiscoveredSearchCandidates,
} from './fertilizerManufacturerResearchSearchProviderCore'
import { runAutomaticManufacturerResearch } from './fertilizerManufacturerResearchCore'
import { MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS } from './fertilizerManufacturerResearchTimingCore'
import {
  runManufacturerStructuredResearchAttempt,
  type FertilizerManufacturerStructuredResearchProvider,
} from './fertilizerManufacturerStructuredResearchCore'

const IDENTITY = {
  manufacturer: 'Example Manufacturer GmbH',
  officialName: 'Universal Feed',
  productLine: 'Professional',
  variant: '10-5-20',
  identityFingerprint: 'fp',
  identityConfidence: 1,
  hasIdentityAmbiguity: false,
} as const

function buildStructuredRecord(officialUrl: string) {
  return {
    manufacturer: 'Example Manufacturer GmbH',
    productLine: 'Professional',
    productName: 'Universal Feed',
    productForm: 'granular' as const,
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
    sources: [{ url: officialUrl, title: officialUrl, category: 'official_manufacturer' as const }],
  }
}

describe('fertilizerManufacturerResearchSearchProviderCore', () => {
  it('parses and validates search sources without logging raw queries', () => {
    const parsed = parseManufacturerResearchWebSearchSources({
      sources: [
        {
          url: 'https://example-manufacturer.de/products/universal-feed.pdf',
          title: 'Datasheet',
          category: 'official_document',
        },
        {
          url: 'not-a-valid-url',
          title: 'invalid',
          category: 'retailer',
        },
      ],
    })

    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.category).toBe('official_document')
    expect(buildManufacturerResearchWebSearchPrompt({
      identity: IDENTITY,
      queries: ['Example Manufacturer Universal Feed'],
      manufacturerDomain: 'example-manufacturer.de',
    })).toContain('searchQueries')
  })

  it('ranks official manufacturer sources ahead of retailers', () => {
    const ranked = rankDiscoveredSearchCandidates([
      {
        url: 'https://shop.example/universal-feed',
        title: 'shop',
        category: 'retailer',
        priority: 2,
      },
      {
        url: 'https://example-manufacturer.de/universal-feed',
        title: 'official',
        category: 'official_manufacturer',
        priority: 6,
      },
    ])

    expect(ranked[0]?.category).toBe('official_manufacturer')
    expect(computeSearchCandidatePriority(ranked[0]!, 'example-manufacturer.de')).toBeGreaterThan(
      computeSearchCandidatePriority(ranked[1]!, 'example-manufacturer.de'),
    )
  })

  it('limits supplemental retailer results when official sources exist', () => {
    const candidates = mapSearchSourcesToCandidates(
      [
        {
          url: 'https://example-manufacturer.de/universal-feed',
          title: 'official',
          category: 'official_manufacturer',
        },
        {
          url: 'https://example-manufacturer.de/universal-feed.pdf',
          title: 'pdf',
          category: 'official_document',
        },
        ...Array.from({ length: 5 }, (_entry, index) => ({
          url: `https://shop-${index}.example/universal-feed`,
          title: `shop-${index}`,
          category: 'retailer' as const,
        })),
      ],
      'example-manufacturer.de',
    )

    expect(countOfficialSearchResults(candidates)).toBeGreaterThan(0)
    expect(candidates.filter((candidate) => candidate.category === 'retailer').length).toBeLessThanOrEqual(2)
  })

  it('returns timeout outcome from structured research attempt', async () => {
    const provider: FertilizerManufacturerStructuredResearchProvider = {
      runStructuredWebResearch: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return null
      },
    }

    const result = await runManufacturerStructuredResearchAttempt({
      structuredResearchProvider: provider,
      identity: IDENTITY,
      queries: ['Example Manufacturer Universal Feed'],
      manufacturerDomain: 'example-manufacturer.de',
      timeoutMs: 5,
    })

    expect(result.outcome).toBe('timeout')
  })

  it('returns no_results when configured structured provider finds nothing', async () => {
    const result = await runManufacturerStructuredResearchAttempt({
      structuredResearchProvider: {
        runStructuredWebResearch: async () => null,
      },
      identity: IDENTITY,
      queries: ['Example Manufacturer Universal Feed'],
      manufacturerDomain: 'example-manufacturer.de',
    })

    expect(result.outcome).toBe('no_results')
  })
})

describe('runAutomaticManufacturerResearch structured integration', () => {
  it('uses structured research for official HTML without direct fetch', async () => {
    const officialUrl = 'https://example-manufacturer.de/universal-feed'

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: {
        runStructuredWebResearch: async () => ({
          record: buildStructuredRecord(officialUrl),
          webSearchToolCallObserved: true,
        }),
      },
      fetchProvider: {
        fetchSource: async () => ({ ok: false, errorCode: 'source_not_found', retryable: false }),
      },
      runtime: { logTiming: false },
    })

    expect(result.diagnostics.searchProviderConfigured).toBe(true)
    expect(result.diagnostics.searchProviderAttempted).toBe(true)
    expect(result.diagnostics.searchProviderOutcome).toBe('success')
    expect(result.diagnostics.researchSourceStrategy).toBe('structured_web_research')
    expect(result.diagnostics.officialSearchResultCount).toBeGreaterThan(0)
    expect(result.adapterResult?.status).toBe('success')
  })

  it('accepts structured PDF sources without direct fetch', async () => {
    const pdfUrl = 'https://example-manufacturer.de/universal-feed.pdf'

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: {
        runStructuredWebResearch: async () => ({
          record: buildStructuredRecord(pdfUrl),
          webSearchToolCallObserved: true,
        }),
      },
      fetchProvider: {
        fetchSource: async () => ({ ok: false, errorCode: 'source_not_found', retryable: false }),
      },
      runtime: { logTiming: false },
    })

    expect(result.diagnostics.searchResultCount).toBe(1)
    expect(result.diagnostics.officialDeclarationFound).toBe(true)
  })

  it('falls back to direct candidates when structured research returns no results', async () => {
    let fetchCount = 0

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: {
        runStructuredWebResearch: async () => null,
      },
      fetchProvider: {
        fetchSource: async () => {
          fetchCount += 1
          return { ok: false, errorCode: 'source_not_found', retryable: false }
        },
      },
      runtime: { logTiming: false },
    })

    expect(result.diagnostics.searchProviderOutcome).toBe('no_results')
    expect(result.diagnostics.researchSourceStrategy).toBe('structured_then_direct_fallback')
    expect(fetchCount).toBeGreaterThan(0)
    expect(result.adapterResult).toBeNull()
  })

  it('finds a source via structured research without direct URL pattern guessing', async () => {
    const discoveredUrl = 'https://example-manufacturer.de/produkte/universal-feed-special'

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: {
        runStructuredWebResearch: async () => ({
          record: buildStructuredRecord(discoveredUrl),
          webSearchToolCallObserved: true,
        }),
      },
      fetchProvider: {
        fetchSource: async () => ({ ok: false, errorCode: 'source_not_found', retryable: false }),
      },
      runtime: { logTiming: false },
    })

    expect(result.diagnostics.researchSourceStrategy).toBe('structured_web_research')
    expect(result.diagnostics.officialSourceFetchedCount).toBe(0)
    expect(result.adapterResult?.status).toBe('success')
  })

  it('keeps direct-only strategy without configured structured provider', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      fetchProvider: {
        fetchSource: async () => ({ ok: false, errorCode: 'source_not_found', retryable: false }),
      },
      runtime: { logTiming: false },
    })

    expect(result.diagnostics.searchProviderConfigured).toBe(false)
    expect(result.diagnostics.searchProviderOutcome).toBe('not_configured')
    expect(result.diagnostics.researchSourceStrategy).toBe('direct_candidates_only')
  })

  it('returns controlled needs_input diagnostics when no source is found', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: {
        runStructuredWebResearch: async () => null,
      },
      fetchProvider: {
        fetchSource: async () => ({ ok: false, errorCode: 'source_not_found', retryable: false }),
      },
      runtime: { logTiming: false },
    })

    expect(result.adapterResult).toBeNull()
    expect(result.diagnostics.fallbackRecommendation).toBe('retry_search')
    expect(result.diagnostics.officialDeclarationFound).toBe(false)
  })

  it('stays within the configured research budget in a fallback-heavy worst case', async () => {
    let currentTime = 0

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: {
        runStructuredWebResearch: async () => {
          currentTime += 500
          return null
        },
      },
      fetchProvider: {
        fetchSource: async (_url, options) => {
          const waitMs = options?.timeoutMs ?? 400
          currentTime += waitMs
          return { ok: false, errorCode: 'timeout', retryable: true }
        },
      },
      runtime: {
        now: () => currentTime,
        totalBudgetMs: 1200,
        perFetchTimeoutMs: 400,
        maxParallelFetches: 3,
        logTiming: false,
      },
    })

    expect(result.diagnostics.manufacturerResearchTiming?.totalResearchMs).toBeLessThanOrEqual(1200)
    expect(result.diagnostics.manufacturerResearchTiming?.totalResearchMs).toBeLessThanOrEqual(
      MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS + 100,
    )
  })
})
