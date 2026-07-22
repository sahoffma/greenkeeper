import { describe, expect, it } from 'vitest'
import { buildActivitySummaryRows, normalizeParsedActivity } from './parseActivityCore'

describe('normalizeParsedActivity', () => {
  it('akzeptiert verschiedene Maßnahmentypen', () => {
    const parsed = normalizeParsedActivity({
      activityType: 'mowing',
      activityLabel: 'Mähen',
      date: '2026-07-20',
      productName: null,
      amount: null,
      unit: null,
      mowHeightMm: 20,
      note: null,
      confidence: 0.92,
      warnings: [],
    })

    expect(parsed?.activityType).toBe('mowing')
    expect(parsed?.mowHeightMm).toBe(20)
  })
})

describe('buildActivitySummaryRows', () => {
  it('zeigt Düngung mit Produkt und Menge', () => {
    const rows = buildActivitySummaryRows(
      {
        activityType: 'fertilization',
        activityLabel: 'Düngung',
        date: '2026-07-20',
        productName: 'ICL Spring Start',
        amount: 25,
        unit: 'g/m²',
        mowHeightMm: null,
        note: null,
        confidence: 0.95,
        warnings: [],
      },
      { referenceDate: '2026-07-20', areaName: 'Vorgarten' },
    )

    expect(rows).toEqual([
      { label: 'Maßnahme', value: 'Düngung' },
      { label: 'Produkt', value: 'ICL Spring Start' },
      { label: 'Menge', value: '25 g/m²' },
      { label: 'Datum', value: 'Heute' },
      { label: 'Fläche', value: 'Vorgarten' },
    ])
  })

  it('zeigt Mähen mit Schnitthöhe', () => {
    const rows = buildActivitySummaryRows({
      activityType: 'mowing',
      activityLabel: 'Mähen',
      date: '2026-07-20',
      productName: null,
      amount: null,
      unit: null,
      mowHeightMm: 20,
      note: null,
      confidence: 0.9,
      warnings: [],
    })

    expect(rows).toEqual([
      { label: 'Maßnahme', value: 'Mähen' },
      { label: 'Schnitthöhe', value: '20 mm' },
    ])
  })

  it('zeigt Bewässerung mit Liter pro Quadratmeter', () => {
    const rows = buildActivitySummaryRows({
      activityType: 'watering',
      activityLabel: 'Bewässerung',
      date: '2026-07-20',
      productName: null,
      amount: 12,
      unit: 'l/m²',
      mowHeightMm: null,
      note: null,
      confidence: 0.88,
      warnings: [],
    })

    expect(rows).toEqual([
      { label: 'Maßnahme', value: 'Bewässerung' },
      { label: 'Menge', value: '12 l/m²' },
    ])
  })
})
