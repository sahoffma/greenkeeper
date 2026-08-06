import { describe, expect, it } from 'vitest'
import {
  FERTILIZER_ROUTES,
  fertilizerHomeApplicationPath,
  fertilizerProductPath,
  fertilizerStockIntakePath,
  fertilizerStockOutboundPath,
  isFertilizerStockIntakePath,
  isFertilizerStockOutboundPath,
  isValidFertilizerInventoryItemRouteId,
  parseFertilizerStockIntakeInventoryItemId,
  parseFertilizerStockOutboundInventoryItemId,
  resolveFertilizerEquipmentEntryPoint,
  resolveLegacyApplicationRedirectPath,
} from './fertilizerRoutes'

const ITEM_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

describe('fertilizerRoutes', () => {
  it('exposes capture route without home route', () => {
    expect(FERTILIZER_ROUTES.capture).toBe('/ausruestung/duenger/erfassen')
    expect(FERTILIZER_ROUTES.homeApplication).toBe('/duengung')
  })

  it('builds canonical home application paths', () => {
    expect(fertilizerHomeApplicationPath()).toBe('/duengung')
    expect(fertilizerHomeApplicationPath(ITEM_ID)).toBe(`/duengung/${ITEM_ID}`)
  })

  it('resolves legacy application redirect to canonical path', () => {
    expect(resolveLegacyApplicationRedirectPath(ITEM_ID)).toBe(`/duengung/${ITEM_ID}`)
    expect(resolveLegacyApplicationRedirectPath('not-a-uuid')).toBe('/duengung')
    expect(resolveLegacyApplicationRedirectPath(undefined)).toBe('/duengung')
  })

  it('builds product detail path with inventory item id', () => {
    expect(fertilizerProductPath(ITEM_ID)).toBe(`/ausruestung/duenger/${ITEM_ID}`)
  })

  it('builds intake and outbound paths', () => {
    expect(fertilizerStockIntakePath(ITEM_ID)).toBe(
      `/ausruestung/duenger/${ITEM_ID}/zugang`,
    )
    expect(fertilizerStockOutboundPath(ITEM_ID)).toBe(
      `/ausruestung/duenger/${ITEM_ID}/abgang`,
    )
  })

  it('parses valid inventory item ids', () => {
    const intakePath = fertilizerStockIntakePath(ITEM_ID)
    expect(parseFertilizerStockIntakeInventoryItemId(intakePath)).toBe(ITEM_ID)
    expect(isFertilizerStockIntakePath(intakePath)).toBe(true)
    expect(parseFertilizerStockOutboundInventoryItemId(fertilizerStockOutboundPath(ITEM_ID))).toBe(
      ITEM_ID,
    )
    expect(isFertilizerStockOutboundPath(fertilizerStockOutboundPath(ITEM_ID))).toBe(true)
  })

  it('rejects invalid ids', () => {
    expect(isValidFertilizerInventoryItemRouteId('not-a-uuid')).toBe(false)
    expect(parseFertilizerStockIntakeInventoryItemId('/ausruestung/duenger/bad/zugang')).toBeNull()
  })

  it('resolves equipment entry points', () => {
    expect(resolveFertilizerEquipmentEntryPoint(FERTILIZER_ROUTES.capture)).toBe('capture')
    expect(resolveFertilizerEquipmentEntryPoint(fertilizerStockIntakePath(ITEM_ID))).toBe('intake')
    expect(resolveFertilizerEquipmentEntryPoint(fertilizerStockOutboundPath(ITEM_ID))).toBe(
      'outbound',
    )
    expect(resolveFertilizerEquipmentEntryPoint(FERTILIZER_ROUTES.hub)).toBe('hub')
  })
})
