import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchExternalManufacturerDocument } from './fertilizerEnrichmentHttpManufacturerFetchCore'
import { parseFertilizerManufacturerDocumentText } from './fertilizerManufacturerDocumentParserCore'
import { resolveManufacturerDomain } from './fertilizerManufacturerDomainCore'
import {
  buildDefaultOfficialSourceCandidates,
  runAutomaticManufacturerResearch,
} from './fertilizerManufacturerResearchCore'
import { buildOfficialSourceUrlCandidates } from './fertilizerManufacturerResearchQueryCore'
import { buildStructuredResearchProviderResultFromRecord } from './fertilizerManufacturerStructuredResearchCore'
import {
  limitOfficialResearchCandidates,
  MANUFACTURER_RESEARCH_MAX_OFFICIAL_CANDIDATES,
  MANUFACTURER_RESEARCH_PER_FETCH_TIMEOUT_MS,
  MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS,
} from './fertilizerManufacturerResearchTimingCore'

const OFFICIAL_URL = 'https://www.example-manufacturer.de/duenger/stress-manager'

const IDENTITY = {
  manufacturer: 'Example Manufacturer GmbH',
  officialName: 'Stress-Manager',
  productLine: 'Professional',
  variant: '0-0-30',
  identityFingerprint: 'fp',
  identityConfidence: 1,
  hasIdentityAmbiguity: false,
} as const

function fullDeclarationText(): string {
  return `Manufacturer: Example Manufacturer
Product: Stress-Manager
Form: Granular
NPK 0-0-30
Declaration basis (N / P2O5 / K2O)
Nitrogen (N): 0%
Phosphate (P2O5): 0%
Potash (K2O): 30%
Zusammensetzung: 30 % Kaliumoxid (K2O), 10,2 % Schwefel (S), 3,0 % Eisen (Fe)
Magnesium (MgO): 0%
Calcium (CaO): 0%
Declaration section complete`
}

const failingStructuredProvider = {
  runStructuredWebResearch: async () => null,
}

function createSuccessfulStructuredProvider(sourceUrl: string = OFFICIAL_URL) {
  return {
    runStructuredWebResearch: async () =>
      buildStructuredResearchProviderResultFromRecord({
        record: {
          manufacturer: 'Example Manufacturer GmbH',
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
              url: sourceUrl,
              title: 'Professional Stress-Manager 0-0-30',
              category: 'official_manufacturer',
              sourceIdentity: {
                manufacturer: 'Example Manufacturer GmbH',
                productLine: 'Professional',
                productName: 'Stress-Manager',
                npkLabel: '0-0-30',
              },
            },
          ],
        },
        identity: IDENTITY,
        npkLabel: '0-0-30',
        manufacturerDomain: 'example-manufacturer.de',
      }),
  }
}

function createDeclarationFetchProvider(sourceUrl: string = OFFICIAL_URL) {
  return {
    fetchSource: async (url: string) => {
      if (url === sourceUrl) {
        return {
          ok: true as const,
          finalUrl: sourceUrl,
          contentType: 'text/plain',
          text: fullDeclarationText(),
          retrievedAt: '2026-07-29T10:00:00.000Z',
          statusCode: 200,
        }
      }

      return { ok: false as const, errorCode: 'source_not_found' as const, retryable: false }
    },
  }
}

describe('fertilizerManufacturerResearchCore', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('classifies HTML fetched through the HTTP manufacturer fetch layer', async () => {
    const html = `<html><body>${fullDeclarationText()}</body></html>`

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        ok: true,
        url: OFFICIAL_URL,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === 'content-type' ? 'text/html; charset=utf-8' : null,
        },
        arrayBuffer: async () => new TextEncoder().encode(html).buffer,
      })),
    )

    const fetched = await fetchExternalManufacturerDocument(OFFICIAL_URL, { timeoutMs: 1000 })
    expect(fetched.ok).toBe(true)
    if (!fetched.ok || !fetched.text) {
      throw new Error('expected fetched text')
    }

    const parsed = parseFertilizerManufacturerDocumentText(fetched.text, IDENTITY)
    expect(parsed.classification).not.toBe('no_match')
  })

  it('parses a matching official HTML source into an adapter result', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: createSuccessfulStructuredProvider(),
      fetchProvider: createDeclarationFetchProvider(),
      runtime: { logTiming: false, maxParallelFetches: 1 },
    })

    expect(result.adapterResult?.status).toMatch(/success|partial/)
    expect(result.diagnostics.declaredPositiveNutrientCount).toBeGreaterThan(0)
  })

  it('limits generated official candidates without a search provider', () => {
    const domain = resolveManufacturerDomain(IDENTITY.manufacturer)
    const generatedCount = buildOfficialSourceUrlCandidates({
      identity: IDENTITY,
      manufacturerDomain: domain,
    }).length

    expect(generatedCount).toBeGreaterThan(MANUFACTURER_RESEARCH_MAX_OFFICIAL_CANDIDATES)

    const limited = buildDefaultOfficialSourceCandidates({
      identity: IDENTITY,
      manufacturerDomain: domain,
    })

    const capped = limitOfficialResearchCandidates({
      candidates: limited,
      hintedUrls: [],
      maxCandidates: MANUFACTURER_RESEARCH_MAX_OFFICIAL_CANDIDATES,
    })

    expect(capped.length).toBe(MANUFACTURER_RESEARCH_MAX_OFFICIAL_CANDIDATES)
  })

  it('does not slug-guess additional URLs after canonical fetch succeeds', async () => {
    let fetchCount = 0

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: createSuccessfulStructuredProvider(),
      fetchProvider: {
        fetchSource: async (url) => {
          fetchCount += 1
          return {
            ok: true,
            finalUrl: url,
            contentType: 'text/plain',
            text: fullDeclarationText(),
            retrievedAt: '2026-07-29T10:00:00.000Z',
            statusCode: 200,
          }
        },
      },
      runtime: { logTiming: false, maxParallelFetches: 1 },
    })

    expect(result.adapterResult?.status).toBe('success')
    expect(fetchCount).toBeGreaterThan(0)
    expect(fetchCount).toBeLessThanOrEqual(2)
  })

  it('does not exceed the overall research budget in a worst-case timeout scenario', async () => {
    let currentTime = 0

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: failingStructuredProvider,
      fetchProvider: {
        fetchSource: async (_url, options) => {
          const waitMs = options?.timeoutMs ?? MANUFACTURER_RESEARCH_PER_FETCH_TIMEOUT_MS
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
    expect(result.adapterResult).toBeNull()
  })

  it('returns null adapter without throwing when structured research finds no canonical source', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: failingStructuredProvider,
      fetchProvider: {
        fetchSource: async () => {
          throw new Error('fetch should not be called without canonical candidate')
        },
      },
      runtime: { logTiming: false },
    })

    expect(result.adapterResult).toBeNull()
    expect(result.diagnostics.researchFailureStage).toBe('structured_research_no_source')
  })

  it('bounds PDF fetch duration through per-fetch timeout options', async () => {
    vi.useFakeTimers()

    vi.stubGlobal(
      'fetch',
      vi.fn((_url, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
        }),
      ),
    )

    const promise = fetchExternalManufacturerDocument(`${OFFICIAL_URL}.pdf`, { timeoutMs: 50 })
    await vi.advanceTimersByTimeAsync(50)
    const result = await promise

    expect(result).toEqual({ ok: false, errorCode: 'timeout', retryable: true })
    vi.useRealTimers()
  })

  it('returns no adapter when no structured provider is configured', async () => {
    let fetchCount = 0

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      fetchProvider: {
        fetchSource: async () => {
          fetchCount += 1
          return { ok: false, errorCode: 'source_not_found', retryable: false }
        },
      },
      runtime: { logTiming: false },
    })

    expect(result.diagnostics.manufacturerSearchAttempted).toBe(true)
    expect(result.diagnostics.manufacturerResearchTiming?.searchProviderMs).toBe(0)
    expect(fetchCount).toBe(0)
    expect(result.adapterResult).toBeNull()
  })

  it('returns intake-ready success diagnostics when a full declaration is found', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: createSuccessfulStructuredProvider(),
      fetchProvider: createDeclarationFetchProvider(),
      runtime: { logTiming: false, maxParallelFetches: 1 },
    })

    expect(result.adapterResult?.status).toBe('success')
    expect(result.diagnostics.researchFailureStage).toBe('none')
  })

  it('returns controlled structured_research_no_source diagnostics when canonical verification fails', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      structuredResearchProvider: failingStructuredProvider,
      fetchProvider: {
        fetchSource: async () => ({ ok: false, errorCode: 'source_not_found', retryable: false }),
      },
      runtime: { logTiming: false },
    })

    expect(result.adapterResult).toBeNull()
    expect(result.diagnostics.researchFailureStage).toBe('structured_research_no_source')
    expect(result.diagnostics.manufacturerResearchTiming?.totalResearchMs).toBeLessThan(
      MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS + 100,
    )
  })
})
