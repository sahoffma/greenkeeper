import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type { FertilizerNutrientMatrixKey } from '../types/fertilizerReadiness'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerReadiness'
import type { FertilizerManufacturerResearchFetchProvider } from './fertilizerManufacturerResearchCore'
import {
  scoreManufacturerSearchCandidates,
  type ManufacturerSearchCandidate,
  type ManufacturerSearchTrustedEvidenceKind,
} from './fertilizerManufacturerSearchCandidateCore'
import { resolveExpectedStructuredResearchNpk } from './fertilizerManufacturerStructuredResearchIdentityCore'

export type ManufacturerSearchCandidateFetchOutcome =
  | 'not_needed'
  | 'success'
  | 'failed'

export type ManufacturerSearchCandidateEvidenceOrigin =
  | 'url_citation'
  | 'url_citation_excerpt'
  | 'web_search_source_url'
  | 'fetched_body'

export interface EnrichedManufacturerSearchCandidate extends ManufacturerSearchCandidate {
  evidenceOrigin: ManufacturerSearchCandidateEvidenceOrigin
  fetchAttempted: boolean
  fetchOutcome: ManufacturerSearchCandidateFetchOutcome
  fetchedBodyText: string | null
}

function resolveEvidenceOrigin(
  kinds: readonly ManufacturerSearchTrustedEvidenceKind[],
): ManufacturerSearchCandidateEvidenceOrigin {
  if (kinds.includes('url_citation_excerpt')) {
    return 'url_citation_excerpt'
  }
  if (kinds.includes('url_citation')) {
    return 'url_citation'
  }
  if (kinds.includes('web_search_source_url')) {
    return 'web_search_source_url'
  }
  return 'fetched_body'
}

function candidateIdentityEvidenceComplete(input: {
  candidate: Pick<
    ManufacturerSearchCandidate,
    | 'manufacturerEvidence'
    | 'productNameEvidence'
    | 'productLineEvidence'
    | 'npkEvidence'
  >
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
}): boolean {
  const expectedProductLinePresent = Boolean(input.identity.productLine?.trim())
  const expectedNpk = resolveExpectedStructuredResearchNpk(input)

  if (input.candidate.manufacturerEvidence === 'mismatch') {
    return false
  }
  if (input.candidate.productNameEvidence === 'mismatch') {
    return false
  }
  if (expectedProductLinePresent && input.candidate.productLineEvidence !== 'match') {
    return false
  }
  if (expectedNpk != null && input.candidate.npkEvidence !== 'match') {
    return false
  }

  return true
}

function rescoreCandidateFromEvidenceText(input: {
  candidate: EnrichedManufacturerSearchCandidate
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
}): EnrichedManufacturerSearchCandidate {
  const scored = scoreManufacturerSearchCandidates({
    candidates: [input.candidate],
    identity: input.identity,
    npkLabel: input.npkLabel,
  })[0]

  if (!scored) {
    return input.candidate
  }

  return {
    ...input.candidate,
    ...scored,
  }
}

export function enrichManufacturerSearchCandidatesWithFetchedEvidence(input: {
  candidates: ManufacturerSearchCandidate[]
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
  fetchProvider: FertilizerManufacturerResearchFetchProvider
  timeoutMs?: number
}): Promise<EnrichedManufacturerSearchCandidate[]> {
  return Promise.all(
    input.candidates.map(async (candidate) => {
      const enrichedBase: EnrichedManufacturerSearchCandidate = {
        ...candidate,
        evidenceOrigin: resolveEvidenceOrigin(candidate.trustedEvidenceKinds),
        fetchAttempted: false,
        fetchOutcome: 'not_needed',
        fetchedBodyText: null,
      }

      if (candidateIdentityEvidenceComplete({ candidate, identity: input.identity, npkLabel: input.npkLabel })) {
        return enrichedBase
      }

      const fetchResult = await input.fetchProvider.fetchSource(candidate.url, {
        timeoutMs: input.timeoutMs,
      })

      const enriched: EnrichedManufacturerSearchCandidate = {
        ...enrichedBase,
        fetchAttempted: true,
        fetchOutcome: fetchResult.ok ? 'success' : 'failed',
        fetchedBodyText:
          fetchResult.ok && fetchResult.text?.trim() ? fetchResult.text : null,
      }

      if (!enriched.fetchedBodyText) {
        return rescoreCandidateFromEvidenceText({
          candidate: enriched,
          identity: input.identity,
          npkLabel: input.npkLabel,
        })
      }

      const mergedEvidenceText = `${enriched.trustedEvidenceText} ${enriched.fetchedBodyText}`
      return rescoreCandidateFromEvidenceText({
        candidate: {
          ...enriched,
          trustedEvidenceText: mergedEvidenceText.trim(),
          trustedEvidenceKinds: [...enriched.trustedEvidenceKinds, 'web_search_source_url'],
          evidenceOrigin: 'fetched_body',
          citationVerified: true,
        },
        identity: input.identity,
        npkLabel: input.npkLabel,
      })
    }),
  )
}

function buildValuePatterns(value: number): string[] {
  const patterns = new Set<string>()
  patterns.add(String(value))
  patterns.add(value.toFixed(1))
  patterns.add(value.toFixed(2))
  patterns.add(value.toFixed(1).replace('.', ','))
  patterns.add(value.toFixed(2).replace('.', ','))
  return [...patterns].filter(Boolean)
}

export function verifyNutrientValuePresentInSourceText(input: {
  sourceText: string
  nutrientKey: FertilizerNutrientMatrixKey
  value: number
}): boolean {
  const normalized = input.sourceText.toLowerCase()
  return buildValuePatterns(input.value).some((pattern) => normalized.includes(pattern.toLowerCase()))
}

export function filterAcceptedNutrientKeysBySourceEvidence(input: {
  nutrientMatrix: Partial<Record<FertilizerNutrientMatrixKey, number | null>>
  sourceText: string
  acceptedNutrientKeys: readonly FertilizerNutrientMatrixKey[]
}): FertilizerNutrientMatrixKey[] {
  return input.acceptedNutrientKeys.filter((key) => {
    const value = input.nutrientMatrix[key]
    if (typeof value !== 'number') {
      return false
    }

    return verifyNutrientValuePresentInSourceText({
      sourceText: input.sourceText,
      nutrientKey: key,
      value,
    })
  })
}

export function countPositiveNutrientsInMatrix(
  nutrientMatrix: Partial<Record<FertilizerNutrientMatrixKey, number | null>>,
): number {
  return FERTILIZER_NUTRIENT_MATRIX_KEYS.filter(
    (key) => typeof nutrientMatrix[key] === 'number' && (nutrientMatrix[key] as number) > 0,
  ).length
}
