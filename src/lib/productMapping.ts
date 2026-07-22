import type { ApplicationMethod, NutrientBasis, Product, ProductForm } from '../types/product'
import type {
  FieldConfidence,
  ProductSource,
  ProductSourceType,
  ProductVerificationStatus,
} from '../types/productGovernance'

export interface ProductRow {
  id: string
  manufacturer: string
  official_name: string
  aliases: string[] | null
  category: string | null
  npk: string | null
  default_unit: string | null
  product_form: string | null
  product_type: string | null
  n_percent: number | string | null
  p2o5_percent: number | string | null
  k2o_percent: number | string | null
  mgo_percent: number | string | null
  so3_percent: number | string | null
  fe_percent: number | string | null
  mn_percent: number | string | null
  recommended_rate_min: number | string | null
  recommended_rate_max: number | string | null
  recommended_rate_unit: string | null
  density_kg_per_l: number | string | null
  nutrient_basis: string | null
  liquid_rate_min: number | string | null
  liquid_rate_max: number | string | null
  dilution_min: number | string | null
  dilution_max: number | string | null
  water_rate_min: number | string | null
  water_rate_max: number | string | null
  application_method: string | null
  longevity_weeks_min: number | string | null
  longevity_weeks_max: number | string | null
  release_type: string | null
  season_months: number[] | null
  description: string | null
  manufacturer_url: string | null
  datasheet_url: string | null
  source_name: string | null
  source_checked_at: string | null
  verification_status: string | null
  verified_at: string | null
  verified_by: string | null
  last_reviewed_at: string | null
  current_version: number | string | null
  confidence_score: number | string | null
  field_confidence: Partial<FieldConfidence> | null
  ai_confidence_score: number | string | null
  review_confidence_score: number | string | null
  ai_field_confidence: Partial<FieldConfidence> | null
  review_field_confidence: Partial<FieldConfidence> | null
  sources: ProductSource[] | null
  primary_source_type: string | null
  primary_source_url: string | null
  has_open_change_request: boolean | null
  legacy_imported_at: string | null
  legacy_import_note: string | null
}

export const PRODUCT_SELECT = [
  'id',
  'manufacturer',
  'official_name',
  'aliases',
  'category',
  'npk',
  'default_unit',
  'product_form',
  'product_type',
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
  'density_kg_per_l',
  'nutrient_basis',
  'liquid_rate_min',
  'liquid_rate_max',
  'dilution_min',
  'dilution_max',
  'water_rate_min',
  'water_rate_max',
  'application_method',
  'longevity_weeks_min',
  'longevity_weeks_max',
  'release_type',
  'season_months',
  'description',
  'manufacturer_url',
  'datasheet_url',
  'source_name',
  'source_checked_at',
  'verification_status',
  'verified_at',
  'verified_by',
  'last_reviewed_at',
  'current_version',
  'confidence_score',
  'field_confidence',
  'ai_confidence_score',
  'review_confidence_score',
  'ai_field_confidence',
  'review_field_confidence',
  'sources',
  'primary_source_type',
  'primary_source_url',
  'has_open_change_request',
  'legacy_imported_at',
  'legacy_import_note',
].join(', ')

function parseNumeric(value: number | string | null | undefined): number | null {
  if (value == null || value === '') {
    return null
  }

  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function parseInteger(value: number | string | null | undefined): number | null {
  const numeric = parseNumeric(value)

  if (numeric == null) {
    return null
  }

  return Number.isInteger(numeric) ? numeric : Math.trunc(numeric)
}

function parseProductForm(value: string | null): ProductForm | null {
  if (
    value === 'granular' ||
    value === 'liquid' ||
    value === 'soluble_powder' ||
    value === 'other'
  ) {
    return value
  }

  return null
}

function parseNutrientBasis(value: string | null): NutrientBasis | null {
  if (
    value === 'mass_mass' ||
    value === 'mass_volume' ||
    value === 'grams_per_liter' ||
    value === 'unknown'
  ) {
    return value
  }

  return null
}

function parseApplicationMethod(value: string | null): ApplicationMethod | null {
  if (value === 'foliar' || value === 'soil' || value === 'both') {
    return value
  }

  return null
}

function parseVerificationStatus(value: string | null): ProductVerificationStatus | null {
  const allowed: ProductVerificationStatus[] = [
    'draft',
    'pending_review',
    'verified',
    'incomplete',
    'disputed',
    'archived',
    'legacy_imported',
  ]

  if (value && allowed.includes(value as ProductVerificationStatus)) {
    return value as ProductVerificationStatus
  }

  return null
}

function parseSourceType(value: string | null): ProductSourceType | null {
  const allowed: ProductSourceType[] = [
    'manufacturer',
    'datasheet',
    'retailer',
    'user_submission',
    'ai_research',
    'internal',
    'other',
  ]

  if (value && allowed.includes(value as ProductSourceType)) {
    return value as ProductSourceType
  }

  return null
}

export function mapProductRow(row: ProductRow): Product {
  return {
    id: row.id,
    manufacturer: row.manufacturer,
    officialName: row.official_name,
    aliases: row.aliases ?? [],
    category: row.category,
    npk: row.npk,
    defaultUnit: row.default_unit,
    productForm: parseProductForm(row.product_form),
    productType: row.product_type,
    nPercent: parseNumeric(row.n_percent),
    p2o5Percent: parseNumeric(row.p2o5_percent),
    k2oPercent: parseNumeric(row.k2o_percent),
    mgoPercent: parseNumeric(row.mgo_percent),
    so3Percent: parseNumeric(row.so3_percent),
    fePercent: parseNumeric(row.fe_percent),
    mnPercent: parseNumeric(row.mn_percent),
    recommendedRateMin: parseNumeric(row.recommended_rate_min),
    recommendedRateMax: parseNumeric(row.recommended_rate_max),
    recommendedRateUnit: row.recommended_rate_unit,
    densityKgPerL: parseNumeric(row.density_kg_per_l),
    nutrientBasis: parseNutrientBasis(row.nutrient_basis),
    liquidRateMin: parseNumeric(row.liquid_rate_min),
    liquidRateMax: parseNumeric(row.liquid_rate_max),
    dilutionMin: parseNumeric(row.dilution_min),
    dilutionMax: parseNumeric(row.dilution_max),
    waterRateMin: parseNumeric(row.water_rate_min),
    waterRateMax: parseNumeric(row.water_rate_max),
    applicationMethod: parseApplicationMethod(row.application_method),
    longevityWeeksMin: parseInteger(row.longevity_weeks_min),
    longevityWeeksMax: parseInteger(row.longevity_weeks_max),
    releaseType: row.release_type,
    seasonMonths: row.season_months,
    description: row.description,
    manufacturerUrl: row.manufacturer_url,
    datasheetUrl: row.datasheet_url,
    sourceName: row.source_name,
    sourceCheckedAt: row.source_checked_at,
    verificationStatus: parseVerificationStatus(row.verification_status),
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    lastReviewedAt: row.last_reviewed_at,
    currentVersion: parseInteger(row.current_version),
    confidenceScore: parseNumeric(row.review_confidence_score ?? row.confidence_score),
    fieldConfidence: row.review_field_confidence ?? row.field_confidence ?? {},
    aiConfidenceScore: parseNumeric(row.ai_confidence_score),
    reviewConfidenceScore: parseNumeric(row.review_confidence_score ?? row.confidence_score),
    aiFieldConfidence: row.ai_field_confidence ?? {},
    reviewFieldConfidence: row.review_field_confidence ?? row.field_confidence ?? {},
    sources: row.sources ?? [],
    primarySourceType: parseSourceType(row.primary_source_type),
    primarySourceUrl: row.primary_source_url,
    hasOpenChangeRequest: row.has_open_change_request ?? false,
    legacyImportedAt: row.legacy_imported_at,
    legacyImportNote: row.legacy_import_note,
  }
}
