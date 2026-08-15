import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import {
  buildManufacturerSearchSelectionFromEvidence,
  buildManufacturerSearchNutrientBindings,
  buildManufacturerSearchResearchDecision,
  extractTrustedWebSearchCandidatesFromResponseOutput,
  scoreManufacturerSearchCandidates,
  selectCanonicalManufacturerSearchCandidate,
  type ManufacturerSearchCandidate,
  type ManufacturerSearchCandidateSelection,
} from './fertilizerManufacturerSearchCandidateCore'
import type { ManufacturerStructuredResearchRecord } from './fertilizerManufacturerStructuredResearchCore'

const PROFESSIONAL_IDENTITY: FertilizerEnrichmentIdentity = {
  manufacturer: 'Rasendoktor GmbH',
  officialName: 'Stress-Manager',
  productLine: 'Professional',
  variant: '0-0-30',
  identityFingerprint: 'fp-professional',
  identityConfidence: 1,
  hasIdentityAmbiguity: false,
}

const AMBIGUOUS_IDENTITY: FertilizerEnrichmentIdentity = {
  manufacturer: 'Rasendoktor GmbH',
  officialName: 'Stressmanager',
  productLine: null,
  variant: null,
  identityFingerprint: 'fp-ambiguous',
  identityConfidence: 0.8,
  hasIdentityAmbiguity: true,
}

function buildRawCandidate(input: {
  url: string
  title: string
  trustedEvidenceText: string
  officialDomainMatch?: boolean
}): ManufacturerSearchCandidate {
  return {
    candidateId: input.url,
    url: input.url,
    title: input.title,
    trustedEvidenceText: input.trustedEvidenceText,
    trustedEvidenceKinds: ['url_citation_excerpt'],
    domain: 'rasendoktor.de',
    officialDomainMatch: input.officialDomainMatch ?? true,
    citationVerified: true,
    manufacturerEvidence: 'unknown',
    productNameEvidence: 'unknown',
    productLineEvidence: 'unknown',
    npkEvidence: 'unknown',
    identityScore: 0,
    hardRejected: false,
    rejectionReason: null,
  }
}

function buildTestSearchSelection(input: {
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string
  candidates: Array<{
    url: string
    title: string
    trustedEvidenceText: string
    officialDomainMatch?: boolean
  }>
}): ManufacturerSearchCandidateSelection {
  return buildManufacturerSearchSelectionFromEvidence(input)
}

function buildMockResponseOutput(candidates: Array<{ url: string; title: string; excerpt: string }>) {
  const text = candidates.map((candidate) => candidate.excerpt).join(' ')
  let cursor = 0
  const annotations = candidates.map((candidate) => {
    const startIndex = cursor
    const endIndex = startIndex + candidate.excerpt.length
    cursor = endIndex + 1
    return {
      type: 'url_citation',
      url: candidate.url,
      title: candidate.title,
      start_index: startIndex,
      end_index: endIndex,
    }
  })

  return [
    {
      type: 'web_search_call',
      action: {
        type: 'search',
        queries: ['site:rasendoktor.de Professional "Stress-Manager" 0-0-30'],
        sources: candidates.map((candidate) => ({ type: 'url', url: candidate.url })),
      },
    },
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text,
          annotations,
        },
      ],
    },
  ]
}

function buildStressRecord(
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
      magnesium: null,
      calcium: null,
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
    sources: [
      {
        url: 'https://www.rasendoktor.de/professional/stress-manager-0-0-30',
        title: 'Professional Stress-Manager 0-0-30',
        category: 'official_manufacturer',
        sourceIdentity: {
          manufacturer: 'Rasendoktor',
          productLine: 'Professional',
          productName: 'Stress-Manager',
          npkLabel: '0-0-30',
        },
      },
    ],
    ...overrides,
  }
}

describe('fertilizerManufacturerSearchCandidateCore', () => {
  it('A hard rejects standard 0-0-22 when professional 0-0-30 is expected', () => {
    const [candidate] = scoreManufacturerSearchCandidates({
      candidates: [
        buildRawCandidate({
          url: 'https://www.rasendoktor.de/duenger/stressmanager',
          title: 'Stressmanager Standard',
          trustedEvidenceText:
            'rasendoktor stressmanager standard npk 0 0 22 sulfur 16.4',
        }),
      ],
      identity: PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
    })

    expect(candidate?.hardRejected).toBe(true)
    expect(candidate?.rejectionReason).toBe('npk_mismatch')
  })

  it('B accepts unspecific url/title when citation excerpt confirms professional 0-0-30', () => {
    const selection = buildTestSearchSelection({
      identity: PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: 'https://www.rasendoktor.de/kalium-rasenduenger-mit-spurennaehrstoffen/',
          title: 'Kalium-Rasendünger mit Spurennährstoffen',
          trustedEvidenceText:
            'rasendoktor professional stress manager npk 0 0 30 kalium rasenduenger mit spurennaehrstoffen',
        },
      ],
    })

    expect(selection.canonicalCandidate?.candidateId).toBe(
      'https://www.rasendoktor.de/kalium-rasenduenger-mit-spurennaehrstoffen/',
    )
    expect(selection.canonicalCandidate?.hardRejected).toBe(false)
    expect(selection.canonicalCandidate?.productLineEvidence).toBe('match')
    expect(selection.canonicalCandidate?.npkEvidence).toBe('match')
  })

  it('C rejects when trusted evidence contains only standard variant', () => {
    const selection = buildTestSearchSelection({
      identity: PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: 'https://www.rasendoktor.de/duenger/stressmanager',
          title: 'Stressmanager',
          trustedEvidenceText: 'rasendoktor standard stressmanager npk 0 0 22',
        },
      ],
    })

    expect(selection.canonicalCandidate).toBeNull()
    expect(selection.candidates[0]?.hardRejected).toBe(true)
  })

  it('D selects professional canonical and does not reject the whole run for mixed variants', () => {
    const selection = buildTestSearchSelection({
      identity: PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: 'https://www.rasendoktor.de/duenger/stressmanager-standard',
          title: 'Stressmanager Standard',
          trustedEvidenceText: 'rasendoktor standard stressmanager npk 0 0 22 sulfur 16.4',
        },
        {
          url: 'https://www.rasendoktor.de/professional/stress-manager-0-0-30',
          title: 'Professional Stress-Manager',
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30 sulfur 10.2',
        },
      ],
    })

    expect(selection.candidates.find((candidate) => candidate.url.includes('standard'))?.hardRejected).toBe(
      true,
    )
    expect(selection.canonicalCandidate?.url).toContain('professional/stress-manager-0-0-30')
    expect(selection.verifiedVariantCount).toBe(1)
    expect(selection.candidateAmbiguity).toBe(false)
  })

  it('E rejects model professional claim when trusted candidate is standard', () => {
    const selection = buildTestSearchSelection({
      identity: PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: 'https://www.rasendoktor.de/duenger/stressmanager',
          title: 'Stressmanager',
          trustedEvidenceText: 'rasendoktor standard stressmanager npk 0 0 22',
        },
      ],
    })

    const record = buildStressRecord({
      sources: [
        {
          url: 'https://www.rasendoktor.de/duenger/stressmanager',
          title: 'Stressmanager',
          category: 'official_manufacturer',
          sourceIdentity: {
            manufacturer: 'Rasendoktor',
            productLine: 'Professional',
            productName: 'Stress-Manager',
            npkLabel: '0-0-30',
          },
        },
      ],
    })

    const bindings = buildManufacturerSearchNutrientBindings({ record, selection })
    const decision = buildManufacturerSearchResearchDecision({ selection, nutrientBindings: bindings })

    expect(decision.accepted).toBe(false)
    expect(selection.canonicalCandidate).toBeNull()
  })

  it('F rejects sulfur 16.4 bound to rejected standard candidate', () => {
    const selection = buildTestSearchSelection({
      identity: PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: 'https://www.rasendoktor.de/duenger/stressmanager-standard',
          title: 'Stressmanager Standard',
          trustedEvidenceText: 'rasendoktor standard stressmanager npk 0 0 22 sulfur 16.4',
        },
        {
          url: 'https://www.rasendoktor.de/professional/stress-manager-0-0-30',
          title: 'Professional Stress-Manager',
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30 sulfur 10.2',
        },
      ],
    })

    const record = buildStressRecord({
      nutrientMatrix: {
        ...buildStressRecord().nutrientMatrix,
        sulfur: 16.4,
      },
      sources: [
        {
          url: 'https://www.rasendoktor.de/professional/stress-manager-0-0-30',
          title: 'Professional Stress-Manager',
          category: 'official_manufacturer',
          sourceIdentity: null,
        },
        {
          url: 'https://www.rasendoktor.de/duenger/stressmanager-standard',
          title: 'Stressmanager Standard',
          category: 'official_manufacturer',
          sourceIdentity: null,
        },
      ],
      nutrientSourceIndices: {
        sulfur: 1,
      },
    })

    const bindings = buildManufacturerSearchNutrientBindings({ record, selection })
    const sulfurBinding = bindings.find((binding) => binding.nutrientKey === 'sulfur')
    const decision = buildManufacturerSearchResearchDecision({ selection, nutrientBindings: bindings })

    expect(sulfurBinding?.accepted).toBe(false)
    expect(decision.accepted).toBe(false)
    expect(decision.reason).toBe('nutrient_not_bound_to_canonical_candidate')
  })

  it('G accepts nutrient bindings from professional canonical candidate', () => {
    const selection = buildTestSearchSelection({
      identity: PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: 'https://www.rasendoktor.de/professional/stress-manager-0-0-30',
          title: 'Professional Stress-Manager',
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30 sulfur 10.2 iron 3',
        },
      ],
    })

    const record = buildStressRecord()
    const bindings = buildManufacturerSearchNutrientBindings({ record, selection })
    const decision = buildManufacturerSearchResearchDecision({ selection, nutrientBindings: bindings })

    expect(decision.accepted).toBe(true)
    expect(bindings.find((binding) => binding.nutrientKey === 'sulfur')?.accepted).toBe(true)
    expect(bindings.find((binding) => binding.nutrientKey === 'iron')?.accepted).toBe(true)
  })

  it('H allows two verified sources of the same variant together', () => {
    const selection = buildTestSearchSelection({
      identity: PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      candidates: [
        {
          url: 'https://www.rasendoktor.de/professional/stress-manager-0-0-30',
          title: 'Professional Stress-Manager',
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30',
        },
        {
          url: 'https://www.rasendoktor.de/professional/stress-manager-datasheet.pdf',
          title: 'Produktdatenblatt Stress-Manager',
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30 sulfur 10.2',
        },
      ],
    })

    const record = buildStressRecord({
      sources: [
        {
          url: 'https://www.rasendoktor.de/professional/stress-manager-0-0-30',
          title: 'Professional Stress-Manager',
          category: 'official_manufacturer',
          sourceIdentity: null,
        },
        {
          url: 'https://www.rasendoktor.de/professional/stress-manager-datasheet.pdf',
          title: 'Produktdatenblatt Stress-Manager',
          category: 'official_document',
          sourceIdentity: null,
        },
      ],
      nutrientSourceIndices: {
        sulfur: 1,
        iron: 1,
      },
    })

    const bindings = buildManufacturerSearchNutrientBindings({ record, selection })
    const decision = buildManufacturerSearchResearchDecision({ selection, nutrientBindings: bindings })

    expect(decision.accepted).toBe(true)
    expect(bindings.find((binding) => binding.nutrientKey === 'sulfur')?.accepted).toBe(true)
  })

  it('I returns no canonical candidate when nothing is citation verified', () => {
    const candidates = extractTrustedWebSearchCandidatesFromResponseOutput({
      output: [],
      manufacturerDomain: 'rasendoktor.de',
    })

    const selection = selectCanonicalManufacturerSearchCandidate({
      candidates,
      identity: PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
    })

    expect(selection.canonicalCandidate).toBeNull()
    expect(selection.canonicalSelectionReason).toBe('no_eligible_candidate')
  })

  it('J simulates reference case with standard rejected and professional accepted', () => {
    const standardUrl = 'https://www.rasendoktor.de/duenger/stressmanager-standard'
    const professionalUrl = 'https://www.rasendoktor.de/professional/stress-manager-0-0-30'
    const output = buildMockResponseOutput([
      {
        url: standardUrl,
        title: 'Stressmanager Standard',
        excerpt: 'Rasendoktor Standard Stressmanager NPK 0-0-22 Schwefel 16.4',
      },
      {
        url: professionalUrl,
        title: 'Professional Stress-Manager',
        excerpt: 'Rasendoktor Professional Stress-Manager NPK 0-0-30 Schwefel 10.2',
      },
    ])

    const selection = selectCanonicalManufacturerSearchCandidate({
      candidates: extractTrustedWebSearchCandidatesFromResponseOutput({
        output,
        manufacturerDomain: 'rasendoktor.de',
      }),
      identity: PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
    })

    const record = buildStressRecord({
      sources: [
        {
          url: professionalUrl,
          title: 'Professional Stress-Manager',
          category: 'official_manufacturer',
          sourceIdentity: {
            manufacturer: 'Rasendoktor',
            productLine: 'Professional',
            productName: 'Stress-Manager',
            npkLabel: '0-0-30',
          },
        },
        {
          url: standardUrl,
          title: 'Stressmanager Standard',
          category: 'official_manufacturer',
          sourceIdentity: {
            manufacturer: 'Rasendoktor',
            productLine: 'Standard',
            productName: 'Stressmanager',
            npkLabel: '0-0-22',
          },
        },
      ],
      nutrientSourceIndices: {
        sulfur: 0,
      },
    })

    const bindings = buildManufacturerSearchNutrientBindings({ record, selection })
    const decision = buildManufacturerSearchResearchDecision({ selection, nutrientBindings: bindings })

    expect(selection.candidates.find((candidate) => candidate.url === standardUrl)?.hardRejected).toBe(true)
    expect(selection.canonicalCandidate?.url).toBe(professionalUrl)
    expect(bindings.find((binding) => binding.nutrientKey === 'sulfur')?.accepted).toBe(true)
    expect(decision.accepted).toBe(true)
    expect(decision.reason).toBe('canonical_candidate_verified')
  })

  it('marks candidate ambiguity when input is ambiguous and two verified variants exist', () => {
    const selection = buildTestSearchSelection({
      identity: AMBIGUOUS_IDENTITY,
      candidates: [
        {
          url: 'https://www.rasendoktor.de/duenger/stressmanager-standard',
          title: 'Stressmanager Standard',
          trustedEvidenceText: 'rasendoktor stressmanager npk 0 0 22',
        },
        {
          url: 'https://www.rasendoktor.de/professional/stress-manager-0-0-30',
          title: 'Professional Stress-Manager',
          trustedEvidenceText: 'rasendoktor professional stress manager npk 0 0 30',
        },
      ],
    })

    expect(selection.verifiedVariantCount).toBe(2)
    expect(selection.candidateAmbiguity).toBe(true)
  })
})
