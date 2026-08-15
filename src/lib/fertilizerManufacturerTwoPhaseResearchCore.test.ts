import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import {
  manufacturerProductResolutionSchema,
  manufacturerProductResolutionSchemaHasNutrientMatrix,
  parseManufacturerProductResolutionRecord,
} from './fertilizerManufacturerProductResolutionCore'
import {
  enrichManufacturerSearchCandidatesWithFetchedEvidence,
  verifyNutrientValuePresentInSourceText,
} from './fertilizerManufacturerSearchCandidateEvidenceCore'
import {
  extractManufacturerDeclarationFromCanonicalSource,
  phaseBExtractionUsesOnlyCanonicalSource,
} from './fertilizerManufacturerDeclarationExtractionCore'
import {
  scoreManufacturerSearchCandidates,
  selectCanonicalManufacturerSearchCandidate,
  type ManufacturerSearchCandidate,
} from './fertilizerManufacturerSearchCandidateCore'

const IDENTITY: FertilizerEnrichmentIdentity = {
  manufacturer: 'Rasendoktor GmbH',
  officialName: 'Stress-Manager',
  productLine: 'Professional',
  variant: '0-0-30',
  identityFingerprint: 'fp',
  identityConfidence: 1,
  hasIdentityAmbiguity: false,
}

const PROFESSIONAL_URL =
  'https://www.rasendoktor.de/duenger/rasenduenger/kalium-rasenduenger-mit-spurennaehrstoffen/'
const STANDARD_URL =
  'https://www.rasendoktor.de/duenger/rasenduenger/kalium-spezial-rasenduenger-stressmanager/'

const PROFESSIONAL_BODY = `<html><body>
  <h1>Rasendoktor Professional Kalium-Spezialdünger + Spurennährstoffe</h1>
  <p>NPK 0-0-30</p>
  <p>Zusammensetzung: 30 % Kaliumoxid (K2O), 10,2 % Schwefel (S), 0,1 % Kupfer (Cu), 3,0 % Eisen (Fe), 0,1 % Mangan (Mn), 0,1 % Zink (Zn)</p>
</body></html>`

const STANDARD_BODY = `<html><body>
  <h1>Kalium Spezial-Rasendünger Stressmanager</h1>
  <p>NPK 0-0-22</p>
  <p>Zusammensetzung: 22 % wasserlösliches Kaliumoxid (K), 6,6 % wasserlösliches Calciumoxid (CaO), 11 % wasserlösliches Magnesiumoxid (MgO), 16,4 % wasserlöslicher Schwefel (S)</p>
</body></html>`

function candidate(input: Partial<ManufacturerSearchCandidate> & Pick<ManufacturerSearchCandidate, 'url'>): ManufacturerSearchCandidate {
  const { url, ...rest } = input
  return {
    candidateId: url,
    url,
    title: rest.title ?? url,
    trustedEvidenceText: rest.trustedEvidenceText ?? url,
    trustedEvidenceKinds: rest.trustedEvidenceKinds ?? ['web_search_source_url'],
    domain: 'rasendoktor.de',
    officialDomainMatch: true,
    citationVerified: false,
    manufacturerEvidence: 'unknown',
    productNameEvidence: 'unknown',
    productLineEvidence: 'unknown',
    npkEvidence: 'unknown',
    identityScore: 0,
    hardRejected: false,
    rejectionReason: null,
    ...rest,
  }
}

describe('two-phase manufacturer research cores', () => {
  it('phase A schema does not include nutrientMatrix', () => {
    expect(manufacturerProductResolutionSchemaHasNutrientMatrix(manufacturerProductResolutionSchema)).toBe(
      false,
    )
  })

  it('rejects standard 0-0-22 and accepts professional 0-0-30 after fetched body enrichment', async () => {
    const fetchProvider = {
      fetchSource: async (url: string) => {
        if (url.includes('spurennaehrstoffen')) {
          return {
            ok: true as const,
            finalUrl: url,
            text: PROFESSIONAL_BODY,
            contentType: 'text/html',
            retrievedAt: '2026-01-01T00:00:00.000Z',
            statusCode: 200,
          }
        }
        if (url.includes('stressmanager')) {
          return {
            ok: true as const,
            finalUrl: url,
            text: STANDARD_BODY,
            contentType: 'text/html',
            retrievedAt: '2026-01-01T00:00:00.000Z',
            statusCode: 200,
          }
        }
        return { ok: false as const, errorCode: 'source_not_found' as const, retryable: false }
      },
    }

    const enriched = await enrichManufacturerSearchCandidatesWithFetchedEvidence({
      candidates: [
        candidate({ url: PROFESSIONAL_URL, trustedEvidenceText: PROFESSIONAL_URL }),
        candidate({ url: STANDARD_URL, trustedEvidenceText: STANDARD_URL }),
      ],
      identity: IDENTITY,
      npkLabel: '0-0-30',
      fetchProvider,
    })

    const selection = selectCanonicalManufacturerSearchCandidate({
      candidates: enriched,
      identity: IDENTITY,
      npkLabel: '0-0-30',
    })

    expect(selection.canonicalCandidate?.url).toBe(PROFESSIONAL_URL)
    expect(
      selection.candidates.find((entry) => entry.url === STANDARD_URL)?.hardRejected,
    ).toBe(true)
  })

  it('extracts declaration only from canonical professional body and accepts sulfur 10.2', () => {
    const extraction = extractManufacturerDeclarationFromCanonicalSource({
      sourceText: PROFESSIONAL_BODY,
      sourceUrl: PROFESSIONAL_URL,
      sourceTitle: 'Professional Stress Manager',
      identity: IDENTITY,
      npkLabel: '0-0-30',
    })

    expect(extraction).not.toBeNull()
    expect(
      phaseBExtractionUsesOnlyCanonicalSource({
        record: extraction!.record,
        canonicalUrl: PROFESSIONAL_URL,
      }),
    ).toBe(true)
    expect(extraction!.record.nutrientMatrix.sulfur).toBe(10.2)
    expect(verifyNutrientValuePresentInSourceText({
      sourceText: PROFESSIONAL_BODY,
      nutrientKey: 'sulfur',
      value: 10.2,
    })).toBe(true)
    expect(verifyNutrientValuePresentInSourceText({
      sourceText: PROFESSIONAL_BODY,
      nutrientKey: 'sulfur',
      value: 16.4,
    })).toBe(false)
  })

  it('parses phase A resolution without nutrient matrix fields', () => {
    const parsed = parseManufacturerProductResolutionRecord({
      manufacturer: 'Rasendoktor GmbH',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      productForm: 'granular',
      npk: { nitrogen: 0, phosphate: 0, potash: 30 },
      identityMatch: true,
      confidence: 0.9,
      sources: [
        {
          url: PROFESSIONAL_URL,
          title: 'Professional Stress Manager',
          category: 'official_manufacturer',
          sourceIdentity: {
            manufacturer: 'Rasendoktor GmbH',
            productLine: 'Professional',
            productName: 'Stress-Manager',
            npkLabel: '0-0-30',
          },
        },
      ],
    })

    expect(parsed).not.toBeNull()
    expect('nutrientMatrix' in (parsed ?? {})).toBe(false)
  })

  it('accepts canonical source when tracking query params are stripped', () => {
    const extraction = extractManufacturerDeclarationFromCanonicalSource({
      sourceText: PROFESSIONAL_BODY,
      sourceUrl: `${PROFESSIONAL_URL}?awc=123&utm_source=openai`,
      sourceTitle: 'Professional Stress Manager',
      identity: IDENTITY,
      npkLabel: '0-0-30',
    })

    expect(extraction).not.toBeNull()
    expect(
      phaseBExtractionUsesOnlyCanonicalSource({
        record: extraction!.record,
        canonicalUrl: `${PROFESSIONAL_URL}?awc=123&utm_source=openai`,
      }),
    ).toBe(true)
  })

  it('hard rejects standard fetched body with npk mismatch during scoring', () => {
    const scored = scoreManufacturerSearchCandidates({
      candidates: [
        candidate({
          url: STANDARD_URL,
          trustedEvidenceText: `${STANDARD_URL} ${STANDARD_BODY}`,
          trustedEvidenceKinds: ['web_search_source_url'],
        }),
      ],
      identity: IDENTITY,
      npkLabel: '0-0-30',
    })

    expect(scored[0]?.hardRejected).toBe(true)
    expect(scored[0]?.rejectionReason).toBe('npk_mismatch')
  })
})
