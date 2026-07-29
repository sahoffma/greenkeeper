import { describe, expect, it } from 'vitest'
import {
  applyInitialStockAnswer,
  planInitialStockQuestion,
} from './productRecognizeStockCore'

describe('productRecognizeStockCore', () => {
  it('8 — CM-013: erstmaliger Bestand mit Restbestandsfrage', () => {
    const question = planInitialStockQuestion({
      stockStatus: 'first_time',
      purchaseAmount: 5,
      unit: 'kg',
    })

    expect(question.kind).toBe('ask_previous_remainder')
  })

  it('9 — CM-013: bestehender Bestand addiert Kaufmenge', () => {
    const question = planInitialStockQuestion({
      stockStatus: 'has_stock',
      existingStock: 2,
      purchaseAmount: 5,
      unit: 'kg',
    })

    expect(question.kind).toBe('none')
    if (question.kind === 'none') {
      expect(question.totalStock).toBe(7)
    }
  })

  it('10 — CM-013: kein Restbestand → Kaufmenge = Gesamt', () => {
    const question = planInitialStockQuestion({
      stockStatus: 'first_time',
      purchaseAmount: 5,
      unit: 'kg',
    })

    const result = applyInitialStockAnswer(question, { hadPreviousRemainder: false })
    expect(result).toMatchObject({ totalStock: 5, addedToExisting: false })
  })
})
