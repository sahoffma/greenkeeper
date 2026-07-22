import type {
  FieldConfidence,
  ProductSource,
  ProductSourceType,
  ProductVerificationStatus,
} from './productGovernance'

/** Physische Produktform – steuert Dosierungslogik. */
export type ProductForm = 'granular' | 'liquid' | 'soluble_powder' | 'other'

/** Basis der Nährstoffdeklaration bei Flüssigdüngern. */
export type NutrientBasis = 'mass_mass' | 'mass_volume' | 'grams_per_liter' | 'unknown'

/** Anwendungsart bei Flüssigdüngern. */
export type ApplicationMethod = 'foliar' | 'soil' | 'both'

export type LiquidNutrientKey = 'N' | 'P2O5' | 'K2O' | 'MgO' | 'SO3' | 'Fe' | 'Mn'

/** Etikett-Deklarationen (authoritative für Anzeige und Import). */
export interface ProductLabelNutrients {
  nPercent: number | null
  p2o5Percent: number | null
  k2oPercent: number | null
  mgoPercent: number | null
  so3Percent: number | null
  fePercent: number | null
  mnPercent: number | null
}

/** Elementare Nährstoffe – nur für interne Berechnungen, nicht für Anzeige. */
export interface ProductElementalNutrients {
  nPercent: number | null
  pPercent: number | null
  kPercent: number | null
  mgPercent: number | null
  sPercent: number | null
  fePercent: number | null
  mnPercent: number | null
}

/** Dosierungs- und Anwendungsangaben für Flüssigdünger. */
export interface ProductLiquidApplication {
  densityKgPerL: number | null
  nutrientBasis: NutrientBasis | null
  liquidRateMin: number | null
  liquidRateMax: number | null
  dilutionMin: number | null
  dilutionMax: number | null
  waterRateMin: number | null
  waterRateMax: number | null
  applicationMethod: ApplicationMethod | null
}

export interface Product extends ProductLabelNutrients, ProductLiquidApplication {
  id: string
  manufacturer: string
  officialName: string
  aliases: string[]
  category: string | null
  npk: string | null
  defaultUnit: string | null
  productForm: ProductForm | null
  productType: string | null
  recommendedRateMin: number | null
  recommendedRateMax: number | null
  recommendedRateUnit: string | null
  longevityWeeksMin: number | null
  longevityWeeksMax: number | null
  releaseType: string | null
  seasonMonths: number[] | null
  description: string | null
  manufacturerUrl: string | null
  datasheetUrl: string | null
  sourceName: string | null
  sourceCheckedAt: string | null
  verificationStatus: ProductVerificationStatus | null
  verifiedAt: string | null
  verifiedBy: string | null
  lastReviewedAt: string | null
  currentVersion: number | null
  confidenceScore: number | null
  /** @deprecated Nutze reviewConfidenceScore */
  fieldConfidence: Partial<FieldConfidence>
  aiConfidenceScore: number | null
  reviewConfidenceScore: number | null
  aiFieldConfidence: Partial<FieldConfidence>
  reviewFieldConfidence: Partial<FieldConfidence>
  sources: ProductSource[]
  primarySourceType: ProductSourceType | null
  primarySourceUrl: string | null
  hasOpenChangeRequest: boolean
  legacyImportedAt: string | null
  legacyImportNote: string | null
}

/** Eingabeformat für Produktimporte aus beliebigen Quellen (CSV, JSON, KI, …). */
export interface ProductImportInput {
  manufacturer: string
  officialName: string
  aliases?: string[]
  npk?: string | null
  productForm?: ProductForm | null
  productType?: string | null
  nPercent?: number | null
  p2o5Percent?: number | null
  k2oPercent?: number | null
  mgoPercent?: number | null
  so3Percent?: number | null
  fePercent?: number | null
  mnPercent?: number | null
  recommendedRateMin?: number | null
  recommendedRateMax?: number | null
  recommendedRateUnit?: string | null
  densityKgPerL?: number | null
  nutrientBasis?: NutrientBasis | null
  liquidRateMin?: number | null
  liquidRateMax?: number | null
  dilutionMin?: number | null
  dilutionMax?: number | null
  waterRateMin?: number | null
  waterRateMax?: number | null
  applicationMethod?: ApplicationMethod | null
  longevityWeeksMin?: number | null
  longevityWeeksMax?: number | null
  releaseType?: string | null
  seasonMonths?: number[] | null
  description?: string | null
  manufacturerUrl?: string | null
  datasheetUrl?: string | null
  sourceName?: string | null
  sourceCheckedAt?: string | Date | null
}

export interface ProductImportResult {
  product: Product
  created: boolean
}

/** Abstraktion für künftige Importquellen (Hersteller-API, CSV, JSON, KI-Recherche, …). */
export interface ProductImportSource {
  readonly sourceName: string
  fetchRecords(): Promise<ProductImportInput[]>
}

export interface AppliedLiquidNutrientResult {
  nutrient: LiquidNutrientKey
  gramsPerSqm: number
  appliedMlPerSqm: number
  productMassKgPerSqm: number
}
