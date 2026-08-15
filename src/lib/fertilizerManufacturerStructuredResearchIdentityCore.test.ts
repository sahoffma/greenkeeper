import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import {
  npkTripletsCompatible,
  productLinesCompatible,
  validateStructuredResearchIdentityMatch,
} from './fertilizerManufacturerStructuredResearchIdentityCore'
import type {
  ManufacturerStructuredResearchRecord,
  ManufacturerStructuredResearchSourceRecord,
} from './fertilizerManufacturerStructuredResearchCore'
import { buildManufacturerSearchSelectionFromEvidence } from './fertilizerManufacturerSearchCandidateCore'

const IDENTITY: FertilizerEnrichmentIdentity = {
  manufacturer: 'Rasendoktor GmbH',
  officialName: 'Stress-Manager',
  productLine: 'Professional',
  variant: '0-0-30',
  identityFingerprint: 'fp',
  identityConfidence: 1,
  hasIdentityAmbiguity: false,
}

function verifiedProfessionalSource(): ManufacturerStructuredResearchSourceRecord {
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

function buildRecord(
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
      magnesium: null,
      calcium: null,
      sulfur: 10.2,
      iron: 3,
      manganese: 0.1,
      copper: 0.1,
      zinc: 0.1,
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
      magnesium: null,
      calcium: null,
      sulfur: 'S',
      iron: 'Fe',
      manganese: 'Mn',
      copper: 'Cu',
      zinc: 'Zn',
      boron: null,
      molybdenum: null,
    },
    declarationComplete: true,
    identityMatch: true,
    confidence: 0.95,
    sources: [verifiedProfessionalSource()],
    ...overrides,
  }
}

describe('fertilizerManufacturerStructuredResearchIdentityCore', () => {
  it('rejects standard stressmanager without professional product line', () => {
    const validation = validateStructuredResearchIdentityMatch({
      record: buildRecord({
        productLine: null,
        productName: 'Stressmanager',
        nutrientMatrix: {
          ...buildRecord().nutrientMatrix,
          magnesium: 11,
          sulfur: 16.4,
          calcium: 6.6,
          iron: 0,
        },
      }),
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: {
        url: 'https://example.test/stressmanager',
        title: 'Stressmanager',
        category: 'official_manufacturer',
      },
    })

    expect(validation.identityMatchAccepted).toBe(false)
    expect(validation.rejectionReason).toBe('product_line_mismatch')
  })

  it('rejects matching name with conflicting known npk', () => {
    expect(
      npkTripletsCompatible(
        { nitrogen: 0, phosphate: 0, potash: 30 },
        { nitrogen: 11, phosphate: 5, potash: 5 },
      ),
    ).toBe(false)

    const validation = validateStructuredResearchIdentityMatch({
      record: buildRecord({
        npk: { nitrogen: 11, phosphate: 5, potash: 5 },
      }),
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: verifiedProfessionalSource(),
    })

    expect(validation.identityMatchAccepted).toBe(false)
    expect(validation.rejectionReason).toBe('npk_mismatch')
  })

  it('accepts professional stress-manager with matching npk and verified source', () => {
    const source = verifiedProfessionalSource()
    const validation = validateStructuredResearchIdentityMatch({
      record: buildRecord(),
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: source,
      selection: buildManufacturerSearchSelectionFromEvidence({
        identity: IDENTITY,
        npkLabel: '0-0-30',
        candidates: [
          {
            url: source.url,
            title: source.title,
            trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30',
          },
        ],
      }),
    })

    expect(validation.identityMatchAccepted).toBe(true)
    expect(validation.sourceBoundIdentityAccepted).toBe(true)
    expect(validation.rejectionReason).toBe('none')
  })

  it('requires product line overlap when expected line is present', () => {
    expect(productLinesCompatible('Professional', 'Professional')).toBe(true)
    expect(productLinesCompatible('Professional', 'Standard')).toBe(false)
    expect(productLinesCompatible('Professional', null)).toBe(false)
  })
})
