export const FERTILIZER_ROUTES = {
  hub: '/ausruestung/duenger',
  capture: '/ausruestung/duenger/erfassen',
} as const

export function fertilizerProductPath(productId: string): string {
  return `/ausruestung/duenger/${productId}`
}

export function fertilizerApplicationPath(inventoryItemId: string): string {
  return `/ausruestung/duenger/${inventoryItemId}/anwenden`
}
