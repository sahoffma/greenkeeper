import { describe, expect, it } from 'vitest'
import {
  isInvalidResearchCandidateUrl,
  limitOfficialResearchCandidates,
  resolvePerFetchTimeoutMs,
  resolveResearchFetchSourceKind,
  resolveResearchFetchSourcePriority,
} from './fertilizerManufacturerResearchTimingCore'

describe('fertilizerManufacturerResearchTimingCore', () => {
  it('prioritizes hinted URLs when limiting candidates', () => {
    const candidates = [
      { url: 'https://example.de/a', category: 'official_manufacturer' },
      { url: 'https://example.de/b', category: 'official_manufacturer' },
      { url: 'https://example.de/hinted', category: 'official_manufacturer' },
    ]

    expect(
      limitOfficialResearchCandidates({
        candidates,
        hintedUrls: ['https://example.de/hinted'],
        maxCandidates: 2,
      }).map((candidate) => candidate.url),
    ).toEqual(['https://example.de/hinted', 'https://example.de/a'])
  })

  it('detects invalid research URLs before fetch', () => {
    expect(isInvalidResearchCandidateUrl('not-a-valid-url')).toBe(true)
    expect(isInvalidResearchCandidateUrl('https://example.de/product')).toBe(false)
  })

  it('caps per-fetch timeout by remaining budget', () => {
    expect(resolvePerFetchTimeoutMs(1000, 5000, 4000, 4200)).toBe(1800)
    expect(resolvePerFetchTimeoutMs(1000, 5000, 4000, 6000)).toBe(0)
  })

  it('classifies source kind and priority without exposing URLs in helpers', () => {
    expect(
      resolveResearchFetchSourceKind({ url: 'https://example.de/doc.pdf' }, 'application/pdf'),
    ).toBe('pdf')
    expect(
      resolveResearchFetchSourcePriority(
        { url: 'https://example.de/doc.pdf', category: 'official_document' },
        false,
      ),
    ).toBe('official_document')
    expect(
      resolveResearchFetchSourcePriority(
        { url: 'https://example.de/product', category: 'official_manufacturer' },
        true,
      ),
    ).toBe('search_result')
  })
})
