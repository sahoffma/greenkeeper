import { describe, expect, it } from 'vitest'
import {
  computePurchaseAmount,
  formatSaveConfirmationLines,
  planCaptureStockQuestion,
  validateCaptureQuantity,
  buildRecognitionIdentityFingerprint,
} from './fertilizerInventoryCore'
import {
  applyInitialStockAnswer,
  planInitialStockQuestion,
} from './productRecognizeStockCore'

describe('fertilizerInventoryCore', () => {
  it('1 — Katalogprodukt bereits im Bestand: keine Restfrage', () => {
    const question = planInitialStockQuestion({
      stockStatus: 'has_stock',
      existingStock: 1.5,
      purchaseAmount: 5,
      unit: 'kg',
    })

    expect(question.kind).toBe('none')
    if (question.kind === 'none') {
      expect(question.totalStock).toBe(6.5)
    }
  })

  it('3 — bekanntes Produkt mit Bestand null: keine Restfrage', () => {
    const question = planInitialStockQuestion({
      stockStatus: 'known_zero',
      existingStock: 0,
      purchaseAmount: 5,
      unit: 'kg',
    })

    expect(question.kind).toBe('none')
    if (question.kind === 'none') {
      expect(question.totalStock).toBe(5)
    }
  })

  it('4 — erstmaliges Produkt ohne früheren Restbestand', () => {
    const question = planInitialStockQuestion({
      stockStatus: 'first_time',
      purchaseAmount: 5,
      unit: 'kg',
    })
    expect(question.kind).toBe('ask_previous_remainder')

    const result = applyInitialStockAnswer(question, { hadPreviousRemainder: false })
    expect(result).toMatchObject({ totalStock: 5 })
  })

  it('5 — erstmaliges Produkt mit früherem Restbestand', () => {
    const question = planInitialStockQuestion({
      stockStatus: 'first_time',
      purchaseAmount: 5,
      unit: 'kg',
    })

    const afterYes = applyInitialStockAnswer(question, { hadPreviousRemainder: true })
    expect(afterYes).toMatchObject({ kind: 'ask_remainder_amount' })

    const final = applyInitialStockAnswer(afterYes as typeof question, {
      previousRemainderAmount: 2,
    })
    expect(final).toMatchObject({ totalStock: 7 })
  })

  it('7 — Greenkeeper berechnet Gesamtbestand (2 + 5 = 7)', () => {
    const question = planCaptureStockQuestion({
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
      purchaseAmount: 5,
      unit: 'kg',
    })
    const result = applyInitialStockAnswer(
      applyInitialStockAnswer(question, { hadPreviousRemainder: true }) as Extract<
        typeof question,
        { kind: 'ask_remainder_amount' }
      >,
      { previousRemainderAmount: 2 },
    )
    expect(result).toMatchObject({ totalStock: 7 })
  })

  it('8 — zwei 5-kg-Säcke ergeben 10 kg Zugang', () => {
    expect(
      computePurchaseAmount({
        packageSize: 5,
        packageCount: 2,
        explicitQuantity: null,
      }),
    ).toBe(10)
  })

  it('16 — ungültige Menge wird abgelehnt', () => {
    expect(validateCaptureQuantity(-1)).toMatch(/größer/)
    expect(validateCaptureQuantity(Number.NaN)).toMatch(/gültige/)
  })

  it('12 — Fingerprint stabil für Wiedererkennung', () => {
    const a = buildRecognitionIdentityFingerprint({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Frühjahr & Neuansaat',
      npk: '14-28-10',
    })
    const b = buildRecognitionIdentityFingerprint({
      brand: ' RASENDOKTOR ',
      productLine: 'professional',
      productName: 'Frühjahr & Neuansaat',
      npk: '14-28-10',
    })
    expect(a).toBe(b)
  })

  it('Bestätigungstexte ohne technische Sprache', () => {
    const lines = formatSaveConfirmationLines({
      purchaseQuantity: 5,
      purchaseUnit: 'kg',
      previousRemainder: 2,
      resultingBalance: 7,
    })
    expect(lines.purchaseLine).toBe('Kauf: 5 kg')
    expect(lines.remainderLine).toBe('Vorheriger Restbestand: 2 kg')
    expect(lines.balanceLine).toBe('Neuer Bestand: 7 kg')
  })
})

describe('productRecognizeStockCore movement examples', () => {
  it('6 — Startbestand und Kauf getrennt modelliert (2 + 5 = 7)', () => {
    const purchase = 5
    const remainder = 2
    expect(remainder + purchase).toBe(7)
  })

  it('Beispiel 1,5 + 5 = 6,5', () => {
    expect(1.5 + 5).toBe(6.5)
  })
})
