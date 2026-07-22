import type { ProductImportInput } from '../types/product'
import { buildNpkLabel } from './nutrientDisplay'

export interface ProductUpsertRow {
  manufacturer: string
  official_name: string
  aliases: string[]
  npk: string | null
  product_form: string | null
  product_type: string | null
  n_percent: number | null
  p2o5_percent: number | null
  k2o_percent: number | null
  mgo_percent: number | null
  so3_percent: number | null
  fe_percent: number | null
  mn_percent: number | null
  recommended_rate_min: number | null
  recommended_rate_max: number | null
  recommended_rate_unit: string | null
  density_kg_per_l: number | null
  nutrient_basis: string | null
  liquid_rate_min: number | null
  liquid_rate_max: number | null
  dilution_min: number | null
  dilution_max: number | null
  water_rate_min: number | null
  water_rate_max: number | null
  application_method: string | null
  longevity_weeks_min: number | null
  longevity_weeks_max: number | null
  release_type: string | null
  season_months: number[] | null
  description: string | null
  manufacturer_url: string | null
  datasheet_url: string | null
  source_name: string | null
  source_checked_at: string | null
}

export const PRODUCT_FORMS = ['granular', 'liquid', 'soluble_powder', 'other'] as const
export const NUTRIENT_BASES = ['mass_mass', 'mass_volume', 'grams_per_liter', 'unknown'] as const
export const APPLICATION_METHODS = ['foliar', 'soil', 'both'] as const

export class ProductImportValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductImportValidationError'
  }
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeAliases(aliases: string[] | undefined): string[] {
  if (!aliases) {
    return []
  }

  const seen = new Set<string>()
  const normalized: string[] = []

  for (const alias of aliases) {
    const trimmed = alias.trim()

    if (!trimmed) {
      continue
    }

    const key = trimmed.toLowerCase()

    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    normalized.push(trimmed)
  }

  return normalized
}

function normalizeSeasonMonths(months: number[] | undefined): number[] | null {
  if (!months || months.length === 0) {
    return null
  }

  const valid = [...new Set(months.filter((month) => Number.isInteger(month) && month >= 1 && month <= 12))]
  valid.sort((a, b) => a - b)

  return valid.length > 0 ? valid : null
}

function normalizeSourceCheckedAt(value: string | Date | null | undefined): string | null {
  if (value == null) {
    return null
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }

  const trimmed = value.trim()

  if (!trimmed) {
    return null
  }

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function pickString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]

    if (typeof value === 'string') {
      return value
    }
  }

  return undefined
}

function pickNullableNumber(record: Record<string, unknown>, ...keys: string[]): number | null | undefined {
  for (const key of keys) {
    const value = record[key]

    if (value == null) {
      return null
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return undefined
}

function pickNullableInteger(record: Record<string, unknown>, ...keys: string[]): number | null | undefined {
  const value = pickNullableNumber(record, ...keys)

  if (value === undefined) {
    return undefined
  }

  if (value == null) {
    return null
  }

  return Number.isInteger(value) ? value : Math.trunc(value)
}

function pickStringArray(record: Record<string, unknown>, ...keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = record[key]

    if (!Array.isArray(value)) {
      continue
    }

    return value.filter((item): item is string => typeof item === 'string')
  }

  return undefined
}

function pickIntegerArray(record: Record<string, unknown>, ...keys: string[]): number[] | undefined {
  for (const key of keys) {
    const value = record[key]

    if (!Array.isArray(value)) {
      continue
    }

    return value.filter((item): item is number => typeof item === 'number' && Number.isInteger(item))
  }

  return undefined
}

function pickEnumValue<T extends string>(
  record: Record<string, unknown>,
  allowed: readonly T[],
  ...keys: string[]
): T | null | undefined {
  const value = pickString(record, ...keys)

  if (value === undefined) {
    return undefined
  }

  if (!value.trim()) {
    return null
  }

  if ((allowed as readonly string[]).includes(value)) {
    return value as T
  }

  throw new ProductImportValidationError(`Ungültiger Wert "${value}" für ${keys[0]}.`)
}

export function validateImportInput(input: ProductImportInput): {
  manufacturer: string
  officialName: string
} {
  const manufacturer = input.manufacturer.trim()
  const officialName = input.officialName.trim()

  if (!manufacturer) {
    throw new ProductImportValidationError('Hersteller (manufacturer) ist erforderlich.')
  }

  if (!officialName) {
    throw new ProductImportValidationError('Offizieller Produktname (officialName) ist erforderlich.')
  }

  return { manufacturer, officialName }
}

export function parseProductImportBody(body: unknown): ProductImportInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ProductImportValidationError('Ungültiger JSON-Body.')
  }

  const record = body as Record<string, unknown>
  const manufacturer = pickString(record, 'manufacturer')
  const officialName = pickString(record, 'officialName', 'official_name')

  if (!manufacturer?.trim()) {
    throw new ProductImportValidationError('Hersteller (manufacturer) ist erforderlich.')
  }

  if (!officialName?.trim()) {
    throw new ProductImportValidationError('Offizieller Produktname (officialName) ist erforderlich.')
  }

  return {
    manufacturer,
    officialName,
    aliases: pickStringArray(record, 'aliases'),
    npk: pickString(record, 'npk') ?? null,
    productForm: pickEnumValue(record, PRODUCT_FORMS, 'productForm', 'product_form'),
    productType: pickString(record, 'productType', 'product_type') ?? null,
    nPercent: pickNullableNumber(record, 'nPercent', 'n_percent'),
    p2o5Percent: pickNullableNumber(record, 'p2o5Percent', 'p2o5_percent'),
    k2oPercent: pickNullableNumber(record, 'k2oPercent', 'k2o_percent'),
    mgoPercent: pickNullableNumber(record, 'mgoPercent', 'mgo_percent'),
    so3Percent: pickNullableNumber(record, 'so3Percent', 'so3_percent'),
    fePercent: pickNullableNumber(record, 'fePercent', 'fe_percent'),
    mnPercent: pickNullableNumber(record, 'mnPercent', 'mn_percent'),
    recommendedRateMin: pickNullableNumber(record, 'recommendedRateMin', 'recommended_rate_min'),
    recommendedRateMax: pickNullableNumber(record, 'recommendedRateMax', 'recommended_rate_max'),
    recommendedRateUnit: pickString(record, 'recommendedRateUnit', 'recommended_rate_unit') ?? null,
    densityKgPerL: pickNullableNumber(record, 'densityKgPerL', 'density_kg_per_l'),
    nutrientBasis: pickEnumValue(record, NUTRIENT_BASES, 'nutrientBasis', 'nutrient_basis'),
    liquidRateMin: pickNullableNumber(record, 'liquidRateMin', 'liquid_rate_min'),
    liquidRateMax: pickNullableNumber(record, 'liquidRateMax', 'liquid_rate_max'),
    dilutionMin: pickNullableNumber(record, 'dilutionMin', 'dilution_min'),
    dilutionMax: pickNullableNumber(record, 'dilutionMax', 'dilution_max'),
    waterRateMin: pickNullableNumber(record, 'waterRateMin', 'water_rate_min'),
    waterRateMax: pickNullableNumber(record, 'waterRateMax', 'water_rate_max'),
    applicationMethod: pickEnumValue(
      record,
      APPLICATION_METHODS,
      'applicationMethod',
      'application_method',
    ),
    longevityWeeksMin: pickNullableInteger(record, 'longevityWeeksMin', 'longevity_weeks_min'),
    longevityWeeksMax: pickNullableInteger(record, 'longevityWeeksMax', 'longevity_weeks_max'),
    releaseType: pickString(record, 'releaseType', 'release_type') ?? null,
    seasonMonths: pickIntegerArray(record, 'seasonMonths', 'season_months'),
    description: pickString(record, 'description') ?? null,
    manufacturerUrl: pickString(record, 'manufacturerUrl', 'manufacturer_url') ?? null,
    datasheetUrl: pickString(record, 'datasheetUrl', 'datasheet_url') ?? null,
    sourceName: pickString(record, 'sourceName', 'source_name') ?? null,
    sourceCheckedAt: pickString(record, 'sourceCheckedAt', 'source_checked_at') ?? null,
  }
}

export function toProductUpsertRow(input: ProductImportInput): ProductUpsertRow {
  const { manufacturer, officialName } = validateImportInput(input)

  const nPercent = input.nPercent ?? null
  const p2o5Percent = input.p2o5Percent ?? null
  const k2oPercent = input.k2oPercent ?? null
  const productForm = input.productForm ?? null
  const isLiquid = productForm === 'liquid'

  return {
    manufacturer,
    official_name: officialName,
    aliases: normalizeAliases(input.aliases),
    npk: trimOrNull(input.npk ?? null) ?? buildNpkLabel(nPercent, p2o5Percent, k2oPercent),
    product_form: productForm,
    product_type: trimOrNull(input.productType ?? null),
    n_percent: nPercent,
    p2o5_percent: p2o5Percent,
    k2o_percent: k2oPercent,
    mgo_percent: input.mgoPercent ?? null,
    so3_percent: input.so3Percent ?? null,
    fe_percent: input.fePercent ?? null,
    mn_percent: input.mnPercent ?? null,
    recommended_rate_min: isLiquid ? null : (input.recommendedRateMin ?? null),
    recommended_rate_max: isLiquid ? null : (input.recommendedRateMax ?? null),
    recommended_rate_unit: isLiquid ? null : trimOrNull(input.recommendedRateUnit ?? null),
    density_kg_per_l: isLiquid ? (input.densityKgPerL ?? null) : null,
    nutrient_basis: isLiquid ? (input.nutrientBasis ?? null) : null,
    liquid_rate_min: isLiquid ? (input.liquidRateMin ?? null) : null,
    liquid_rate_max: isLiquid ? (input.liquidRateMax ?? null) : null,
    dilution_min: isLiquid ? (input.dilutionMin ?? null) : null,
    dilution_max: isLiquid ? (input.dilutionMax ?? null) : null,
    water_rate_min: isLiquid ? (input.waterRateMin ?? null) : null,
    water_rate_max: isLiquid ? (input.waterRateMax ?? null) : null,
    application_method: isLiquid ? (input.applicationMethod ?? null) : null,
    longevity_weeks_min: input.longevityWeeksMin ?? null,
    longevity_weeks_max: input.longevityWeeksMax ?? null,
    release_type: trimOrNull(input.releaseType ?? null),
    season_months: normalizeSeasonMonths(input.seasonMonths ?? undefined),
    description: trimOrNull(input.description ?? null),
    manufacturer_url: trimOrNull(input.manufacturerUrl ?? null),
    datasheet_url: trimOrNull(input.datasheetUrl ?? null),
    source_name: trimOrNull(input.sourceName ?? null),
    source_checked_at: normalizeSourceCheckedAt(input.sourceCheckedAt),
  }
}
