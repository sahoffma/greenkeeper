import OpenAI from 'openai'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type { FertilizerManufacturerResearchSearchProviderOutcome } from '../types/fertilizerManufacturerResearchSearch'
import { validateFertilizerManufacturerDocumentSource } from './fertilizerManufacturerDocumentSourceValidatorCore'
import type {
  FertilizerManufacturerResearchSearchProvider,
  FertilizerOfficialSourceCandidate,
  FertilizerOfficialSourceCandidateCategory,
} from './fertilizerManufacturerResearchCore'
import { sourceCategoryPriority as recognizeSourceCategoryPriority } from './productRecognizeSearchCore'
import { PRODUCT_RECOGNIZE_IMAGE_MODEL } from './productRecognizeImageCore'

export const MANUFACTURER_RESEARCH_SEARCH_BUDGET_MS = 4_000

export const manufacturerResearchWebSearchSchema = {
  type: 'object',
  properties: {
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          title: { type: 'string' },
          category: {
            type: 'string',
            enum: [
              'official_manufacturer',
              'official_brand',
              'official_document',
              'verified_catalog',
              'retailer',
              'other_web',
            ],
          },
        },
        required: ['url', 'title', 'category'],
        additionalProperties: false,
      },
    },
  },
  required: ['sources'],
  additionalProperties: false,
} as const

export interface ManufacturerResearchWebSearchSourceRecord {
  url: string
  title: string
  category: FertilizerOfficialSourceCandidateCategory
}

export interface ManufacturerResearchSearchAttemptResult {
  candidates: FertilizerOfficialSourceCandidate[]
  outcome: Exclude<FertilizerManufacturerResearchSearchProviderOutcome, 'not_configured'>
  searchResultCount: number
  officialSearchResultCount: number
}

function isOfficialSearchCategory(category: FertilizerOfficialSourceCandidateCategory): boolean {
  return (
    category === 'official_manufacturer' ||
    category === 'official_brand' ||
    category === 'official_document'
  )
}

export function normalizeSearchCategory(
  category: string,
  url: string,
): FertilizerOfficialSourceCandidateCategory {
  if (
    category === 'official_manufacturer' ||
    category === 'official_brand' ||
    category === 'official_document' ||
    category === 'verified_catalog' ||
    category === 'retailer' ||
    category === 'other_web'
  ) {
    if (category === 'official_manufacturer' && url.toLowerCase().includes('.pdf')) {
      return 'official_document'
    }

    return category
  }

  return url.toLowerCase().includes('.pdf') ? 'official_document' : 'other_web'
}

export function buildManufacturerResearchWebSearchPrompt(input: {
  identity: FertilizerEnrichmentIdentity
  queries: string[]
  manufacturerDomain: string | null
  npkLabel?: string | null
  packageSizeLabel?: string | null
}): string {
  return JSON.stringify({
    searchQueries: input.queries,
    productIdentity: {
      manufacturer: input.identity.manufacturer,
      productLine: input.identity.productLine,
      officialName: input.identity.officialName,
      variant: input.identity.variant,
      npk: input.npkLabel ?? null,
      packageSize: input.packageSizeLabel ?? null,
      manufacturerDomain: input.manufacturerDomain,
    },
    instruction:
      'Nutze das Web-Search-Tool, um offizielle Herstellerseiten und Produktdatenblätter für das konkrete Düngerprodukt zu finden. Bevorzuge die offizielle Herstellerdomain, dann offizielle PDF-Datenblätter, dann technische Kataloge. Händler nur ergänzend. Gib ausschließlich belastbare Quellen mit URL zurück. Keine Erfindungen.',
  })
}

export function parseManufacturerResearchWebSearchSources(
  record: Record<string, unknown>,
): ManufacturerResearchWebSearchSourceRecord[] {
  if (!Array.isArray(record.sources)) {
    return []
  }

  const sources: ManufacturerResearchWebSearchSourceRecord[] = []

  for (const entry of record.sources) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    const item = entry as Record<string, unknown>
    if (typeof item.url !== 'string' || typeof item.title !== 'string') {
      continue
    }

    const validation = validateFertilizerManufacturerDocumentSource(item.url)
    if (validation.status === 'invalid') {
      continue
    }

    sources.push({
      url: validation.normalizedUrl,
      title: item.title.trim() || validation.normalizedUrl,
      category: normalizeSearchCategory(String(item.category ?? 'other_web'), validation.normalizedUrl),
    })
  }

  return sources
}

export function computeSearchCandidatePriority(
  candidate: Pick<FertilizerOfficialSourceCandidate, 'url' | 'category'>,
  manufacturerDomain: string | null,
): number {
  const url = candidate.url.toLowerCase()
  const onOfficialDomain = Boolean(
    manufacturerDomain && url.includes(manufacturerDomain.toLowerCase()),
  )

  switch (candidate.category) {
    case 'official_manufacturer':
    case 'official_brand':
      return onOfficialDomain ? 6 : 5
    case 'official_document':
      return onOfficialDomain ? 6 : 5
    case 'verified_catalog':
      return 3
    case 'retailer':
      return 2
    default:
      return recognizeSourceCategoryPriority(candidate.category)
  }
}

export function rankDiscoveredSearchCandidates(
  candidates: FertilizerOfficialSourceCandidate[],
): FertilizerOfficialSourceCandidate[] {
  return [...candidates].sort((left, right) => {
    const priorityDiff = right.priority - left.priority
    if (priorityDiff !== 0) {
      return priorityDiff
    }

    const leftDocument = left.url.toLowerCase().includes('.pdf') ? 1 : 0
    const rightDocument = right.url.toLowerCase().includes('.pdf') ? 1 : 0
    return rightDocument - leftDocument
  })
}

export function mapSearchSourcesToCandidates(
  sources: ManufacturerResearchWebSearchSourceRecord[],
  manufacturerDomain: string | null,
): FertilizerOfficialSourceCandidate[] {
  const deduped = new Map<string, FertilizerOfficialSourceCandidate>()

  for (const source of sources) {
    if (deduped.has(source.url)) {
      continue
    }

    deduped.set(source.url, {
      url: source.url,
      title: source.title,
      category: source.category,
      priority: computeSearchCandidatePriority(source, manufacturerDomain),
    })
  }

  const ranked = rankDiscoveredSearchCandidates([...deduped.values()])
  const official = ranked.filter((candidate) => isOfficialSearchCategory(candidate.category))
  const supplemental = ranked.filter((candidate) => !isOfficialSearchCategory(candidate.category))

  if (official.length > 0) {
    return [...official, ...supplemental.slice(0, 2)]
  }

  return ranked.slice(0, 8)
}

export function countOfficialSearchResults(
  candidates: FertilizerOfficialSourceCandidate[],
): number {
  return candidates.filter((candidate) => isOfficialSearchCategory(candidate.category)).length
}

async function runWithTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutError: string,
): Promise<T> {
  if (timeoutMs <= 0) {
    throw new Error(timeoutError)
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(timeoutError)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

export function createOpenAiManufacturerResearchSearchProvider(
  openai: OpenAI,
  options: { model?: string } = {},
): FertilizerManufacturerResearchSearchProvider {
  const model = options.model ?? PRODUCT_RECOGNIZE_IMAGE_MODEL

  return {
    discoverOfficialSources: async (input) => {
      const response = await openai.responses.create({
        model,
        tools: [{ type: 'web_search' }],
        input: [
          {
            role: 'system',
            content:
              'Du findest offizielle Herstellerquellen für Düngerprodukte. Nutze ausschließlich das Web-Search-Tool und gib nur verifizierbare Quellen zurück.',
          },
          {
            role: 'user',
            content: buildManufacturerResearchWebSearchPrompt({
              identity: input.identity,
              queries: input.queries,
              manufacturerDomain: input.manufacturerDomain,
            }),
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'manufacturer_research_web_search',
            strict: true,
            schema: manufacturerResearchWebSearchSchema,
          },
        },
      })

      const outputText = response.output_text
      if (!outputText?.trim()) {
        return []
      }

      const sources = parseManufacturerResearchWebSearchSources(
        JSON.parse(outputText) as Record<string, unknown>,
      )

      return mapSearchSourcesToCandidates(sources, input.manufacturerDomain)
    },
  }
}

export async function runManufacturerResearchSearchAttempt(input: {
  searchProvider: FertilizerManufacturerResearchSearchProvider | null | undefined
  identity: FertilizerEnrichmentIdentity
  queries: string[]
  manufacturerDomain: string | null
  urlCandidates: string[]
  timeoutMs?: number
}): Promise<ManufacturerResearchSearchAttemptResult> {
  if (!input.searchProvider) {
    return {
      candidates: [],
      outcome: 'error',
      searchResultCount: 0,
      officialSearchResultCount: 0,
    }
  }

  try {
    const candidates = await runWithTimeout(
      input.searchProvider.discoverOfficialSources({
        identity: input.identity,
        queries: input.queries,
        manufacturerDomain: input.manufacturerDomain,
        urlCandidates: input.urlCandidates,
        timeoutMs: input.timeoutMs,
      }),
      input.timeoutMs ?? MANUFACTURER_RESEARCH_SEARCH_BUDGET_MS,
      'manufacturer_research_search_timeout',
    )

    if (candidates.length === 0) {
      return {
        candidates: [],
        outcome: 'no_results',
        searchResultCount: 0,
        officialSearchResultCount: 0,
      }
    }

    return {
      candidates,
      outcome: 'success',
      searchResultCount: candidates.length,
      officialSearchResultCount: countOfficialSearchResults(candidates),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'manufacturer_research_search_error'
    return {
      candidates: [],
      outcome: message.includes('timeout') ? 'timeout' : 'error',
      searchResultCount: 0,
      officialSearchResultCount: 0,
    }
  }
}

export function createConfiguredManufacturerResearchSearchProvider(
  openAiApiKey: string | null | undefined,
): FertilizerManufacturerResearchSearchProvider | null {
  const apiKey = openAiApiKey?.trim()
  if (!apiKey) {
    return null
  }

  return createOpenAiManufacturerResearchSearchProvider(new OpenAI({ apiKey }))
}
