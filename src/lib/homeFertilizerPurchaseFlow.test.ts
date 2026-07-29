import { describe, expect, it } from 'vitest'
import {
  buildHomeFertilizerReadySummary,
  detectFixtureFertilizerPurchase,
  homeFertilizerCapturePath,
  homeFertilizerClarifyMessage,
  resolveHomeFertilizerPackageAnswer,
} from './homeFertilizerPurchaseFlow'

describe('homeFertilizerPurchaseFlow', () => {
  it('detects fixture purchase intent from home transcript', () => {
    expect(detectFixtureFertilizerPurchase('Ich habe einen Sack ICL All Season gekauft.')).toBe(true)
    expect(detectFixtureFertilizerPurchase('Heute gemäht.')).toBe(false)
  })

  it('asks exactly one clarify question with package options', () => {
    const message = homeFertilizerClarifyMessage()
    expect(message).toMatch(/7 kg oder 25 kg/)
    expect(message).not.toMatch(/Preis|Händler|Kaufdatum/)
  })

  it('resolves smaller sack to 7 kg', () => {
    expect(resolveHomeFertilizerPackageAnswer('Der kleinere Sack.')).toEqual({
      quantity: 7,
      unit: 'kg',
    })
  })

  it('builds compact summary before save', () => {
    const summary = buildHomeFertilizerReadySummary('Der kleinere Sack.')
    expect(summary?.productLine).toMatch(/All Season/)
    expect(summary?.stockLine).toBe('7 kg aktuell im Bestand')
  })

  it('routes to capture flow without auto-saving', () => {
    expect(homeFertilizerCapturePath(false)).toBe('/ausruestung/duenger/erfassen?handoff=home-all-season')
    expect(homeFertilizerCapturePath(true)).toBe('/ausruestung/duenger/erfassen?handoff=home-resolved')
  })
})
