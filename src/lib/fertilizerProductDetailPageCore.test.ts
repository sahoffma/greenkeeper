import { describe, expect, it } from 'vitest'
import { buildFertilizerProductDetailRows } from './fertilizerProductDetailDisplayCore'
import {
  FERTILIZER_PRODUCT_DETAIL_NOT_FOUND_MESSAGE,
  resolveFertilizerProductDetailPageState,
} from './fertilizerProductDetailPageCore'
import {
  STRESS_MANAGER_INVENTORY_ITEM_ID,
  stressManagerActiveProductStockRow,
  stressManagerDetailRpcItemPayload,
} from './fertilizerProductDetailStressManagerFixtures'
import {
  parseActiveProductStockItemPayload,
  parseActiveProductStockReadRow,
} from './fertilizerProductStockReadCore'

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
        productId: STRESS_MANAGER_INVENTORY_ITEM_ID,
        row: null,
      }),
    ).toEqual({
      kind: 'not-found',
      message: FERTILIZER_PRODUCT_DETAIL_NOT_FOUND_MESSAGE,
    })
  })

  it('builds detail rows for saved Stress-Manager capture with 5 kg and NPK 0-0-30', () => {
    const state = resolveFertilizerProductDetailPageState({
      productId: STRESS_MANAGER_INVENTORY_ITEM_ID,
      row: stressManagerActiveProductStockRow(),
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
    expect(state.rows.some((row) => row.label === 'Gebindegröße')).toBe(false)
    expect(state.rows.some((row) => row.label === 'NPK' && row.value === 'NPK 0-0-30')).toBe(true)
    expect(state.rows.some((row) => row.label === 'Aktueller Bestand' && row.value === '5 kg')).toBe(
      true,
    )
  })

  it('shows explicitly saved dl014_zero trace nutrients as zero values', () => {
    const rows = buildFertilizerProductDetailRows(stressManagerActiveProductStockRow())

    expect(rows.some((row) => row.label === 'Eisen' && row.value === '0 % Fe')).toBe(true)
    expect(rows.some((row) => row.label === 'Mangan' && row.value === '0 % Mn')).toBe(true)
    expect(rows.some((row) => row.label === 'Schwefel' && row.value === '0 % SO3')).toBe(true)
  })

  it('shows saved nutrient values greater than zero when present in the matrix', () => {
    const rows = buildFertilizerProductDetailRows(
      stressManagerActiveProductStockRow({
        nutrientMatrix: {
          ...stressManagerActiveProductStockRow().nutrientMatrix,
          iron: { value: 3, unit: '%', declarationBasis: 'Fe' },
          sulfur: { value: 10.2, unit: '%', declarationBasis: 'S' },
        },
      }),
    )

    expect(rows.some((row) => row.label === 'Eisen' && row.value === '3 % Fe')).toBe(true)
    expect(rows.some((row) => row.label === 'Schwefel' && row.value === '10.2 % S')).toBe(true)
  })

  it('does not invent zero values when nutrientMatrix is missing from rpc row', () => {
    const row = parseActiveProductStockReadRow({
      ...stressManagerDetailRpcItemPayload(),
      nutrientMatrix: undefined,
    })
    const rows = buildFertilizerProductDetailRows(row)

    expect(rows.some((row) => row.label === 'Eisen')).toBe(false)
    expect(rows.some((row) => row.label === 'Magnesium')).toBe(false)
    expect(rows.some((row) => row.label === 'Mangan')).toBe(false)
  })

  it('preserves the full saved matrix from rpc payload through read and display', () => {
    const parsed = parseActiveProductStockItemPayload({
      item: stressManagerDetailRpcItemPayload(),
    })
    expect(parsed).not.toBeNull()
    if (!parsed) {
      return
    }

    expect(parsed.nutrientMatrix?.iron?.value).toBe(0)
    expect(parsed.nutrientMatrix?.potash?.value).toBe(30)

    const rows = buildFertilizerProductDetailRows(parsed)
    expect(rows.some((row) => row.label === 'Eisen' && row.value === '0 % Fe')).toBe(true)
    expect(rows.some((row) => row.label === 'Zink' && row.value === '0 % Zn')).toBe(true)
    expect(rows.some((row) => row.label === 'Kupfer' && row.value === '0 % Cu')).toBe(true)
  })
})
