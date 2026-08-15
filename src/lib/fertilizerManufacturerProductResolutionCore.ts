import type { FertilizerOfficialSourceCandidateCategory } from './fertilizerManufacturerResearchCore'
import type { StructuredResearchSourceIdentityRecord } from './fertilizerManufacturerStructuredResearchSourceIdentityCore'

export const manufacturerProductResolutionSchema = {
  type: 'object',
  properties: {
    manufacturer: { type: 'string' },
    productLine: { type: ['string', 'null'] },
    productName: { type: 'string' },
    productForm: { type: 'string', enum: ['granular', 'liquid', 'unknown'] },
    npk: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          properties: {
            nitrogen: { type: 'number' },
            phosphate: { type: 'number' },
            potash: { type: 'number' },
          },
          required: ['nitrogen', 'phosphate', 'potash'],
          additionalProperties: false,
        },
      ],
    },
    identityMatch: { type: 'boolean' },
    confidence: { type: 'number' },
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
          sourceIdentity: {
            type: 'object',
            properties: {
              manufacturer: { type: ['string', 'null'] },
              productLine: { type: ['string', 'null'] },
              productName: { type: ['string', 'null'] },
              npkLabel: { type: ['string', 'null'] },
            },
            required: ['manufacturer', 'productLine', 'productName', 'npkLabel'],
            additionalProperties: false,
          },
        },
        required: ['url', 'title', 'category', 'sourceIdentity'],
        additionalProperties: false,
      },
    },
  },
  required: [
    'manufacturer',
    'productLine',
    'productName',
    'productForm',
    'npk',
    'identityMatch',
    'confidence',
    'sources',
  ],
  additionalProperties: false,
} as const

export interface ManufacturerProductResolutionSourceRecord {
  url: string
  title: string
  category: FertilizerOfficialSourceCandidateCategory
  sourceIdentity?: StructuredResearchSourceIdentityRecord | null
}

export interface ManufacturerProductResolutionRecord {
  manufacturer: string
  productLine: string | null
  productName: string
  productForm: 'granular' | 'liquid' | 'unknown'
  npk: { nitrogen: number; phosphate: number; potash: number } | null
  identityMatch: boolean
  confidence: number
  sources: ManufacturerProductResolutionSourceRecord[]
}

export function buildManufacturerProductResolutionPrompt(input: {
  identity: {
    manufacturer: string | null
    productLine?: string | null
    officialName: string | null
    variant: string | null
  }
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
      'Phase A product resolution only. Use web_search to find official manufacturer sources for the exact product variant. Return source URLs with sourceIdentity fields evidenced by the sources. Do NOT extract nutrientMatrix or individual nutrient declaration values in this step.',
  })
}

export function parseManufacturerProductResolutionRecord(
  raw: Record<string, unknown>,
): ManufacturerProductResolutionRecord | null {
  if (typeof raw.manufacturer !== 'string' || !raw.manufacturer.trim()) {
    return null
  }
  if (typeof raw.productName !== 'string' || !raw.productName.trim()) {
    return null
  }
  if (
    raw.productForm !== 'granular' &&
    raw.productForm !== 'liquid' &&
    raw.productForm !== 'unknown'
  ) {
    return null
  }
  if (!Array.isArray(raw.sources)) {
    return null
  }

  const sources = raw.sources.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return []
    }
    const source = entry as Record<string, unknown>
    if (typeof source.url !== 'string' || typeof source.title !== 'string') {
      return []
    }
    return [
      {
        url: source.url,
        title: source.title,
        category: (typeof source.category === 'string'
          ? source.category
          : 'other_web') as FertilizerOfficialSourceCandidateCategory,
        sourceIdentity:
          source.sourceIdentity && typeof source.sourceIdentity === 'object'
            ? (source.sourceIdentity as StructuredResearchSourceIdentityRecord)
            : null,
      },
    ]
  })

  let npk: ManufacturerProductResolutionRecord['npk'] = null
  if (raw.npk && typeof raw.npk === 'object') {
    const npkRecord = raw.npk as Record<string, unknown>
    if (
      typeof npkRecord.nitrogen === 'number' &&
      typeof npkRecord.phosphate === 'number' &&
      typeof npkRecord.potash === 'number'
    ) {
      npk = {
        nitrogen: npkRecord.nitrogen,
        phosphate: npkRecord.phosphate,
        potash: npkRecord.potash,
      }
    }
  }

  return {
    manufacturer: raw.manufacturer.trim(),
    productLine: typeof raw.productLine === 'string' ? raw.productLine.trim() : null,
    productName: raw.productName.trim(),
    productForm: raw.productForm,
    npk,
    identityMatch: raw.identityMatch === true,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
    sources,
  }
}

export function manufacturerProductResolutionSchemaHasNutrientMatrix(schema: unknown): boolean {
  if (!schema || typeof schema !== 'object') {
    return false
  }

  const properties = (schema as { properties?: Record<string, unknown> }).properties
  return Boolean(properties && 'nutrientMatrix' in properties)
}
