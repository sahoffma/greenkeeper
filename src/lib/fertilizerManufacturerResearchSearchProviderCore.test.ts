import { describe, expect, it } from 'vitest'
import {
  buildManufacturerResearchWebSearchPrompt,
  computeSearchCandidatePriority,
  countOfficialSearchResults,
  mapSearchSourcesToCandidates,
  parseManufacturerResearchWebSearchSources,
  rankDiscoveredSearchCandidates,
  runManufacturerResearchSearchAttempt,
} from './fertilizerManufacturerResearchSearchProviderCore'
import { runAutomaticManufacturerResearch } from './fertilizerManufacturerResearchCore'
import { MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS } from './fertilizerManufacturerResearchTimingCore'
import type { FertilizerManufacturerResearchSearchProvider } from './fertilizerManufacturerResearchCore'

const IDENTITY = {
  manufacturer: 'Example Manufacturer GmbH',
  officialName: 'Universal Feed',
  productLine: 'Professional',
  variant: '10-5-20',
  identityFingerprint: 'fp',
  identityConfidence: 1,
  hasIdentityAmbiguity: false,
} as const

function fullDeclarationText(): string {
  return `Manufacturer: Example Manufacturer
Product: Universal Feed
Form: Granular
NPK 10-5-20
Declaration basis (N / P2O5 / K2O)
Nitrogen (N): 10%
Phosphate (P2O5): 5%
Potash (K2O): 20%
Zusammensetzung: 10 % Stickstoff (N), 5 % Phosphat (P2O5), 20 % Kalium (K2O)
Declaration section complete`
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

  it('returns timeout outcome from search attempt', async () => {
    const provider: FertilizerManufacturerResearchSearchProvider = {
      discoverOfficialSources: async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return []
      },
    }

    const result = await runManufacturerResearchSearchAttempt({
      searchProvider: provider,
      identity: IDENTITY,
      queries: ['Example Manufacturer Universal Feed'],
      manufacturerDomain: 'example-manufacturer.de',
      urlCandidates: [],
      timeoutMs: 5,
    })

    expect(result.outcome).toBe('timeout')
  })

  it('returns no_results when configured provider finds nothing', async () => {
    const result = await runManufacturerResearchSearchAttempt({
      searchProvider: {
        discoverOfficialSources: async () => [],
      },
      identity: IDENTITY,
      queries: ['Example Manufacturer Universal Feed'],
      manufacturerDomain: 'example-manufacturer.de',
      urlCandidates: [],
    })

    expect(result.outcome).toBe('no_results')
  })
})

describe('runAutomaticManufacturerResearch search integration', () => {
  it('uses configured search results for official HTML', async () => {
    const officialUrl = 'https://example-manufacturer.de/universal-feed'

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      searchProvider: {
        discoverOfficialSources: async () => [
          {
            url: officialUrl,
            title: officialUrl,
            category: 'official_manufacturer',
            priority: 6,
          },
        ],
      },
      fetchProvider: {
        fetchSource: async () => ({
          ok: true,
          finalUrl: officialUrl,
          contentType: 'text/plain',
          text: fullDeclarationText(),
          retrievedAt: '2026-07-29T10:00:00.000Z',
          statusCode: 200,
        }),
      },
      runtime: { logTiming: false },
    })

    expect(result.diagnostics.searchProviderConfigured).toBe(true)
    expect(result.diagnostics.searchProviderAttempted).toBe(true)
    expect(result.diagnostics.searchProviderOutcome).toBe('success')
    expect(result.diagnostics.researchSourceStrategy).toBe('search_only')
    expect(result.diagnostics.officialSearchResultCount).toBeGreaterThan(0)
    expect(result.adapterResult?.status).toBe('success')
  })

  it('fetches official PDF search results', async () => {
    const pdfUrl = 'https://example-manufacturer.de/universal-feed.pdf'

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      searchProvider: {
        discoverOfficialSources: async () => [
          {
            url: pdfUrl,
            title: pdfUrl,
            category: 'official_document',
            priority: 6,
          },
        ],
      },
      fetchProvider: {
        fetchSource: async () => ({
          ok: true,
          finalUrl: pdfUrl,
          contentType: 'application/pdf',
          text: fullDeclarationText(),
          retrievedAt: '2026-07-29T10:00:00.000Z',
          statusCode: 200,
        }),
      },
      runtime: { logTiming: false },
    })

    expect(result.diagnostics.searchResultCount).toBe(1)
    expect(result.diagnostics.officialDeclarationFound).toBe(true)
  })

  it('falls back to direct candidates when search returns no results', async () => {
    let fetchCount = 0

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      searchProvider: {
        discoverOfficialSources: async () => [],
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
    expect(result.diagnostics.researchSourceStrategy).toBe('search_then_direct')
    expect(fetchCount).toBeGreaterThan(0)
    expect(result.adapterResult).toBeNull()
  })

  it('finds a source via search when direct URL patterns would fail first', async () => {
    const discoveredUrl = 'https://example-manufacturer.de/produkte/universal-feed-special'

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      searchProvider: {
        discoverOfficialSources: async () => [
          {
            url: discoveredUrl,
            title: discoveredUrl,
            category: 'official_manufacturer',
            priority: 6,
          },
        ],
      },
      fetchProvider: {
        fetchSource: async (url) => {
          if (url === discoveredUrl) {
            return {
              ok: true,
              finalUrl: url,
              contentType: 'text/plain',
              text: fullDeclarationText(),
              retrievedAt: '2026-07-29T10:00:00.000Z',
              statusCode: 200,
            }
          }

          return { ok: false, errorCode: 'source_not_found', retryable: false }
        },
      },
      runtime: { logTiming: false },
    })

    expect(result.diagnostics.researchSourceStrategy).toBe('search_only')
    expect(result.diagnostics.officialSearchResultFetchedCount).toBe(1)
    expect(result.adapterResult?.status).toBe('success')
  })

  it('keeps direct-only strategy without configured search provider', async () => {
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
      searchProvider: {
        discoverOfficialSources: async () => [],
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

  it('stays within the configured research budget in a search-heavy worst case', async () => {
    let currentTime = 0

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      searchProvider: {
        discoverOfficialSources: async (_input) => {
          currentTime += 500
          return Array.from({ length: 8 }, (_entry, index) => ({
            url: `https://example-manufacturer.de/candidate-${index}`,
            title: `candidate-${index}`,
            category: 'official_manufacturer' as const,
            priority: 6,
          }))
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
