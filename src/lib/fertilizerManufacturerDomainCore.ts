import { buildManufacturerBrandToken } from './fertilizerManufacturerResearchQueryCore'

const GENERIC_TLDS = ['de', 'com', 'eu'] as const

export function resolveManufacturerDomain(manufacturer: string | null | undefined): string | null {
  const brandToken = buildManufacturerBrandToken(manufacturer)
  if (!brandToken) {
    return null
  }

  return `${brandToken}.de`
}

export function resolveManufacturerDomainCandidates(manufacturer: string | null | undefined): string[] {
  const brandToken = buildManufacturerBrandToken(manufacturer)
  if (!brandToken) {
    return []
  }

  return GENERIC_TLDS.map((tld) => `${brandToken}.${tld}`)
}
