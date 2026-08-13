import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type { ManufacturerStructuredResearchSourceRecord } from './fertilizerManufacturerStructuredResearchCore'
import {
  evaluateStructuredResearchSourceIdentityEvidence,
  parseNpkTripletFromText,
  sourceTextEvidencesNpk,
  sourceTextEvidencesProductLine,
} from './fertilizerManufacturerStructuredResearchSourceIdentityCore'
import { validateStructuredResearchIdentityMatch } from './fertilizerManufacturerStructuredResearchIdentityCore'
import type { ManufacturerStructuredResearchRecord } from './fertilizerManufacturerStructuredResearchCore'
import {
  mapStructuredResearchToAdapterResult,
  selectPrimaryStructuredResearchSource,
} from './fertilizerManufacturerStructuredResearchCore'

const IDENTITY: FertilizerEnrichmentIdentity = {
  manufacturer: 'Rasendoktor GmbH',
  officialName: 'Stress-Manager',
  productLine: 'Professional',
  variant: '0-0-30',
  identityFingerprint: 'fp',
  identityConfidence: 1,
  hasIdentityAmbiguity: false,
}

function buildStandardSource(): ManufacturerStructuredResearchSourceRecord {
  return {
    url: 'https://example.test/stressmanager-standard',
    title: 'Stressmanager Standard Dünger',
    category: 'official_manufacturer',
    sourceIdentity: {
      manufacturer: 'Rasendoktor',
      productLine: 'Standard',
      productName: 'Stressmanager',
      npkLabel: '11-5-5',
    },
  }
}

function buildProfessionalSource(): ManufacturerStructuredResearchSourceRecord {
  return {
    url: 'https://example.test/professional/stress-manager-0-0-30',
    title: 'Professional Stress-Manager 0-0-30',
    category: 'official_manufacturer',
    sourceIdentity: {
      manufacturer: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      npkLabel: '0-0-30',
    },
  }
}

function buildEchoRecord(
  overrides: Partial<ManufacturerStructuredResearchRecord> = {},
): ManufacturerStructuredResearchRecord {
  return {
    manufacturer: 'Rasendoktor GmbH',
    productLine: 'Professional',
    productName: 'Stress-Manager',
    productForm: 'granular',
    npk: { nitrogen: 0, phosphate: 0, potash: 30 },
    nutrientMatrix: {
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
      nitrateNitrogen: null,
      ammoniumNitrogen: null,
      ureaNitrogen: null,
      organicNitrogen: null,
      magnesium: 11,
      calcium: 6.6,
      sulfur: 16.4,
      iron: 0,
      manganese: null,
      copper: null,
      zinc: null,
      boron: null,
      molybdenum: null,
    },
    nutrientDeclarationBases: {
      nitrogen: 'N',
      phosphate: 'P2O5',
      potash: 'K2O',
      nitrateNitrogen: null,
      ammoniumNitrogen: null,
      ureaNitrogen: null,
      organicNitrogen: null,
      magnesium: 'MgO',
      calcium: 'CaO',
      sulfur: 'S',
      iron: 'Fe',
      manganese: null,
      copper: null,
      zinc: null,
      boron: null,
      molybdenum: null,
    },
    declarationComplete: true,
    identityMatch: true,
    confidence: 0.95,
    sources: [buildStandardSource()],
    ...overrides,
  }
}

describe('fertilizerManufacturerStructuredResearchSourceIdentityCore', () => {
  it('parses npk triplets from text', () => {
    expect(parseNpkTripletFromText('NPK 0-0-30')).toEqual({
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
    })
  })

  it('rejects standard source when professional product line is expected', () => {
    const validation = validateStructuredResearchIdentityMatch({
      record: buildEchoRecord(),
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: buildStandardSource(),
    })

    expect(validation.identityMatchAccepted).toBe(false)
    expect(validation.structuredIdentityEchoSuspected).toBe(true)
    expect(validation.rejectionReason).toBe('source_identity_mismatch')
  })

  it('rejects echoed professional json when source declares standard line', () => {
    const validation = validateStructuredResearchIdentityMatch({
      record: buildEchoRecord(),
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: buildStandardSource(),
    })

    expect(validation.declarationSourceIdentityMismatch).toBe(true)
    expect(validation.canonicalDeclarationSourceProductLineVerified).toBe(false)
  })

  it('rejects echoed npk when source text lacks matching npk', () => {
    const source: ManufacturerStructuredResearchSourceRecord = {
      url: 'https://example.test/professional/stress-manager',
      title: 'Professional Stress-Manager',
      category: 'official_manufacturer',
      sourceIdentity: {
        manufacturer: 'Rasendoktor',
        productLine: 'Professional',
        productName: 'Stress-Manager',
        npkLabel: '11-5-5',
      },
    }

    const validation = validateStructuredResearchIdentityMatch({
      record: buildEchoRecord({ sources: [source] }),
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: source,
    })

    expect(validation.identityMatchAccepted).toBe(false)
    expect(validation.declarationSourceIdentityMismatch).toBe(true)
    expect(validation.rejectionReason).toBe('source_identity_mismatch')
  })

  it('accepts professional source with matching identity evidence', () => {
    const source = buildProfessionalSource()
    const validation = validateStructuredResearchIdentityMatch({
      record: buildEchoRecord({
        nutrientMatrix: {
          ...buildEchoRecord().nutrientMatrix,
          magnesium: null,
          calcium: null,
          sulfur: 10.2,
          iron: 3,
        },
        sources: [source],
      }),
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: source,
    })

    expect(validation.identityMatchAccepted).toBe(true)
    expect(validation.sourceBoundIdentityAccepted).toBe(true)
    expect(validation.rejectionReason).toBe('none')
  })

  it('does not accept nutrients from unverified variant source via adapter', () => {
    const record = buildEchoRecord()
    const adapterResult = mapStructuredResearchToAdapterResult({
      record,
      identity: IDENTITY,
      retrievedAt: '2026-07-29T10:00:00.000Z',
      npkLabel: '0-0-30',
    })

    expect(adapterResult).toBeNull()
  })

  it('accepts adapter result only from identity-verified source', () => {
    const source = buildProfessionalSource()
    const record = buildEchoRecord({
      nutrientMatrix: {
        ...buildEchoRecord().nutrientMatrix,
        magnesium: null,
        calcium: null,
        sulfur: 10.2,
        iron: 3,
      },
      sources: [source, buildStandardSource()],
    })
    const adapterResult = mapStructuredResearchToAdapterResult({
      record,
      identity: IDENTITY,
      retrievedAt: '2026-07-29T10:00:00.000Z',
      npkLabel: '0-0-30',
    })

    expect(adapterResult?.status).toBe('success')
    expect(adapterResult?.sourceUrl).toBe(source.url)
  })

  it('selects official source but identity validation rejects wrong variant', () => {
    const primary = selectPrimaryStructuredResearchSource([
      buildStandardSource(),
      {
        url: 'https://shop.example/stress-manager',
        title: 'Shop listing',
        category: 'retailer',
      },
    ])

    expect(primary?.category).toBe('official_manufacturer')

    const evidence = evaluateStructuredResearchSourceIdentityEvidence({
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: primary,
      recordProductLineMatchesExpected: true,
      recordNpkCompatible: true,
    })

    expect(evidence.structuredIdentityEchoSuspected).toBe(true)
    expect(evidence.sourceBoundIdentityAccepted).toBe(false)
  })

  it('detects product line and npk in source text helpers', () => {
    const sourceText = 'Professional Stress-Manager 0-0-30 datasheet'
    expect(sourceTextEvidencesProductLine(sourceText, 'Professional')).toBe(true)
    expect(
      sourceTextEvidencesNpk(sourceText, { nitrogen: 0, phosphate: 0, potash: 30 }),
    ).toBe(true)
  })
})
