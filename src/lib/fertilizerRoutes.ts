export const FERTILIZER_ROUTES = {
  hub: '/ausruestung/duenger',
  capture: '/ausruestung/duenger/erfassen',
  homeApplication: '/duengung',
} as const

const LEGACY_APPLICATION_PATH_PATTERN =
  /^\/ausruestung\/duenger\/([^/]+)\/anwenden$/

export function fertilizerProductPath(productId: string): string {
  return `/ausruestung/duenger/${productId}`
}

export function fertilizerLegacyApplicationPath(inventoryItemId: string): string {
  return `/ausruestung/duenger/${inventoryItemId}/anwenden`
}

/** @deprecated Prefer fertilizerHomeApplicationPath for new application flows. */
export function fertilizerApplicationPath(inventoryItemId: string): string {
  return fertilizerLegacyApplicationPath(inventoryItemId)
}

export function fertilizerHomeApplicationPath(inventoryItemId?: string): string {
  if (inventoryItemId) {
    return `${FERTILIZER_ROUTES.homeApplication}/${inventoryItemId}`
  }

  return FERTILIZER_ROUTES.homeApplication
}

export function isLegacyFertilizerApplicationPath(pathname: string): boolean {
  return LEGACY_APPLICATION_PATH_PATTERN.test(pathname)
}

export function parseLegacyFertilizerApplicationInventoryItemId(
  pathname: string,
): string | null {
  const match = LEGACY_APPLICATION_PATH_PATTERN.exec(pathname)
  return match?.[1] ?? null
}
