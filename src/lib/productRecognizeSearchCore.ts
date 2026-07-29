import type {
  ProductRecognizeImageAnalysis,
  ProductRecognizeRecognition,
  ProductRecognizeWebExtraction,
  ProductRecognizeWebSourceCategory,
} from '../types/productRecognize'
import { normalizeVariant } from './productRecognizeIdentityCore'

export interface ProductRecognizeSearchProvider {
  readonly name: string
  searchAndExtract(input: {
    analysis: ProductRecognizeImageAnalysis
    recognition: ProductRecognizeRecognition
    queries: string[]
  }): Promise<ProductRecognizeWebExtraction>
}

export function buildWebSearchQueries(
  analysis: ProductRecognizeImageAnalysis,
  recognition: ProductRecognizeRecognition,
): string[] {
  const brand = recognition.brand.normalizedValue ?? analysis.brand ?? ''
  const line = recognition.productLine.normalizedValue ?? analysis.productLine ?? ''
  const variant =
    recognition.variant.normalizedValue ??
    recognition.productName.normalizedValue ??
    analysis.variant ??
    analysis.productName ??
    ''
  const npk = analysis.npkLabel ?? ''
  const size =
    analysis.packageSizeValue != null
      ? `${analysis.packageSizeValue} ${analysis.packageSizeUnit ?? 'kg'}`
      : ''

  const baseTerms = [brand, line, variant, npk, size].filter(Boolean)
  const base = baseTerms.join(' ').trim()

  if (!base) {
    return []
  }

  const normalizedVariant = variant ? normalizeVariant(variant) ?? variant : ''
  const domain = brand.toLowerCase().replace(/[^a-z0-9]/g, '')

  const queries = [
    `${brand} ${line} ${variant} ${npk} ${size}`.trim(),
    `${brand} ${line} ${normalizedVariant} NPK ${npk}`.trim(),
    `${brand} ${normalizedVariant} Dünger`.trim(),
  ]

  if (domain) {
    queries.push(`site:${domain}.de ${normalizedVariant} Dünger`.trim())
    queries.push(`site:${domain}.de ${npk} ${size}`.trim())
  }

  return [...new Set(queries.filter(Boolean))]
}

export function sourceCategoryPriority(
  category: ProductRecognizeWebSourceCategory,
): number {
  switch (category) {
    case 'official_manufacturer':
      return 5
    case 'official_brand':
      return 4
    case 'verified_catalog':
      return 3
    case 'retailer':
      return 2
    default:
      return 1
  }
}

export function summarizeWebEnrichment(extraction: ProductRecognizeWebExtraction | null): string {
  if (!extraction) {
    return 'Web-Anreicherung übersprungen.'
  }

  if (extraction.failed) {
    return 'Web-Anreicherung fehlgeschlagen — Bestandserfassung bleibt möglich.'
  }

  if (extraction.sources.length === 0) {
    return 'Keine belastbare Webquelle gefunden.'
  }

  const official = extraction.sources.filter((source) =>
    ['official_manufacturer', 'official_brand'].includes(source.category),
  ).length

  if (extraction.conflicts.length > 0) {
    return `${extraction.sources.length} Quelle(n), ${extraction.conflicts.length} Widerspruch/Widersprüche.`
  }

  if (official > 0) {
    return `Offizielle Quelle gefunden (${official}).`
  }

  return `${extraction.sources.length} Webquelle(n) ausgewertet.`
}

export function webSourcesToRecords(extraction: ProductRecognizeWebExtraction) {
  return extraction.sources.map((source) => ({
    type: source.category,
    title: source.title,
    url: source.url,
    retrievedAt: source.retrievedAt,
  }))
}

export const productRecognizeWebSearchSchema = {
  type: 'object',
  properties: {
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          value: {
            anyOf: [
              { type: 'string' },
              { type: 'number' },
              { type: 'null' },
              {
                type: 'object',
                properties: {
                  nitrogen: { type: ['number', 'null'] },
                  phosphate: { type: ['number', 'null'] },
                  potash: { type: ['number', 'null'] },
                },
                required: ['nitrogen', 'phosphate', 'potash'],
                additionalProperties: false,
              },
            ],
          },
          unit: { type: ['string', 'null'] },
          confidence: { type: 'number' },
          sourceUrl: { type: 'string' },
          sourceTitle: { type: 'string' },
          sourceCategory: {
            type: 'string',
            enum: [
              'official_manufacturer',
              'official_brand',
              'verified_catalog',
              'retailer',
              'other_web',
            ],
          },
          evidence: { type: ['string', 'null'] },
        },
        required: [
          'field',
          'value',
          'unit',
          'confidence',
          'sourceUrl',
          'sourceTitle',
          'sourceCategory',
          'evidence',
        ],
        additionalProperties: false,
      },
    },
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
    conflicts: { type: 'array', items: { type: 'string' } },
  },
  required: ['fields', 'sources', 'conflicts'],
  additionalProperties: false,
} as const

export function parseWebSearchExtraction(
  record: Record<string, unknown>,
  retrievedAt: string,
  provider: string,
): ProductRecognizeWebExtraction {
  const fields = Array.isArray(record.fields)
    ? record.fields.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return []
        const item = entry as Record<string, unknown>
        if (typeof item.field !== 'string' || typeof item.sourceUrl !== 'string') return []

        let value: string | number | Record<string, number> | null = null
        if (
          typeof item.value === 'string' ||
          typeof item.value === 'number' ||
          item.value === null
        ) {
          value = item.value
        } else if (typeof item.value === 'object' && item.value != null) {
          value = item.value as Record<string, number>
        }

        return [
          {
            field: item.field,
            value,
            unit: typeof item.unit === 'string' ? item.unit : null,
            confidence: typeof item.confidence === 'number' ? item.confidence : 0,
            sourceUrl: item.sourceUrl,
            sourceTitle: typeof item.sourceTitle === 'string' ? item.sourceTitle : item.sourceUrl,
            sourceCategory: item.sourceCategory as ProductRecognizeWebSourceCategory,
            evidence: typeof item.evidence === 'string' ? item.evidence : null,
            retrievedAt,
          },
        ]
      })
    : []

  const sources = Array.isArray(record.sources)
    ? record.sources.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return []
        const item = entry as Record<string, unknown>
        if (typeof item.url !== 'string') return []
        return [
          {
            url: item.url,
            title: typeof item.title === 'string' ? item.title : item.url,
            category: item.category as ProductRecognizeWebSourceCategory,
            retrievedAt,
          },
        ]
      })
    : []

  return {
    fields,
    sources,
    conflicts: Array.isArray(record.conflicts)
      ? record.conflicts.filter((item): item is string => typeof item === 'string')
      : [],
    provider,
    failed: false,
  }
}

export function buildWebSearchPrompt(
  queries: string[],
  analysis: ProductRecognizeImageAnalysis,
  recognition: ProductRecognizeRecognition,
): string {
  return JSON.stringify({
    searchQueries: queries,
    imageIdentity: {
      brand: recognition.brand.normalizedValue ?? analysis.brand,
      productLine: recognition.productLine.normalizedValue ?? analysis.productLine,
      variant:
        recognition.variant.normalizedValue ??
        recognition.productName.normalizedValue ??
        analysis.variant,
      npk: analysis.npkLabel,
      packageSize:
        analysis.packageSizeValue != null
          ? `${analysis.packageSizeValue} ${analysis.packageSizeUnit ?? 'kg'}`
          : null,
    },
    requestedFields: [
      'manufacturer',
      'productDescriptor',
      'form',
      'npk',
      'nutrients',
      'applicationRate',
      'coverage',
      'durationMonths',
      'applicationPeriod',
    ],
    instruction:
      'Recherchiere das konkrete Düngerprodukt über das Web-Search-Tool. Bevorzuge offizielle Hersteller- oder Markenseiten (z. B. rasendoktor.de). Übernimm nur Felder mit belastbarer Quelle und wörtlicher Evidenz von der gefundenen Seite. Keine Modell-Erinnerung, keine Schätzungen. Für nutrients: einzelne Mikronährstoffe mit Wert in %. Für applicationPeriod: Monatsbereiche (fromMonth/toMonth 1–12). Gib Quellen mit Kategorie zurück.',
  })
}
