import { describe, expect, it } from 'vitest'
import {
  buildFertilizerStockListDetailPath,
  buildFertilizerStockListIntakePath,
  buildFertilizerStockListOutboundPath,
  resolveFertilizerStockListNavigationKind,
  shouldStockListInteractionOpenDetail,
  shouldStockListInteractionStopPropagation,
} from './fertilizerCategoryStockNavigationCore'

const ITEM_ID = '33333333-3333-4333-8333-333333333333'

describe('fertilizerCategoryStockNavigationCore', () => {
  it('opens detail for card and product name interactions', () => {
    expect(shouldStockListInteractionOpenDetail('card')).toBe(true)
    expect(shouldStockListInteractionOpenDetail('product-name')).toBe(true)
    expect(resolveFertilizerStockListNavigationKind('card')).toBe('detail')
    expect(resolveFertilizerStockListNavigationKind('product-name')).toBe('detail')
  })

  it('routes intake and outbound links separately without detail navigation', () => {
    expect(shouldStockListInteractionOpenDetail('intake-link')).toBe(false)
    expect(shouldStockListInteractionOpenDetail('outbound-link')).toBe(false)
    expect(resolveFertilizerStockListNavigationKind('intake-link')).toBe('intake')
    expect(resolveFertilizerStockListNavigationKind('outbound-link')).toBe('outbound')
  })

  it('requires stopPropagation for stock action links only', () => {
    expect(shouldStockListInteractionStopPropagation('intake-link')).toBe(true)
    expect(shouldStockListInteractionStopPropagation('outbound-link')).toBe(true)
    expect(shouldStockListInteractionStopPropagation('card')).toBe(false)
    expect(shouldStockListInteractionStopPropagation('product-name')).toBe(false)
  })

  it('builds detail, intake and outbound routes with inventory item id', () => {
    expect(buildFertilizerStockListDetailPath(ITEM_ID)).toBe(
      `/ausruestung/duenger/${ITEM_ID}`,
    )
    expect(buildFertilizerStockListIntakePath(ITEM_ID)).toBe(
      `/ausruestung/duenger/${ITEM_ID}/zugang`,
    )
    expect(buildFertilizerStockListOutboundPath(ITEM_ID)).toBe(
      `/ausruestung/duenger/${ITEM_ID}/abgang`,
    )
  })
})
