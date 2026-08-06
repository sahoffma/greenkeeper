import {
  fertilizerProductPath,
  fertilizerStockIntakePath,
  fertilizerStockOutboundPath,
} from './fertilizerRoutes'

export type FertilizerStockListInteraction =
  | 'card'
  | 'product-name'
  | 'intake-link'
  | 'outbound-link'

export type FertilizerStockListNavigationKind = 'detail' | 'intake' | 'outbound' | 'none'

export function resolveFertilizerStockListNavigationKind(
  interaction: FertilizerStockListInteraction,
): FertilizerStockListNavigationKind {
  switch (interaction) {
    case 'card':
    case 'product-name':
      return 'detail'
    case 'intake-link':
      return 'intake'
    case 'outbound-link':
      return 'outbound'
    default:
      return 'none'
  }
}

export function shouldStockListInteractionOpenDetail(
  interaction: FertilizerStockListInteraction,
): boolean {
  return resolveFertilizerStockListNavigationKind(interaction) === 'detail'
}

export function shouldStockListInteractionStopPropagation(
  interaction: FertilizerStockListInteraction,
): boolean {
  return interaction === 'intake-link' || interaction === 'outbound-link'
}

export function buildFertilizerStockListDetailPath(inventoryItemId: string): string {
  return fertilizerProductPath(inventoryItemId)
}

export function buildFertilizerStockListIntakePath(inventoryItemId: string): string {
  return fertilizerStockIntakePath(inventoryItemId)
}

export function buildFertilizerStockListOutboundPath(inventoryItemId: string): string {
  return fertilizerStockOutboundPath(inventoryItemId)
}
