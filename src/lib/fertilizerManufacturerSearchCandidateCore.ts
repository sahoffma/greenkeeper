import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type { FertilizerNutrientMatrixKey } from '../types/fertilizerReadiness'
import { validateFertilizerManufacturerDocumentSource } from './fertilizerManufacturerDocumentSourceValidatorCore'
import {
  buildManufacturerBrandToken,
  buildProductNameSearchVariants,
  normalizeResearchToken,
} from './fertilizerManufacturerResearchQueryCore'
import {
  npkTripletsCompatible,
  resolveExpectedStructuredResearchNpk,
} from './fertilizerManufacturerStructuredResearchIdentityCore'
import {
  sourceTextEvidencesProductLine,
} from './fertilizerManufacturerStructuredResearchSourceIdentityCore'

export type ManufacturerSearchEvidenceLevel = 'match' | 'unknown' | 'mismatch'

export type ManufacturerSearchTrustedEvidenceKind =
  | 'web_search_source_url'
  | 'url_citation'
  | 'url_citation_excerpt'

export interface ManufacturerSearchCandidate {
  candidateId: string
  url: string
  title: string | null
  trustedEvidenceText: string
  trustedEvidenceKinds: ManufacturerSearchTrustedEvidenceKind[]
  domain: string | null
  officialDomainMatch: boolean
  citationVerified: boolean
  manufacturerEvidence: ManufacturerSearchEvidenceLevel
  productNameEvidence: ManufacturerSearchEvidenceLevel
  productLineEvidence: ManufacturerSearchEvidenceLevel
  npkEvidence: ManufacturerSearchEvidenceLevel
  identityScore: number
  hardRejected: boolean
  rejectionReason: string | null
}

export interface ManufacturerSearchCandidateSelection {
  candidates: ManufacturerSearchCandidate[]
  canonicalCandidate: ManufacturerSearchCandidate | null
  canonicalSelectionReason: string | null
  candidateAmbiguity: boolean
  verifiedVariantCount: number
  citationVerifiedUrls: string[]
}

export interface ManufacturerSearchNutrientBinding {
  nutrientKey: FertilizerNutrientMatrixKey
  candidateId: string | null
  accepted: boolean
}

export interface ManufacturerSearchResearchDecision {
  accepted: boolean
  reason: string
  nutrientSourceBindings: ManufacturerSearchNutrientBinding[]
}

interface MutableCandidateAccumulator {
  candidateId: string
  url: string
  title: string | null
  evidenceParts: string[]
  trustedEvidenceKinds: Set<ManufacturerSearchTrustedEvidenceKind>
  domain: string | null
  officialDomainMatch: boolean
  citationVerified: boolean
}

function normalizeComparable(value: string | null | undefined): string {
  return normalizeResearchToken(value).replace(/\s+/g, ' ')
}

function normalizeCandidateUrl(url: string): string | null {
  const validation = validateFertilizerManufacturerDocumentSource(url)
  return validation.status === 'valid' ? validation.normalizedUrl : null
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return null
  }
}

function domainMatchesManufacturer(domain: string | null, manufacturer: string | null | undefined): boolean {
  const brand = buildManufacturerBrandToken(manufacturer)
  if (!brand || !domain) {
    return false
  }

  return domain.includes(brand)
}

function findAllNpkTriplets(
  text: string,
): Array<{ nitrogen: number; phosphate: number; potash: number }> {
  const triplets: Array<{ nitrogen: number; phosphate: number; potash: number }> = []
  const dashPattern = /\b(\d+)\s*[-–—]\s*(\d+)\s*[-–—]\s*(\d+)\b/g
  for (const match of text.matchAll(dashPattern)) {
    triplets.push({
      nitrogen: Number(match[1]),
      phosphate: Number(match[2]),
      potash: Number(match[3]),
    })
  }

  const normalized = normalizeComparable(text)
  const spacePattern = /\b(\d+)\s+(\d+)\s+(\d+)\b/g
  for (const match of normalized.matchAll(spacePattern)) {
    triplets.push({
      nitrogen: Number(match[1]),
      phosphate: Number(match[2]),
      potash: Number(match[3]),
    })
  }

  return triplets
}

function evaluateManufacturerEvidence(input: {
  trustedEvidenceText: string
  domain: string | null
  officialDomainMatch: boolean
  identity: FertilizerEnrichmentIdentity
}): ManufacturerSearchEvidenceLevel {
  const brand = buildManufacturerBrandToken(input.identity.manufacturer)
  if (input.officialDomainMatch && brand) {
    return 'match'
  }

  if (brand && normalizeComparable(input.trustedEvidenceText).includes(brand)) {
    return 'match'
  }

  return input.trustedEvidenceText.trim() ? 'unknown' : 'mismatch'
}

function evaluateProductNameEvidence(input: {
  trustedEvidenceText: string
  identity: FertilizerEnrichmentIdentity
}): ManufacturerSearchEvidenceLevel {
  const normalizedEvidence = normalizeComparable(input.trustedEvidenceText)
  if (!normalizedEvidence) {
    return 'unknown'
  }

  const variants = buildProductNameSearchVariants(input.identity.officialName)
  if (variants.some((variant) => normalizeComparable(variant).length > 0 && normalizedEvidence.includes(normalizeComparable(variant)))) {
    return 'match'
  }

  return 'unknown'
}

function evaluateProductLineEvidence(input: {
  trustedEvidenceText: string
  identity: FertilizerEnrichmentIdentity
}): ManufacturerSearchEvidenceLevel {
  const expected = normalizeComparable(input.identity.productLine)
  if (!expected) {
    return 'unknown'
  }

  if (sourceTextEvidencesProductLine(input.trustedEvidenceText, input.identity.productLine)) {
    return 'match'
  }

  return normalizeComparable(input.trustedEvidenceText) ? 'unknown' : 'mismatch'
}

function evaluateNpkEvidence(input: {
  trustedEvidenceText: string
  expectedNpk: ReturnType<typeof resolveExpectedStructuredResearchNpk>
}): ManufacturerSearchEvidenceLevel {
  if (!input.expectedNpk) {
    return 'unknown'
  }

  const triplets = findAllNpkTriplets(input.trustedEvidenceText)
  if (triplets.length === 0) {
    return 'unknown'
  }

  if (triplets.some((triplet) => npkTripletsCompatible(input.expectedNpk, triplet))) {
    return 'match'
  }

  return 'mismatch'
}

function computeIdentityScore(candidate: Pick<
  ManufacturerSearchCandidate,
  | 'manufacturerEvidence'
  | 'productNameEvidence'
  | 'productLineEvidence'
  | 'npkEvidence'
  | 'officialDomainMatch'
  | 'citationVerified'
>): number {
  let score = 0
  if (candidate.citationVerified) score += 1
  if (candidate.officialDomainMatch) score += 2
  if (candidate.manufacturerEvidence === 'match') score += 2
  if (candidate.productNameEvidence === 'match') score += 2
  if (candidate.productLineEvidence === 'match') score += 3
  if (candidate.npkEvidence === 'match') score += 4
  if (candidate.manufacturerEvidence === 'mismatch') score -= 5
  if (candidate.productNameEvidence === 'mismatch') score -= 3
  if (candidate.productLineEvidence === 'mismatch') score -= 4
  if (candidate.npkEvidence === 'mismatch') score -= 6
  return score
}

function upsertCandidate(
  map: Map<string, MutableCandidateAccumulator>,
  url: string,
  patch: Partial<MutableCandidateAccumulator> & {
    evidencePart?: string
    trustedEvidenceKind?: ManufacturerSearchTrustedEvidenceKind
  },
  manufacturerDomain: string | null,
): void {
  const normalizedUrl = normalizeCandidateUrl(url)
  if (!normalizedUrl) {
    return
  }

  const domain = extractDomain(normalizedUrl)
  const existing = map.get(normalizedUrl)
  const candidate: MutableCandidateAccumulator = existing ?? {
    candidateId: normalizedUrl,
    url: normalizedUrl,
    title: null,
    evidenceParts: [],
    trustedEvidenceKinds: new Set(),
    domain,
    officialDomainMatch: domainMatchesManufacturer(domain, manufacturerDomain),
    citationVerified: false,
  }

  if (patch.title?.trim()) {
    candidate.title = patch.title.trim()
  }

  if (patch.evidencePart?.trim()) {
    candidate.evidenceParts.push(patch.evidencePart.trim())
  }

  if (patch.trustedEvidenceKind) {
    candidate.trustedEvidenceKinds.add(patch.trustedEvidenceKind)
    if (
      patch.trustedEvidenceKind === 'url_citation' ||
      patch.trustedEvidenceKind === 'url_citation_excerpt'
    ) {
      candidate.citationVerified = true
    }
  }

  map.set(normalizedUrl, candidate)
}

export function extractTrustedWebSearchCandidatesFromResponseOutput(input: {
  output: unknown[] | null | undefined
  manufacturerDomain: string | null
}): ManufacturerSearchCandidate[] {
  const map = new Map<string, MutableCandidateAccumulator>()

  for (const item of input.output ?? []) {
    if (!item || typeof item !== 'object') {
      continue
    }

    const record = item as Record<string, unknown>
    const type = typeof record.type === 'string' ? record.type : ''

    if (type === 'web_search_call') {
      const action = record.action
      if (!action || typeof action !== 'object') {
        continue
      }

      const actionRecord = action as Record<string, unknown>
      if (actionRecord.type !== 'search') {
        continue
      }

      const sources = Array.isArray(actionRecord.sources) ? actionRecord.sources : []
      for (const source of sources) {
        if (!source || typeof source !== 'object') {
          continue
        }

        const sourceRecord = source as Record<string, unknown>
        if (sourceRecord.type !== 'url' || typeof sourceRecord.url !== 'string') {
          continue
        }

        upsertCandidate(
          map,
          sourceRecord.url,
          {
            evidencePart: sourceRecord.url,
            trustedEvidenceKind: 'web_search_source_url',
          },
          input.manufacturerDomain,
        )
      }
    }

    if (type === 'message' && Array.isArray(record.content)) {
      for (const contentPart of record.content) {
        if (!contentPart || typeof contentPart !== 'object') {
          continue
        }

        const contentRecord = contentPart as Record<string, unknown>
        if (contentRecord.type !== 'output_text' || typeof contentRecord.text !== 'string') {
          continue
        }

        const messageText = contentRecord.text
        const annotations = Array.isArray(contentRecord.annotations) ? contentRecord.annotations : []
        for (const annotation of annotations) {
          if (!annotation || typeof annotation !== 'object') {
            continue
          }

          const annotationRecord = annotation as Record<string, unknown>
          if (annotationRecord.type !== 'url_citation') {
            continue
          }

          if (typeof annotationRecord.url !== 'string') {
            continue
          }

          const startIndex =
            typeof annotationRecord.start_index === 'number' ? annotationRecord.start_index : 0
          const endIndex =
            typeof annotationRecord.end_index === 'number'
              ? annotationRecord.end_index
              : messageText.length
          const citedExcerpt = messageText.slice(startIndex, endIndex).trim()

          upsertCandidate(
            map,
            annotationRecord.url,
            {
              title: typeof annotationRecord.title === 'string' ? annotationRecord.title : null,
              evidencePart: [
                typeof annotationRecord.title === 'string' ? annotationRecord.title : '',
                annotationRecord.url,
                citedExcerpt,
              ]
                .filter(Boolean)
                .join(' '),
              trustedEvidenceKind: citedExcerpt ? 'url_citation_excerpt' : 'url_citation',
            },
            input.manufacturerDomain,
          )
        }
      }
    }
  }

  return [...map.values()].map((entry) => ({
    candidateId: entry.candidateId,
    url: entry.url,
    title: entry.title,
    trustedEvidenceText: normalizeComparable(
      [...new Set([entry.url, entry.title ?? '', ...entry.evidenceParts])].filter(Boolean).join(' '),
    ),
    trustedEvidenceKinds: [...entry.trustedEvidenceKinds],
    domain: entry.domain,
    officialDomainMatch: entry.officialDomainMatch,
    citationVerified: entry.citationVerified,
    manufacturerEvidence: 'unknown',
    productNameEvidence: 'unknown',
    productLineEvidence: 'unknown',
    npkEvidence: 'unknown',
    identityScore: 0,
    hardRejected: false,
    rejectionReason: null,
  }))
}

export function isModelSourceCitationVerified(input: {
  url: string
  candidates: readonly ManufacturerSearchCandidate[]
}): boolean {
  const normalizedUrl = normalizeCandidateUrl(input.url)
  if (!normalizedUrl) {
    return false
  }

  return input.candidates.some(
    (candidate) => candidate.candidateId === normalizedUrl && candidate.citationVerified,
  )
}

export function scoreManufacturerSearchCandidates(input: {
  candidates: ManufacturerSearchCandidate[]
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
}): ManufacturerSearchCandidate[] {
  const expectedNpk = resolveExpectedStructuredResearchNpk(input)

  return input.candidates.map((candidate) => {
    const manufacturerEvidence = evaluateManufacturerEvidence({
      trustedEvidenceText: candidate.trustedEvidenceText,
      domain: candidate.domain,
      officialDomainMatch: candidate.officialDomainMatch,
      identity: input.identity,
    })
    const productNameEvidence = evaluateProductNameEvidence({
      trustedEvidenceText: candidate.trustedEvidenceText,
      identity: input.identity,
    })
    const productLineEvidence = evaluateProductLineEvidence({
      trustedEvidenceText: candidate.trustedEvidenceText,
      identity: input.identity,
    })
    const npkEvidence = evaluateNpkEvidence({
      trustedEvidenceText: candidate.trustedEvidenceText,
      expectedNpk,
    })

    let hardRejected = false
    let rejectionReason: string | null = null

    if (manufacturerEvidence === 'mismatch') {
      hardRejected = true
      rejectionReason = 'manufacturer_mismatch'
    } else if (productNameEvidence === 'mismatch') {
      hardRejected = true
      rejectionReason = 'product_name_mismatch'
    } else if (productLineEvidence === 'mismatch') {
      hardRejected = true
      rejectionReason = 'product_line_mismatch'
    } else if (npkEvidence === 'mismatch') {
      hardRejected = true
      rejectionReason = 'npk_mismatch'
    }

    const scored = {
      ...candidate,
      manufacturerEvidence,
      productNameEvidence,
      productLineEvidence,
      npkEvidence,
      hardRejected,
      rejectionReason,
    }

    return {
      ...scored,
      identityScore: computeIdentityScore(scored),
    }
  })
}

function isCandidateEligibleForCanonical(input: {
  candidate: ManufacturerSearchCandidate
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
}): boolean {
  if (input.candidate.hardRejected) {
    return false
  }

  const expectedNpk = resolveExpectedStructuredResearchNpk(input)
  const expectedProductLinePresent = Boolean(normalizeComparable(input.identity.productLine))

  if (expectedProductLinePresent && input.candidate.productLineEvidence !== 'match') {
    return false
  }

  if (expectedNpk != null && input.candidate.npkEvidence !== 'match') {
    return false
  }

  if (input.candidate.manufacturerEvidence === 'mismatch') {
    return false
  }

  return true
}

function variantEvidenceSignature(candidate: ManufacturerSearchCandidate): string {
  const npkTriplet = findAllNpkTriplets(candidate.trustedEvidenceText)[0]
  const npkKey = npkTriplet
    ? `${npkTriplet.nitrogen}-${npkTriplet.phosphate}-${npkTriplet.potash}`
    : candidate.npkEvidence
  return `${candidate.productLineEvidence}|${npkKey}`
}

export function selectCanonicalManufacturerSearchCandidate(input: {
  candidates: ManufacturerSearchCandidate[]
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string | null
}): ManufacturerSearchCandidateSelection {
  const scored = scoreManufacturerSearchCandidates(input)
  const eligible = scored.filter((candidate) =>
    isCandidateEligibleForCanonical({
      candidate,
      identity: input.identity,
      npkLabel: input.npkLabel,
    }),
  )

  const sortedEligible = [...eligible].sort((left, right) => {
    if (right.identityScore !== left.identityScore) {
      return right.identityScore - left.identityScore
    }

    if (right.officialDomainMatch !== left.officialDomainMatch) {
      return Number(right.officialDomainMatch) - Number(left.officialDomainMatch)
    }

    return left.url.localeCompare(right.url)
  })

  const canonicalCandidate = sortedEligible[0] ?? null
  const verifiedVariantCount = new Set(eligible.map((candidate) => variantEvidenceSignature(candidate))).size
  const topVariantCount = sortedEligible.filter(
    (candidate) =>
      canonicalCandidate != null &&
      variantEvidenceSignature(candidate) === variantEvidenceSignature(canonicalCandidate),
  ).length
  const candidateAmbiguity =
    (input.identity.hasIdentityAmbiguity && verifiedVariantCount > 1) ||
    (!input.identity.hasIdentityAmbiguity &&
      verifiedVariantCount > 1 &&
      sortedEligible[1] != null &&
      variantEvidenceSignature(sortedEligible[1]!) !== variantEvidenceSignature(canonicalCandidate ?? sortedEligible[1]!) &&
      sortedEligible[1]!.identityScore === canonicalCandidate?.identityScore &&
      topVariantCount === 1)

  return {
    candidates: scored,
    canonicalCandidate,
    canonicalSelectionReason: canonicalCandidate
      ? `identity_score=${canonicalCandidate.identityScore}`
      : verifiedVariantCount === 0
        ? 'no_eligible_candidate'
        : 'ambiguous_or_incomplete_evidence',
    candidateAmbiguity,
    verifiedVariantCount,
    citationVerifiedUrls: scored.filter((candidate) => candidate.citationVerified).map((candidate) => candidate.url),
  }
}

export function resolveModelSourceUrlForCandidate(input: {
  url: string
  candidates: readonly ManufacturerSearchCandidate[]
}): string | null {
  const normalizedUrl = normalizeCandidateUrl(input.url)
  if (!normalizedUrl) {
    return null
  }

  return input.candidates.some((candidate) => candidate.candidateId === normalizedUrl)
    ? normalizedUrl
    : null
}

export function buildManufacturerSearchNutrientBindings(input: {
  record: {
    nutrientMatrix: Partial<Record<FertilizerNutrientMatrixKey, number | null>>
    sources: Array<{ url: string }>
    nutrientSourceIndices?: Partial<Record<FertilizerNutrientMatrixKey, number | null>>
  }
  selection: ManufacturerSearchCandidateSelection
}): ManufacturerSearchNutrientBinding[] {
  const canonicalId = input.selection.canonicalCandidate?.candidateId ?? null
  const canonicalVariantKey = input.selection.canonicalCandidate
    ? `${input.selection.canonicalCandidate.productLineEvidence}|${input.selection.canonicalCandidate.npkEvidence}`
    : null

  const compatibleCandidateIds = new Set(
    input.selection.candidates
      .filter((candidate) => {
        if (candidate.hardRejected) {
          return false
        }

        if (candidate.candidateId === canonicalId) {
          return true
        }

        if (!canonicalVariantKey) {
          return false
        }

        const candidateVariantKey = `${candidate.productLineEvidence}|${candidate.npkEvidence}`
        return candidateVariantKey === canonicalVariantKey
      })
      .map((candidate) => candidate.candidateId),
  )

  return (Object.keys(input.record.nutrientMatrix) as FertilizerNutrientMatrixKey[])
    .filter((key) => typeof input.record.nutrientMatrix[key] === 'number')
    .map((nutrientKey) => {
      const accepted =
        canonicalId != null &&
        compatibleCandidateIds.has(canonicalId)

      return {
        nutrientKey,
        candidateId: canonicalId,
        accepted,
      }
    })
}

export function buildManufacturerSearchResearchDecision(input: {
  selection: ManufacturerSearchCandidateSelection
  nutrientBindings: ManufacturerSearchNutrientBinding[]
  candidateAmbiguityOverride?: boolean
}): ManufacturerSearchResearchDecision {
  if (input.candidateAmbiguityOverride ?? input.selection.candidateAmbiguity) {
    return {
      accepted: false,
      reason: 'candidate_ambiguity',
      nutrientSourceBindings: input.nutrientBindings.map((binding) => ({
        ...binding,
        accepted: false,
      })),
    }
  }

  if (!input.selection.canonicalCandidate) {
    return {
      accepted: false,
      reason: input.selection.canonicalSelectionReason ?? 'no_canonical_candidate',
      nutrientSourceBindings: input.nutrientBindings.map((binding) => ({
        ...binding,
        accepted: false,
      })),
    }
  }

  const acceptedBindings = input.nutrientBindings.map((binding) => ({
    ...binding,
    accepted:
      binding.accepted &&
      binding.candidateId != null &&
      input.selection.canonicalCandidate != null &&
      (binding.candidateId === input.selection.canonicalCandidate.candidateId ||
        input.selection.candidates.some(
          (candidate) =>
            candidate.candidateId === binding.candidateId &&
            !candidate.hardRejected &&
            `${candidate.productLineEvidence}|${candidate.npkEvidence}` ===
              `${input.selection.canonicalCandidate!.productLineEvidence}|${input.selection.canonicalCandidate!.npkEvidence}`,
        )),
  }))

  const hasRejectedNutrient = acceptedBindings.some((binding) => !binding.accepted)
  if (hasRejectedNutrient) {
    return {
      accepted: false,
      reason: 'nutrient_not_bound_to_canonical_candidate',
      nutrientSourceBindings: acceptedBindings,
    }
  }

  return {
    accepted: true,
    reason: 'canonical_candidate_verified',
    nutrientSourceBindings: acceptedBindings,
  }
}

export function buildManufacturerSearchSelectionFromEvidence(input: {
  identity: FertilizerEnrichmentIdentity
  npkLabel?: string
  candidates: Array<{
    url: string
    title: string
    trustedEvidenceText: string
    officialDomainMatch?: boolean
  }>
}): ManufacturerSearchCandidateSelection {
  return selectCanonicalManufacturerSearchCandidate({
    candidates: input.candidates.map((candidate) => ({
      candidateId: candidate.url,
      url: candidate.url,
      title: candidate.title,
      trustedEvidenceText: candidate.trustedEvidenceText,
      trustedEvidenceKinds: ['url_citation_excerpt'] as ManufacturerSearchTrustedEvidenceKind[],
      domain: 'example.test',
      officialDomainMatch: candidate.officialDomainMatch ?? true,
      citationVerified: true,
      manufacturerEvidence: 'unknown',
      productNameEvidence: 'unknown',
      productLineEvidence: 'unknown',
      npkEvidence: 'unknown',
      identityScore: 0,
      hardRejected: false,
      rejectionReason: null,
    })),
    identity: input.identity,
    npkLabel: input.npkLabel,
  })
}

export function buildTrustedEvidenceTextForCandidate(
  candidate: Pick<ManufacturerSearchCandidate, 'trustedEvidenceText'>,
): string {
  return candidate.trustedEvidenceText
}

export function candidateToPrimarySourceRecord(input: {
  candidate: ManufacturerSearchCandidate
  category?: 'official_manufacturer' | 'official_document'
}): { url: string; title: string; category: 'official_manufacturer' | 'official_document'; sourceIdentity: null } {
  return {
    url: input.candidate.url,
    title: input.candidate.title ?? input.candidate.url,
    category: input.category ?? 'official_manufacturer',
    sourceIdentity: null,
  }
}
