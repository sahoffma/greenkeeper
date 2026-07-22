import type {
  FieldConfidence,
  FieldConfidenceKey,
  ProductChangePatch,
  ProductFieldChange,
  ProductSource,
  ProductSubmissionChannel,
  ProductSubmissionPayload,
} from '../types/productGovernance'
import { FIELD_CONFIDENCE_KEYS, SOURCE_TYPE_PRIORITY } from '../types/productGovernance'

export class ProductGovernanceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductGovernanceError'
  }
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.min(100, Math.max(0, Math.round(value * 100) / 100))
}

export function normalizeProductLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenSet(value: string): Set<string> {
  const normalized = normalizeProductLookupKey(value)

  if (!normalized) {
    return new Set()
  }

  return new Set(normalized.split(' ').filter(Boolean))
}

/** Jaccard-Ähnlichkeit zweier Strings (0–1). */
export function stringSimilarity(a: string, b: string): number {
  const setA = tokenSet(a)
  const setB = tokenSet(b)

  if (setA.size === 0 && setB.size === 0) {
    return 1
  }

  if (setA.size === 0 || setB.size === 0) {
    return 0
  }

  let intersection = 0

  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1
    }
  }

  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

export interface DuplicateCandidate {
  id: string
  manufacturer: string
  officialName: string
  aliases?: string[]
}

export interface DuplicateDetectionResult {
  isDuplicate: boolean
  bestMatch: {
    id: string
    manufacturer: string
    officialName: string
    score: number
    reason: string
  } | null
}

export function detectDuplicate(
  payload: Pick<ProductSubmissionPayload, 'manufacturer' | 'officialName' | 'aliases'>,
  candidates: DuplicateCandidate[],
  threshold = 0.85,
): DuplicateDetectionResult {
  const manufacturerKey = normalizeProductLookupKey(payload.manufacturer)
  const officialNameKey = normalizeProductLookupKey(payload.officialName)
  const aliasKeys = (payload.aliases ?? []).map(normalizeProductLookupKey).filter(Boolean)

  let bestMatch: DuplicateDetectionResult['bestMatch'] = null

  for (const candidate of candidates) {
    const candidateManufacturerKey = normalizeProductLookupKey(candidate.manufacturer)

    if (manufacturerKey && candidateManufacturerKey && manufacturerKey !== candidateManufacturerKey) {
      continue
    }

    const namesToCompare = [
      candidate.officialName,
      ...(candidate.aliases ?? []),
    ]

    for (const name of namesToCompare) {
      const nameKey = normalizeProductLookupKey(name)

      if (nameKey === officialNameKey) {
        return {
          isDuplicate: true,
          bestMatch: {
            id: candidate.id,
            manufacturer: candidate.manufacturer,
            officialName: candidate.officialName,
            score: 1,
            reason: 'Exakter Name/Treffer unter gleichem Hersteller.',
          },
        }
      }

      const score = stringSimilarity(payload.officialName, name)

      if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = {
          id: candidate.id,
          manufacturer: candidate.manufacturer,
          officialName: candidate.officialName,
          score,
          reason: `Namensähnlichkeit ${Math.round(score * 100)} % unter gleichem Hersteller.`,
        }
      }
    }

    for (const aliasKey of aliasKeys) {
      for (const name of namesToCompare) {
        const score = stringSimilarity(aliasKey, name)

        if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
          bestMatch = {
            id: candidate.id,
            manufacturer: candidate.manufacturer,
            officialName: candidate.officialName,
            score,
            reason: `Alias-Ähnlichkeit ${Math.round(score * 100)} % unter gleichem Hersteller.`,
          }
        }
      }
    }
  }

  return {
    isDuplicate: bestMatch != null,
    bestMatch,
  }
}

export function calculateConfidence(fieldConfidence: Partial<FieldConfidence>): number {
  const values: number[] = []

  for (const key of FIELD_CONFIDENCE_KEYS) {
    const value = fieldConfidence[key]

    if (value != null && Number.isFinite(value)) {
      values.push(clampConfidence(value))
    }
  }

  if (values.length === 0) {
    return 0
  }

  const sum = values.reduce((acc, value) => acc + value, 0)
  return clampConfidence(sum / values.length)
}

export function inferFieldConfidenceFromPayload(
  payload: ProductSubmissionPayload | ProductChangePatch,
  base: Partial<FieldConfidence> = {},
): Partial<FieldConfidence> {
  const result: Partial<FieldConfidence> = { ...base }

  const setIfPresent = (key: FieldConfidenceKey, present: boolean, defaultScore = 50) => {
    if (result[key] != null) {
      return
    }

    if (present) {
      result[key] = defaultScore
    }
  }

  setIfPresent('manufacturer', Boolean(payload.manufacturer?.trim()))
  setIfPresent('officialName', Boolean(payload.officialName?.trim()))
  setIfPresent('aliases', (payload.aliases?.length ?? 0) > 0)
  setIfPresent('npk', payload.npk != null && payload.npk !== '')
  setIfPresent('nPercent', payload.nPercent != null)
  setIfPresent('p2o5Percent', payload.p2o5Percent != null)
  setIfPresent('k2oPercent', payload.k2oPercent != null)
  setIfPresent('mgoPercent', payload.mgoPercent != null)
  setIfPresent('so3Percent', payload.so3Percent != null)
  setIfPresent('iron', payload.fePercent != null)
  setIfPresent('manganese', payload.mnPercent != null)
  setIfPresent(
    'dosage',
    payload.recommendedRateMin != null ||
      payload.recommendedRateMax != null ||
      payload.liquidRateMin != null ||
      payload.liquidRateMax != null,
  )
  setIfPresent(
    'longevity',
    payload.longevityWeeksMin != null || payload.longevityWeeksMax != null,
  )
  setIfPresent('density', payload.densityKgPerL != null)
  setIfPresent('nutrientBasis', payload.nutrientBasis != null && payload.nutrientBasis !== 'unknown')
  setIfPresent(
    'liquidApplication',
    payload.applicationMethod != null ||
      payload.dilutionMin != null ||
      payload.waterRateMin != null,
  )
  setIfPresent('description', Boolean(payload.description?.trim()))

  return result
}

export function mergeSources(
  existing: ProductSource[],
  incoming: ProductSource[],
): ProductSource[] {
  const seen = new Set<string>()
  const merged: ProductSource[] = []

  for (const source of [...existing, ...incoming]) {
    const key = [
      source.sourceType,
      source.sourceName,
      source.sourceUrl ?? '',
      source.retrievedAt,
    ].join('|')

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    merged.push(source)
  }

  return merged
}

export function pickPrimarySource(sources: ProductSource[]): {
  primarySourceType: ProductSource['sourceType'] | null
  primarySourceUrl: string | null
} {
  if (sources.length === 0) {
    return { primarySourceType: null, primarySourceUrl: null }
  }

  const priority: ProductSource['sourceType'][] = [
    'manufacturer',
    'datasheet',
    'internal',
    'retailer',
    'user_submission',
    'ai_research',
    'other',
  ]

  const sorted = [...sources].sort(
    (a, b) => priority.indexOf(a.sourceType) - priority.indexOf(b.sourceType),
  )

  const primary = sorted[0]

  return {
    primarySourceType: primary.sourceType,
    primarySourceUrl: primary.sourceUrl,
  }
}

export function buildProductSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(row)) as Record<string, unknown>
}

export function mergeSubmissionPayload(
  base: ProductSubmissionPayload,
  override: Partial<ProductSubmissionPayload> | undefined,
): ProductSubmissionPayload {
  if (!override) {
    return base
  }

  return {
    ...base,
    ...override,
    aliases: override.aliases ?? base.aliases,
    seasonMonths: override.seasonMonths ?? base.seasonMonths,
  }
}

export function mergeChangePatch(
  base: ProductChangePatch,
  override: ProductChangePatch | undefined,
): ProductChangePatch {
  if (!override) {
    return base
  }

  return {
    ...base,
    ...override,
    aliases: override.aliases ?? base.aliases,
    seasonMonths: override.seasonMonths ?? base.seasonMonths,
  }
}

export function validateSubmissionPayload(payload: ProductSubmissionPayload): void {
  if (!payload.manufacturer?.trim()) {
    throw new ProductGovernanceError('Hersteller (manufacturer) ist erforderlich.')
  }

  if (!payload.officialName?.trim()) {
    throw new ProductGovernanceError('Offizieller Produktname (officialName) ist erforderlich.')
  }
}

export function validateChangeRequestInput(changeSummary: string, proposedChanges: ProductChangePatch): void {
  if (!changeSummary.trim()) {
    throw new ProductGovernanceError('Eine Änderungszusammenfassung (changeSummary) ist erforderlich.')
  }

  if (Object.keys(proposedChanges).length === 0) {
    throw new ProductGovernanceError('Der Änderungsvorschlag enthält keine Felder.')
  }
}

const TRACKED_SNAPSHOT_FIELDS = [
  'manufacturer',
  'official_name',
  'aliases',
  'npk',
  'n_percent',
  'p2o5_percent',
  'k2o_percent',
  'mgo_percent',
  'so3_percent',
  'fe_percent',
  'mn_percent',
  'recommended_rate_min',
  'recommended_rate_max',
  'recommended_rate_unit',
  'product_form',
  'density_kg_per_l',
  'nutrient_basis',
  'liquid_rate_min',
  'liquid_rate_max',
  'longevity_weeks_min',
  'longevity_weeks_max',
  'description',
] as const

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Berechnet strukturierte Feldänderungen zwischen zwei Produkt-Snapshots. */
export function computeFieldChanges(
  previous: Record<string, unknown> | null,
  current: Record<string, unknown>,
): ProductFieldChange[] {
  if (!previous) {
    return TRACKED_SNAPSHOT_FIELDS.filter((field) => current[field] !== undefined).map((field) => ({
      field,
      previousValue: null,
      newValue: current[field] ?? null,
    }))
  }

  const changes: ProductFieldChange[] = []

  for (const field of TRACKED_SNAPSHOT_FIELDS) {
    const prev = previous[field] ?? null
    const next = current[field] ?? null

    if (!valuesEqual(prev, next)) {
      changes.push({ field, previousValue: prev, newValue: next })
    }
  }

  return changes
}

/** Review-Priorität aus Quellen und Korroboration (0–100, höher = wichtiger). */
export function calculateReviewPriority(
  sources: ProductSource[],
  submissionChannel: ProductSubmissionChannel,
  corroborationCount = 0,
): number {
  let priority = 30

  if (sources.length > 0) {
    priority = Math.max(
      ...sources.map((source) => SOURCE_TYPE_PRIORITY[source.sourceType] ?? 30),
    )
  } else {
    switch (submissionChannel) {
      case 'manufacturer_import':
        priority = 85
        break
      case 'pdf_import':
        priority = 70
        break
      case 'photo_import':
        priority = 55
        break
      case 'ai_import':
        priority = 45
        break
      case 'admin_seed':
        priority = 40
        break
      case 'user_manual':
      default:
        priority = 35
    }
  }

  const corroborationBoost = Math.min(30, corroborationCount * 10)
  return Math.min(100, priority + corroborationBoost)
}

export function inferChannelFromSources(
  sources: ProductSource[],
  fallback: ProductSubmissionChannel = 'user_manual',
): ProductSubmissionChannel {
  if (sources.some((s) => s.sourceKind === 'manufacturer_pdf')) {
    return 'pdf_import'
  }

  if (sources.some((s) => s.sourceKind === 'user_photo' || s.sourceKind === 'product_label')) {
    return 'photo_import'
  }

  if (sources.some((s) => s.sourceType === 'manufacturer')) {
    return 'manufacturer_import'
  }

  if (sources.some((s) => s.sourceType === 'ai_research')) {
    return 'ai_import'
  }

  return fallback
}

export async function computeContentHash(content: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const encoded = new TextEncoder().encode(content)
    const digest = await globalThis.crypto.subtle.digest('SHA-256', encoded)
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
  }

  // Fallback für Umgebungen ohne Web Crypto (einfacher Hash – nicht kryptographisch)
  let hash = 0

  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) >>> 0
  }

  return `fallback-${hash.toString(16)}`
}

export function resolveConfidenceScores(input: {
  aiFieldConfidence?: Partial<FieldConfidence>
  reviewFieldConfidence?: Partial<FieldConfidence>
}): {
  aiConfidenceScore: number
  reviewConfidenceScore: number
  aiFieldConfidence: Partial<FieldConfidence>
  reviewFieldConfidence: Partial<FieldConfidence>
} {
  const aiFieldConfidence = input.aiFieldConfidence ?? {}
  const reviewFieldConfidence = input.reviewFieldConfidence ?? {}

  return {
    aiFieldConfidence,
    reviewFieldConfidence,
    aiConfidenceScore: calculateConfidence(aiFieldConfidence),
    reviewConfidenceScore: calculateConfidence(reviewFieldConfidence),
  }
}
