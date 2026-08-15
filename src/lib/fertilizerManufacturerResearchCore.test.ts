import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchExternalManufacturerDocument } from './fertilizerEnrichmentHttpManufacturerFetchCore'
import { parseFertilizerManufacturerDocumentText } from './fertilizerManufacturerDocumentParserCore'
import { resolveManufacturerDomain } from './fertilizerManufacturerDomainCore'
import {
  buildDefaultOfficialSourceCandidates,
  runAutomaticManufacturerResearch,
} from './fertilizerManufacturerResearchCore'
import { buildOfficialSourceUrlCandidates } from './fertilizerManufacturerResearchQueryCore'
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
      hintedUrls: [OFFICIAL_URL],
      structuredResearchProvider: failingStructuredProvider,
      fetchProvider: {
        fetchSource: async () => ({
          ok: true,
          finalUrl: OFFICIAL_URL,
          contentType: 'text/plain',
          text: fullDeclarationText(),
          retrievedAt: '2026-07-29T10:00:00.000Z',
          statusCode: 200,
        }),
      },
      runtime: { logTiming: false, maxParallelFetches: 1 },
    })

    expect(result.adapterResult?.status).toMatch(/success|partial/)
    expect(result.diagnostics.declaredPositiveNutrientCount).toBeGreaterThan(0)
    expect(result.diagnostics.manufacturerResearchTiming?.stoppedAfterSuccessfulOfficialSource).toBe(
      result.adapterResult?.status === 'success',
    )
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

  it('continues with the next candidate after a slow fetch times out', async () => {
    let currentTime = 0
    const fetchCalls: number[] = []

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      hintedUrls: ['https://example.de/slow', OFFICIAL_URL],
      structuredResearchProvider: failingStructuredProvider,
      fetchProvider: {
        fetchSource: async (url, options) => {
          fetchCalls.push(currentTime)
          if (url.includes('/slow')) {
            await new Promise((resolve) => setTimeout(resolve, (options?.timeoutMs ?? 0) + 10))
            currentTime += (options?.timeoutMs ?? 0) + 10
            return { ok: false, errorCode: 'timeout', retryable: true }
          }

          currentTime += 50
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
      runtime: {
        now: () => currentTime,
        perFetchTimeoutMs: 100,
        totalBudgetMs: 5000,
        maxParallelFetches: 1,
        logTiming: false,
      },
    })

    expect(fetchCalls.length).toBeGreaterThanOrEqual(2)
    expect(result.adapterResult?.status).toMatch(/success|partial/)
    expect(result.diagnostics.manufacturerResearchTiming?.fetchTimeoutCount).toBeGreaterThanOrEqual(1)
  })

  it('stops further fetches after a successful official declaration is found', async () => {
    let fetchCount = 0

    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      hintedUrls: [OFFICIAL_URL, 'https://example.de/second', 'https://example.de/third'],
      structuredResearchProvider: failingStructuredProvider,
      fetchProvider: {
        fetchSource: async () => {
          fetchCount += 1
          return {
            ok: true,
            finalUrl: OFFICIAL_URL,
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
    expect(result.diagnostics.manufacturerResearchTiming?.stoppedAfterSuccessfulOfficialSource).toBe(true)
    expect(fetchCount).toBe(1)
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

  it('maps invalid URL candidates to invalid_url without throwing', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      hintedUrls: ['not-a-valid-url'],
      structuredResearchProvider: failingStructuredProvider,
      fetchProvider: {
        fetchSource: async () => {
          throw new Error('fetch should not be called for invalid url')
        },
      },
      runtime: { logTiming: false },
    })

    expect(result.adapterResult).toBeNull()
    expect(result.diagnostics.manufacturerResearchTiming?.fetchAttempts[0]?.outcome).toBe('invalid_url')
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

  it('runs a controlled path when no search provider is configured', async () => {
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
    expect(result.diagnostics.officialSourceCandidateCount).toBeLessThanOrEqual(
      MANUFACTURER_RESEARCH_MAX_OFFICIAL_CANDIDATES,
    )
    expect(fetchCount).toBeGreaterThan(0)
    expect(result.adapterResult).toBeNull()
  })

  it('returns intake-ready success diagnostics when a full declaration is found', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      hintedUrls: [OFFICIAL_URL],
      structuredResearchProvider: failingStructuredProvider,
      fetchProvider: {
        fetchSource: async () => ({
          ok: true,
          finalUrl: OFFICIAL_URL,
          contentType: 'text/plain',
          text: fullDeclarationText(),
          retrievedAt: '2026-07-29T10:00:00.000Z',
          statusCode: 200,
        }),
      },
      runtime: { logTiming: false, maxParallelFetches: 1 },
    })

    expect(result.adapterResult?.status).toBe('success')
    expect(result.diagnostics.researchFailureStage).toBe('none')
  })

  it('returns controlled fetch_failed diagnostics instead of throwing when no source matches', async () => {
    const result = await runAutomaticManufacturerResearch({
      identity: IDENTITY,
      hintedUrls: [OFFICIAL_URL],
      structuredResearchProvider: failingStructuredProvider,
      fetchProvider: {
        fetchSource: async () => ({ ok: false, errorCode: 'source_not_found', retryable: false }),
      },
      runtime: { logTiming: false },
    })

    expect(result.adapterResult).toBeNull()
    expect(result.diagnostics.researchFailureStage).toBe('fetch_failed')
    expect(result.diagnostics.manufacturerResearchTiming?.totalResearchMs).toBeLessThan(
      MANUFACTURER_RESEARCH_TOTAL_BUDGET_MS + 100,
    )
  })
})
