import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchExternalManufacturerDocument } from './fertilizerEnrichmentHttpManufacturerFetchCore'
import { parseFertilizerManufacturerDocumentText } from './fertilizerManufacturerDocumentParserCore'
import { runAutomaticManufacturerResearch } from './fertilizerManufacturerResearchCore'

const OFFICIAL_URL = 'https://www.rasendoktor.de/duenger/stress-manager'

describe('fertilizerManufacturerResearchCore', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('classifies HTML fetched through the HTTP manufacturer fetch layer', async () => {
    const html = `<html><body>Manufacturer: Rasendoktor
Product: Stress-Manager
Form: Granular
NPK 0-0-30
Declaration basis (N / P2O5 / K2O)
Nitrogen (N): 0%
Phosphate (P2O5): 0%
Potash (K2O): 30%
Zusammensetzung: 30 % Kaliumoxid (K2O), 10,2 % Schwefel (S), 3,0 % Eisen (Fe)
Declaration section complete</body></html>`

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

    const fetched = await fetchExternalManufacturerDocument(OFFICIAL_URL)
    expect(fetched.ok).toBe(true)
    if (!fetched.ok || !fetched.text) {
      throw new Error('expected fetched text')
    }

    const parsed = parseFertilizerManufacturerDocumentText(fetched.text, {
      manufacturer: 'Rasendoktor',
      officialName: 'Stress-Manager',
      productLine: 'Professional',
      variant: '0-0-30',
      identityFingerprint: 'fp',
      identityConfidence: 1,
      hasIdentityAmbiguity: false,
    })

    expect(parsed.classification).not.toBe('no_match')
  })

  it('parses a matching official HTML source into an adapter result', async () => {
    const html = `Stress Manager
Manufacturer: Rasendoktor
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

    const result = await runAutomaticManufacturerResearch({
      identity: {
        manufacturer: 'Rasendoktor',
        officialName: 'Stress-Manager',
        productLine: 'Professional',
        variant: '0-0-30',
        identityFingerprint: 'fp',
        identityConfidence: 1,
        hasIdentityAmbiguity: false,
      },
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
      fetchProvider: {
        fetchSource: async () => ({
          ok: true,
          finalUrl: OFFICIAL_URL,
          contentType: 'text/plain',
          text: html,
          retrievedAt: '2026-07-29T10:00:00.000Z',
          statusCode: 200,
        }),
      },
    })

    expect(result.adapterResult?.status).toMatch(/success|partial/)
    expect(result.diagnostics.declaredPositiveNutrientCount).toBeGreaterThan(0)
  })
})
