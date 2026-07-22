import { describe, expect, it } from 'vitest'
import {
  calculateConfidence,
  calculateReviewPriority,
  computeFieldChanges,
  detectDuplicate,
  inferFieldConfidenceFromPayload,
  stringSimilarity,
} from './productGovernanceCore'

describe('calculateConfidence', () => {
  it('berechnet den Mittelwert vorhandener Feldwerte', () => {
    expect(
      calculateConfidence({
        manufacturer: 100,
        officialName: 80,
        npk: 60,
      }),
    ).toBe(80)
  })

  it('gibt 0 zurück, wenn keine Feldwerte vorhanden sind', () => {
    expect(calculateConfidence({})).toBe(0)
  })
})

describe('detectDuplicate', () => {
  it('erkennt exakte Duplikate unter gleichem Hersteller', () => {
    const result = detectDuplicate(
      { manufacturer: 'ICL', officialName: 'Spring Start', aliases: [] },
      [{ id: 'p1', manufacturer: 'ICL', officialName: 'Spring Start', aliases: ['Springstar'] }],
    )

    expect(result.isDuplicate).toBe(true)
    expect(result.bestMatch?.score).toBe(1)
  })

  it('ignoriert Produkte anderer Hersteller', () => {
    const result = detectDuplicate(
      { manufacturer: 'ICL', officialName: 'Spring Start', aliases: [] },
      [{ id: 'p1', manufacturer: 'Other', officialName: 'Spring Start', aliases: [] }],
    )

    expect(result.isDuplicate).toBe(false)
  })
})

describe('stringSimilarity', () => {
  it('liefert hohe Ähnlichkeit für leicht abweichende Namen', () => {
    const score = stringSimilarity('Spring Start', 'Spring Start NPK')
    expect(score).toBeGreaterThan(0.5)
  })
})

describe('inferFieldConfidenceFromPayload', () => {
  it('setzt Standardwerte für befüllte Felder', () => {
    const result = inferFieldConfidenceFromPayload({
      manufacturer: 'ICL',
      officialName: 'Test',
      nPercent: 16,
      recommendedRateMin: 20,
    })

    expect(result.manufacturer).toBe(50)
    expect(result.nPercent).toBe(50)
    expect(result.dosage).toBe(50)
  })
})

describe('calculateReviewPriority', () => {
  it('priorisiert Herstellerquellen höher als Nutzermeldungen', () => {
    const manufacturerPriority = calculateReviewPriority(
      [{ sourceType: 'manufacturer', sourceName: 'ICL', sourceUrl: null, retrievedAt: '2026-01-01', evidence: null }],
      'user_manual',
    )
    const userPriority = calculateReviewPriority([], 'user_manual')

    expect(manufacturerPriority).toBeGreaterThan(userPriority)
  })

  it('erhöht Priorität bei Korroboration', () => {
    const base = calculateReviewPriority([], 'user_manual', 0)
    const corroborated = calculateReviewPriority([], 'user_manual', 2)

    expect(corroborated).toBeGreaterThan(base)
  })
})

describe('computeFieldChanges', () => {
  it('erkennt geänderte Felder zwischen Snapshots', () => {
    const changes = computeFieldChanges(
      { n_percent: 8, official_name: 'Alt' },
      { n_percent: 16, official_name: 'Alt' },
    )

    expect(changes).toHaveLength(1)
    expect(changes[0].field).toBe('n_percent')
    expect(changes[0].newValue).toBe(16)
  })
})
