export const FERTILIZER_ROUTES = {
  hub: '/ausruestung/duenger',
  capture: '/ausruestung/duenger/erfassen',
  homeApplication: '/duengung',
} as const

const STOCK_INTAKE_PATH_PATTERN =
  /^\/ausruestung\/duenger\/([^/]+)\/zugang$/

const STOCK_OUTBOUND_PATH_PATTERN =
  /^\/ausruestung\/duenger\/([^/]+)\/abgang$/

const INVENTORY_ITEM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function fertilizerProductPath(productId: string): string {
  return `/ausruestung/duenger/${productId}`
}

export function fertilizerStockIntakePath(inventoryItemId: string): string {
  return `/ausruestung/duenger/${inventoryItemId}/zugang`
}

export function fertilizerStockOutboundPath(inventoryItemId: string): string {
  return `/ausruestung/duenger/${inventoryItemId}/abgang`
}

export function fertilizerHomeApplicationPath(inventoryItemId?: string): string {
  if (inventoryItemId) {
    return `${FERTILIZER_ROUTES.homeApplication}/${inventoryItemId}`
  }

  return FERTILIZER_ROUTES.homeApplication
}

export function resolveLegacyApplicationRedirectPath(
  inventoryItemId: string | null | undefined,
): string {
  return isValidFertilizerInventoryItemRouteId(inventoryItemId)
    ? fertilizerHomeApplicationPath(inventoryItemId!)
    : FERTILIZER_ROUTES.homeApplication
}

export function isValidFertilizerInventoryItemRouteId(value: string | null | undefined): boolean {
  return typeof value === 'string' && INVENTORY_ITEM_ID_PATTERN.test(value.trim())
}

export function isFertilizerStockIntakePath(pathname: string): boolean {
  return STOCK_INTAKE_PATH_PATTERN.test(pathname)
}

export function isFertilizerStockOutboundPath(pathname: string): boolean {
  return STOCK_OUTBOUND_PATH_PATTERN.test(pathname)
}

export function parseFertilizerStockIntakeInventoryItemId(pathname: string): string | null {
  const match = STOCK_INTAKE_PATH_PATTERN.exec(pathname)
  const itemId = match?.[1] ?? null
  return itemId && isValidFertilizerInventoryItemRouteId(itemId) ? itemId : null
}

export function parseFertilizerStockOutboundInventoryItemId(pathname: string): string | null {
  const match = STOCK_OUTBOUND_PATH_PATTERN.exec(pathname)
  const itemId = match?.[1] ?? null
  return itemId && isValidFertilizerInventoryItemRouteId(itemId) ? itemId : null
}

export type FertilizerEquipmentEntryPoint = 'capture' | 'intake' | 'outbound' | 'hub'

export function resolveFertilizerEquipmentEntryPoint(pathname: string): FertilizerEquipmentEntryPoint {
  if (pathname === FERTILIZER_ROUTES.capture) {
    return 'capture'
  }

  if (isFertilizerStockIntakePath(pathname)) {
    return 'intake'
  }

  if (isFertilizerStockOutboundPath(pathname)) {
    return 'outbound'
  }

  return 'hub'
}
