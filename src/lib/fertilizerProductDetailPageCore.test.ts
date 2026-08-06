import { describe, expect, it } from 'vitest'
import { buildFertilizerProductDetailRows } from './fertilizerProductDetailDisplayCore'
import {
  FERTILIZER_PRODUCT_DETAIL_NOT_FOUND_MESSAGE,
  resolveFertilizerProductDetailPageState,
} from './fertilizerProductDetailPageCore'
import type { ActiveProductStockReadRow } from './fertilizerProductStockReadCore'

const ITEM_ID = '33333333-3333-4333-8333-333333333333'

function stressManagerRow(
  overrides: Partial<ActiveProductStockReadRow> = {},
): ActiveProductStockReadRow {
  return {
    inventoryItemId: ITEM_ID,
    savedProductProfileId: '11111111-1111-4111-8111-111111111111',
    baseUnit: 'kg',
    balance: 5,
    manufacturer: 'Rasendoktor',
    officialName: 'Stress-Manager',
    productLine: 'Professional',
    productForm: 'granular',
    npkDeclaration: '0-0-30',
    nitrogen: 0,
    phosphate: 0,
    potash: 30,
    packageSizeValue: 5,
    packageSizeUnit: 'kg',
    movementCount: 1,
    lastMovementAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  }
}

describe('fertilizerProductDetailPageCore', () => {
  it('shows not-found for invalid route ids', () => {
    expect(resolveFertilizerProductDetailPageState({ productId: 'bad-id', row: null })).toEqual({
      kind: 'invalid-id',
      message: FERTILIZER_PRODUCT_DETAIL_NOT_FOUND_MESSAGE,
    })
  })

  it('shows not-found when rpc returns no row', () => {
    expect(
      resolveFertilizerProductDetailPageState({
        productId: ITEM_ID,
        row: null,
      }),
    ).toEqual({
      kind: 'not-found',
      message: FERTILIZER_PRODUCT_DETAIL_NOT_FOUND_MESSAGE,
    })
  })

  it('builds detail rows for saved Stress-Manager capture with 5 kg and NPK 0-0-30', () => {
    const state = resolveFertilizerProductDetailPageState({
      productId: ITEM_ID,
      row: stressManagerRow(),
    })

    expect(state.kind).toBe('ready')
    if (state.kind !== 'ready') {
      return
    }

    expect(state.title).toBe('Stress-Manager')
    expect(state.rows.some((row) => row.label === 'Hersteller' && row.value === 'Rasendoktor')).toBe(
      true,
    )
    expect(state.rows.some((row) => row.label === 'Produktlinie' && row.value === 'Professional')).toBe(
      true,
    )
    expect(state.rows.some((row) => row.label === 'Produktform' && row.value === 'Granulat')).toBe(
      true,
    )
    expect(state.rows.some((row) => row.label === 'Gebindegröße' && row.value === '5 kg')).toBe(true)
    expect(state.rows.some((row) => row.label === 'NPK' && row.value === 'NPK 0-0-30')).toBe(true)
    expect(state.rows.some((row) => row.label === 'Aktueller Bestand' && row.value === '5 kg')).toBe(
      true,
    )
  })

  it('shows dl014_zero trace nutrients as zero values', () => {
    const rows = buildFertilizerProductDetailRows(
      stressManagerRow({
        nutrientMatrix: {
          iron: { value: 0, unit: '%', declarationBasis: 'Fe' },
          manganese: { value: 0, unit: '%', declarationBasis: 'Mn' },
        },
      }),
    )

    expect(rows.some((row) => row.label === 'Eisen' && row.value === '0 % Fe')).toBe(true)
    expect(rows.some((row) => row.label === 'Mangan' && row.value === '0 % Mn')).toBe(true)
  })
})
