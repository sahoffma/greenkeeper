import type { ActiveProductStockReadRow } from './fertilizerProductStockReadCore'
import { buildFertilizerProductDetailRows } from './fertilizerProductDetailDisplayCore'
import { isValidFertilizerInventoryItemRouteId } from './fertilizerRoutes'

export type FertilizerProductDetailPageState =
  | { kind: 'invalid-id'; message: string }
  | { kind: 'not-found'; message: string }
  | { kind: 'ready'; title: string; rows: ReturnType<typeof buildFertilizerProductDetailRows> }

export const FERTILIZER_PRODUCT_DETAIL_NOT_FOUND_MESSAGE = 'Der Dünger wurde nicht gefunden.'

export function resolveFertilizerProductDetailPageState(input: {
  productId: string | undefined
  row: ActiveProductStockReadRow | null
}): FertilizerProductDetailPageState {
  if (!input.productId || !isValidFertilizerInventoryItemRouteId(input.productId)) {
    return {
      kind: 'invalid-id',
      message: FERTILIZER_PRODUCT_DETAIL_NOT_FOUND_MESSAGE,
    }
  }

  if (!input.row) {
    return {
      kind: 'not-found',
      message: FERTILIZER_PRODUCT_DETAIL_NOT_FOUND_MESSAGE,
    }
  }

  return {
    kind: 'ready',
    title: input.row.officialName ?? input.row.manufacturer ?? 'Dünger',
    rows: buildFertilizerProductDetailRows(input.row),
  }
}
