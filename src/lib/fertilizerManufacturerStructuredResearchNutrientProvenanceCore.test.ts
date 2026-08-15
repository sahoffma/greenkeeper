import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import {
  mapStructuredResearchToAdapterResult,
  type ManufacturerStructuredResearchRecord,
  type ManufacturerStructuredResearchSourceRecord,
} from './fertilizerManufacturerStructuredResearchCore'
import { validateStructuredResearchNutrientProvenance } from './fertilizerManufacturerStructuredResearchNutrientProvenanceCore'

const IDENTITY: FertilizerEnrichmentIdentity = {
  manufacturer: 'Rasendoktor GmbH',
  officialName: 'Stress-Manager',
  productLine: 'Professional',
  variant: '0-0-30',
  identityFingerprint: 'fp',
  identityConfidence: 1,
  hasIdentityAmbiguity: false,
}

function professionalSource(): ManufacturerStructuredResearchSourceRecord {
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

function standardSource(): ManufacturerStructuredResearchSourceRecord {
  return {
    url: 'https://example.test/stressmanager-standard',
    title: 'Stressmanager Standard',
    category: 'official_manufacturer',
    sourceIdentity: {
      manufacturer: 'Rasendoktor',
      productLine: 'Standard',
      productName: 'Stressmanager',
      npkLabel: '11-5-5',
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
    sources: [professionalSource()],
    ...overrides,
  }
}

function alternateNpkVariantSource(): ManufacturerStructuredResearchSourceRecord {
  return {
    url: 'https://example.test/stressmanager-0-0-22',
    title: 'Stressmanager 0-0-22',
    category: 'official_manufacturer',
    sourceIdentity: {
      manufacturer: 'Rasendoktor',
      productLine: null,
      productName: 'Stressmanager',
      npkLabel: '0-0-22',
    },
  }
}

describe('fertilizerManufacturerStructuredResearchNutrientProvenanceCore', () => {
  it('rejects sources whose npk triplet differs from the recognized identity', () => {
    const validation = validateStructuredResearchNutrientProvenance({
      record: buildRecord({
        sources: [professionalSource(), alternateNpkVariantSource()],
      }),
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: professionalSource(),
      primarySourceIndex: 0,
      recordProductLineMatchesExpected: true,
      recordNpkCompatible: true,
    })

    expect(validation.accepted).toBe(false)
    expect(validation.mixedVariantNutrientSourceDetected).toBe(true)
    expect(validation.rejectionReason).toBe('mixed_variant_sources')
  })

  it('does not accept any nutrient values from a single npk-mismatched source', () => {
    const adapterResult = mapStructuredResearchToAdapterResult({
      record: buildRecord({
        sources: [alternateNpkVariantSource()],
      }),
      identity: IDENTITY,
      retrievedAt: '2026-07-29T10:00:00.000Z',
      npkLabel: '0-0-30',
    })

    expect(adapterResult).toBeNull()
  })

  it('rejects mixed variant sources before nutrients are accepted', () => {
    const record = buildRecord({
      sources: [professionalSource(), standardSource()],
    })

    const validation = validateStructuredResearchNutrientProvenance({
      record,
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: professionalSource(),
      primarySourceIndex: 0,
      recordProductLineMatchesExpected: true,
      recordNpkCompatible: true,
    })

    expect(validation.accepted).toBe(false)
    expect(validation.mixedVariantNutrientSourceDetected).toBe(true)
    expect(validation.rejectionReason).toBe('mixed_variant_sources')
  })

  it('rejects sulfur from unverified source when multiple sources are present', () => {
    const base = buildRecord()
    const record = buildRecord({
      nutrientMatrix: {
        ...base.nutrientMatrix,
        sulfur: 16.4,
      },
      sources: [professionalSource(), standardSource()],
      nutrientSourceIndices: Object.fromEntries(
        Object.keys(base.nutrientMatrix).map((key) => [
          key,
          key === 'sulfur' ||
          key === 'nitrogen' ||
          key === 'phosphate' ||
          key === 'potash'
            ? key === 'sulfur'
              ? 1
              : 0
            : 0,
        ]),
      ) as ManufacturerStructuredResearchRecord['nutrientSourceIndices'],
    })

    const validation = validateStructuredResearchNutrientProvenance({
      record,
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: professionalSource(),
      primarySourceIndex: 0,
      recordProductLineMatchesExpected: true,
      recordNpkCompatible: true,
    })

    expect(validation.accepted).toBe(false)
    expect(validation.mixedVariantNutrientSourceDetected).toBe(true)
  })

  it('accepts all nutrients from a single verified source', () => {
    const validation = validateStructuredResearchNutrientProvenance({
      record: buildRecord(),
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: professionalSource(),
      primarySourceIndex: 0,
      recordProductLineMatchesExpected: true,
      recordNpkCompatible: true,
    })

    expect(validation.accepted).toBe(true)
    expect(validation.sulfurSourceMatchesCanonicalDeclarationSource).toBe(true)
  })

  it('does not map sulfur 16.4 when provenance rejects mixed sources', () => {
    const adapterResult = mapStructuredResearchToAdapterResult({
      record: buildRecord({
        nutrientMatrix: {
          ...buildRecord().nutrientMatrix,
          sulfur: 16.4,
        },
        sources: [professionalSource(), standardSource()],
      }),
      identity: IDENTITY,
      retrievedAt: '2026-07-29T10:00:00.000Z',
      npkLabel: '0-0-30',
    })

    expect(adapterResult).toBeNull()
  })

  it('keeps professional sulfur 10.2 S through adapter mapping', () => {
    const adapterResult = mapStructuredResearchToAdapterResult({
      record: buildRecord(),
      identity: IDENTITY,
      retrievedAt: '2026-07-29T10:00:00.000Z',
      npkLabel: '0-0-30',
    })

    expect(adapterResult?.status).toBe('success')
    if (adapterResult?.status === 'success' || adapterResult?.status === 'partial') {
      expect(
        adapterResult.extraction?.extractedNutrients?.find((entry) => entry.key === 'sulfur'),
      ).toEqual({
        key: 'sulfur',
        value: 10.2,
        declarationBasis: 'S',
        unit: '%',
      })
    }
  })
})
