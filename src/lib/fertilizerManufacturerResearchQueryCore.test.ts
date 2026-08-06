import { describe, expect, it } from 'vitest'
import {
  buildManufacturerResearchSearchQueries,
  buildOfficialSourceUrlCandidates,
  buildProductNameSearchVariants,
} from './fertilizerManufacturerResearchQueryCore'
import { resolveManufacturerDomain } from './fertilizerManufacturerDomainCore'

describe('fertilizerManufacturerResearchQueryCore', () => {
  it('builds hyphen and space variants for product names', () => {
    expect(buildProductNameSearchVariants('Stress-Manager')).toEqual(
      expect.arrayContaining(['Stress-Manager', 'Stress Manager', 'StressManager']),
    )
  })

  it('builds generic search queries from identity', () => {
    const queries = buildManufacturerResearchSearchQueries({
      identity: {
        manufacturer: 'Rasendoktor GmbH',
        officialName: 'Stress-Manager',
        productLine: 'Professional',
        variant: '0-0-30',
        identityFingerprint: 'rasendoktor|professional|stress-manager|0-0-30',
        identityConfidence: 1,
        hasIdentityAmbiguity: false,
      },
      npkLabel: '0-0-30',
      packageSizeLabel: '5 kg',
    })

    expect(queries.some((query) => query.includes('Stress Manager'))).toBe(true)
    expect(queries.some((query) => query.includes('site:rasendoktor.de'))).toBe(true)
    expect(queries.some((query) => query.includes('Produktdatenblatt'))).toBe(true)
  })

  it('builds generic official URL candidates from domain and product name', () => {
    const candidates = buildOfficialSourceUrlCandidates({
      identity: {
        manufacturer: 'Rasendoktor GmbH',
        officialName: 'Stress-Manager',
        productLine: 'Professional',
        variant: '0-0-30',
        identityFingerprint: 'fp',
        identityConfidence: 1,
        hasIdentityAmbiguity: false,
      },
      manufacturerDomain: resolveManufacturerDomain('Rasendoktor GmbH'),
    })

    expect(candidates).toEqual(
      expect.arrayContaining([
        'https://www.rasendoktor.de/duenger/stress-manager',
        'https://www.rasendoktor.de/professional/stress-manager',
      ]),
    )
  })
})
