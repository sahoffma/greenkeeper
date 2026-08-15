import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import {
  mapStructuredResearchToAdapterResult,
  type ManufacturerStructuredResearchRecord,
  type ManufacturerStructuredResearchSourceRecord,
} from './fertilizerManufacturerStructuredResearchCore'
import { validateStructuredResearchNutrientProvenance } from './fertilizerManufacturerStructuredResearchNutrientProvenanceCore'
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
      npkLabel: '0-0-22',
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
  it('does not reject the whole run when an alternate npk source exists but nutrients stay canonical', () => {
    const selection = buildManufacturerSearchSelectionFromEvidence({
      identity: IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: professionalSource().url,
          title: professionalSource().title,
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30',
        },
        {
          url: alternateNpkVariantSource().url,
          title: alternateNpkVariantSource().title,
          trustedEvidenceText: 'rasendoktor stressmanager npk 0 0 22',
        },
      ],
    })

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
      selection,
    })

    expect(validation.accepted).toBe(true)
    expect(validation.mixedVariantNutrientSourceDetected).toBe(false)
  })

  it('does not accept any nutrient values from a single npk-mismatched source', () => {
    const selection = buildManufacturerSearchSelectionFromEvidence({
      identity: IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: alternateNpkVariantSource().url,
          title: alternateNpkVariantSource().title,
          trustedEvidenceText: 'rasendoktor stressmanager npk 0 0 22',
        },
      ],
    })

    const adapterResult = mapStructuredResearchToAdapterResult({
      record: buildRecord({
        sources: [alternateNpkVariantSource()],
      }),
      identity: IDENTITY,
      retrievedAt: '2026-07-29T10:00:00.000Z',
      npkLabel: '0-0-30',
      selection,
    })

    expect(adapterResult).toBeNull()
  })

  it('rejects nutrients bound to a hard-rejected standard source', () => {
    const selection = buildManufacturerSearchSelectionFromEvidence({
      identity: IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: professionalSource().url,
          title: professionalSource().title,
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30',
        },
        {
          url: standardSource().url,
          title: standardSource().title,
          trustedEvidenceText: 'rasendoktor standard stressmanager npk 0 0 22 sulfur 16.4',
        },
      ],
    })

    const record = buildRecord({
      sources: [professionalSource(), standardSource()],
      nutrientSourceIndices: {
        sulfur: 1,
      },
    })

    const validation = validateStructuredResearchNutrientProvenance({
      record,
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: professionalSource(),
      primarySourceIndex: 0,
      recordProductLineMatchesExpected: true,
      recordNpkCompatible: true,
      selection,
    })

    expect(validation.accepted).toBe(false)
    expect(validation.mixedVariantNutrientSourceDetected).toBe(true)
    expect(validation.rejectionReason).toBe('mixed_variant_sources')
  })

  it('rejects sulfur from unverified source when sulfur binds to rejected standard candidate', () => {
    const base = buildRecord()
    const selection = buildManufacturerSearchSelectionFromEvidence({
      identity: IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: professionalSource().url,
          title: professionalSource().title,
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30',
        },
        {
          url: standardSource().url,
          title: standardSource().title,
          trustedEvidenceText: 'rasendoktor standard stressmanager npk 0 0 22 sulfur 16.4',
        },
      ],
    })
    const record = buildRecord({
      nutrientMatrix: {
        ...base.nutrientMatrix,
        sulfur: 16.4,
      },
      sources: [professionalSource(), standardSource()],
      nutrientSourceIndices: Object.fromEntries(
        Object.keys(base.nutrientMatrix).map((key) => [
          key,
          key === 'sulfur' ? 1 : 0,
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
      selection,
    })

    expect(validation.accepted).toBe(false)
    expect(validation.mixedVariantNutrientSourceDetected).toBe(true)
  })

  it('accepts all nutrients from a single verified source', () => {
    const selection = buildManufacturerSearchSelectionFromEvidence({
      identity: IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: professionalSource().url,
          title: professionalSource().title,
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30 sulfur 10.2',
        },
      ],
    })

    const validation = validateStructuredResearchNutrientProvenance({
      record: buildRecord(),
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: professionalSource(),
      primarySourceIndex: 0,
      recordProductLineMatchesExpected: true,
      recordNpkCompatible: true,
      selection,
    })

    expect(validation.accepted).toBe(true)
    expect(validation.sulfurSourceMatchesCanonicalDeclarationSource).toBe(true)
  })

  it('does not map sulfur 16.4 when provenance rejects mixed sources', () => {
    const selection = buildManufacturerSearchSelectionFromEvidence({
      identity: IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: professionalSource().url,
          title: professionalSource().title,
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30',
        },
        {
          url: standardSource().url,
          title: standardSource().title,
          trustedEvidenceText: 'rasendoktor standard stressmanager npk 0 0 22 sulfur 16.4',
        },
      ],
    })

    const adapterResult = mapStructuredResearchToAdapterResult({
      record: buildRecord({
        nutrientMatrix: {
          ...buildRecord().nutrientMatrix,
          sulfur: 16.4,
        },
        sources: [professionalSource(), standardSource()],
        nutrientSourceIndices: { sulfur: 1 },
      }),
      identity: IDENTITY,
      retrievedAt: '2026-07-29T10:00:00.000Z',
      npkLabel: '0-0-30',
      selection,
    })

    expect(adapterResult).toBeNull()
  })

  it('keeps professional sulfur 10.2 S through adapter mapping', () => {
    const selection = buildManufacturerSearchSelectionFromEvidence({
      identity: IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: professionalSource().url,
          title: professionalSource().title,
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30 sulfur 10.2',
        },
      ],
    })

    const adapterResult = mapStructuredResearchToAdapterResult({
      record: buildRecord(),
      identity: IDENTITY,
      retrievedAt: '2026-07-29T10:00:00.000Z',
      npkLabel: '0-0-30',
      selection,
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

  it('rejects live standard stressmanager source when model fakes professional 0-0-30 identity', () => {
    const liveStandardSource: ManufacturerStructuredResearchSourceRecord = {
      url: 'https://www.rasendoktor.de/duenger/rasenduenger/kalium-spezial-rasenduenger-stressmanager/',
      title: 'Kalium Spezial-Rasendünger "Stressmanager"',
      category: 'official_document',
      sourceIdentity: {
        manufacturer: 'Rasendoktor',
        productLine: 'Professional',
        productName: 'Stress Manager',
        npkLabel: '0-0-30',
      },
    }

    const selection = buildManufacturerSearchSelectionFromEvidence({
      identity: IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: liveStandardSource.url,
          title: liveStandardSource.title,
          trustedEvidenceText:
            'rasendoktor standard stressmanager kalium spezial rasenduenger npk 0 0 22 sulfur 16.4',
        },
      ],
    })

    const base = buildRecord()
    const record = buildRecord({
      nutrientMatrix: {
        ...base.nutrientMatrix,
        sulfur: 16.4,
      },
      sources: [liveStandardSource],
      nutrientSourceIndices: {
        ...base.nutrientSourceIndices,
        sulfur: 0,
      },
    })

    const validation = validateStructuredResearchNutrientProvenance({
      record,
      identity: IDENTITY,
      npkLabel: '0-0-30',
      primarySource: liveStandardSource,
      primarySourceIndex: 0,
      recordProductLineMatchesExpected: true,
      recordNpkCompatible: true,
      selection,
    })

    expect(validation.accepted).toBe(false)
    expect(validation.sulfurSourceIdentityVerified).toBe(false)

    const adapterResult = mapStructuredResearchToAdapterResult({
      record,
      identity: IDENTITY,
      retrievedAt: '2026-08-15T09:58:00.000Z',
      npkLabel: '0-0-30',
      selection,
    })

    expect(adapterResult).toBeNull()
  })
})
