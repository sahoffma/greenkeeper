import { describe, expect, it } from 'vitest'
import { buildProductUserTrustDisplay } from './productDisplayTrust'

describe('buildProductUserTrustDisplay', () => {
  it('zeigt verifiziert ohne Prozentwerte', () => {
    const display = buildProductUserTrustDisplay({
      verificationStatus: 'verified',
      verifiedAt: '2026-07-20T10:00:00.000Z',
      lastReviewedAt: '2026-07-20T10:00:00.000Z',
      sources: [{ sourceType: 'manufacturer', sourceName: 'ICL', sourceUrl: 'https://icl.com', retrievedAt: '2026-07-20', evidence: null }],
      primarySourceUrl: 'https://icl.com',
      datasheetUrl: null,
      manufacturerUrl: null,
      hasOpenChangeRequest: false,
      legacyImportedAt: null,
    })

    expect(display.verificationLabel).toBe('Verifiziert')
    expect(display.hasSourceEvidence).toBe(true)
    expect(display.lastReviewedLabel).toContain('Zuletzt geprüft')
  })

  it('kennzeichnet Legacy-Produkte', () => {
    const display = buildProductUserTrustDisplay({
      verificationStatus: 'legacy_imported',
      verifiedAt: null,
      lastReviewedAt: null,
      sources: [],
      primarySourceUrl: null,
      datasheetUrl: null,
      manufacturerUrl: null,
      hasOpenChangeRequest: false,
      legacyImportedAt: '2026-01-01T00:00:00.000Z',
    })

    expect(display.verificationLabel).toBe('Technisch übernommen')
    expect(display.isLegacyImported).toBe(true)
  })
})
