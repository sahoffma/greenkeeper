import { describe, expect, it } from 'vitest'
import {
  buildFertilizerProductDetailRows,
  buildSavedProductNpkDisplay,
} from './fertilizerProductDetailDisplayCore'
import type { ActiveProductStockReadRow } from './fertilizerProductStockReadCore'

function detailRow(
  overrides: Partial<ActiveProductStockReadRow> = {},
): ActiveProductStockReadRow {
  return {
    inventoryItemId: '33333333-3333-4333-8333-333333333333',
    savedProductProfileId: '11111111-1111-4111-8111-111111111111',
    baseUnit: 'kg',
    balance: 25,
    manufacturer: 'Hersteller Z',
    officialName: 'Dünger XY',
    productForm: 'granular',
    movementCount: 1,
    lastMovementAt: null,
    ...overrides,
  }
}

describe('fertilizerProductDetailDisplayCore', () => {
  it('formats NPK from numeric values', () => {
    expect(
      buildSavedProductNpkDisplay({
        nitrogen: 12,
        phosphate: 5,
        potash: 8,
      }),
    ).toBe('NPK 12-5-8')
  })

  it('prefers npk declaration when present', () => {
    expect(
      buildSavedProductNpkDisplay({
        npkDeclaration: '12-5-8',
        nitrogen: 1,
        phosphate: 2,
        potash: 3,
      }),
    ).toBe('NPK 12-5-8')
  })

  it('does not invent missing nutrient values', () => {
    expect(
      buildSavedProductNpkDisplay({
        nitrogen: 12,
        phosphate: null,
        potash: 8,
      }),
    ).toBeNull()
  })

  it('builds detail rows only from available data', () => {
    const rows = buildFertilizerProductDetailRows(
      detailRow({
        npkDeclaration: '12-5-8',
        nutrientMatrix: {
          magnesium: { value: 2, unit: '%', declarationBasis: 'MgO' },
          iron: { value: 0.5, unit: '%', declarationBasis: 'Fe' },
        },
      }),
    )

    expect(rows.some((row) => row.label === 'Hersteller' && row.value === 'Hersteller Z')).toBe(true)
    expect(rows.some((row) => row.label === 'NPK')).toBe(true)
    expect(rows.some((row) => row.label === 'Magnesium')).toBe(true)
    expect(rows.some((row) => row.label === 'Eisen')).toBe(true)
    expect(rows.some((row) => row.label === 'Zusatzstoffe')).toBe(false)
  })
})
