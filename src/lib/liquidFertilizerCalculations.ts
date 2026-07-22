import type {
  ApplicationMethod,
  AppliedLiquidNutrientResult,
  LiquidNutrientKey,
  NutrientBasis,
  Product,
  ProductForm,
  ProductLabelNutrients,
} from '../types/product'

/**
 * Flüssigdünger-Berechnungen – Einheiten und Nährstoffbasen
 *
 * Volumen: ml/m²
 * Dichte: kg/L
 * Ergebnis Nährstoffmenge: g/m²
 *
 * Nährstoffbasis – Bedeutung der Label-Felder (nPercent, p2o5Percent, …):
 *
 * - mass_mass (% m/m):
 *   Massenanteil des Nährstoffs bezogen auf die Produktmasse.
 *   Formel: g/m² = (ml/m² ÷ 1000 × kg/L) × 1000 × (% / 100)
 *
 * - mass_volume (% m/v):
 *   Gramm Nährstoff pro 100 ml Produkt (übliche Flüssigdünger-Deklaration).
 *   Formel: g/m² = (ml/m² ÷ 100) × (% m/v)
 *   Dichte wird für die Produktmasse mitgeführt, beeinflusst die Nährstoffmenge hier nicht.
 *
 * - grams_per_liter (g/L):
 *   Direkte Angabe in Gramm Nährstoff pro Liter Produkt (nicht Prozent).
 *   Das Label-Feld enthält den g/L-Wert (z. B. nPercent = 80 bedeutet 80 g N/L).
 *   Formel: g/m² = (ml/m² ÷ 1000) × g/L
 */

export class LiquidFertilizerCalculationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LiquidFertilizerCalculationError'
  }
}

const LIQUID_NUTRIENT_FIELD: Record<LiquidNutrientKey, keyof ProductLabelNutrients> = {
  N: 'nPercent',
  P2O5: 'p2o5Percent',
  K2O: 'k2oPercent',
  MgO: 'mgoPercent',
  SO3: 'so3Percent',
  Fe: 'fePercent',
  Mn: 'mnPercent',
}

export function isLiquidProduct(product: Pick<Product, 'productForm'>): boolean {
  return product.productForm === 'liquid'
}

export function isGranularProduct(product: Pick<Product, 'productForm'>): boolean {
  return product.productForm == null || product.productForm === 'granular'
}

/** ml Produkt → Produktmasse in kg. */
export function convertLiquidVolumeToMassKg(
  volumeMl: number,
  densityKgPerL: number,
): number {
  if (!Number.isFinite(volumeMl) || volumeMl < 0) {
    throw new LiquidFertilizerCalculationError('Die Produktmenge in ml ist ungültig.')
  }

  if (!Number.isFinite(densityKgPerL) || densityKgPerL <= 0) {
    throw new LiquidFertilizerCalculationError(
      'Für die Umrechnung von ml in Produktmasse ist eine gültige Dichte (kg/L) erforderlich.',
    )
  }

  return (volumeMl / 1000) * densityKgPerL
}

/** ml Produkt × kg/L → Produktmasse in g. */
export function convertLiquidVolumeToMassGrams(
  volumeMl: number,
  densityKgPerL: number,
): number {
  return convertLiquidVolumeToMassKg(volumeMl, densityKgPerL) * 1000
}

function getLabelNutrientValue(product: ProductLabelNutrients, nutrient: LiquidNutrientKey): number | null {
  return product[LIQUID_NUTRIENT_FIELD[nutrient]]
}

function requireDensity(product: Product): number {
  if (product.densityKgPerL == null || product.densityKgPerL <= 0) {
    throw new LiquidFertilizerCalculationError(
      'Für eine sichere Berechnung ist die Dichte (kg/L) erforderlich.',
    )
  }

  return product.densityKgPerL
}

function requireNutrientBasis(product: Product): NutrientBasis {
  if (!product.nutrientBasis || product.nutrientBasis === 'unknown') {
    throw new LiquidFertilizerCalculationError(
      'Für eine sichere Berechnung ist die Nährstoffbasis (nutrientBasis) erforderlich.',
    )
  }

  return product.nutrientBasis
}

/**
 * Berechnet die ausgebrachte Nährstoffmenge in g/m² für Flüssigdünger.
 */
export function calculateLiquidNutrientPerSqm(
  product: Product,
  appliedMlPerSqm: number,
  nutrient: LiquidNutrientKey,
): AppliedLiquidNutrientResult {
  if (!isLiquidProduct(product)) {
    throw new LiquidFertilizerCalculationError(
      'Diese Berechnung ist nur für Flüssigdünger (productForm = liquid) vorgesehen.',
    )
  }

  if (!Number.isFinite(appliedMlPerSqm) || appliedMlPerSqm < 0) {
    throw new LiquidFertilizerCalculationError('Die aufgebrachte Produktmenge in ml/m² ist ungültig.')
  }

  const labelValue = getLabelNutrientValue(product, nutrient)

  if (labelValue == null) {
    throw new LiquidFertilizerCalculationError(
      `Für ${nutrient} liegt keine Deklarationsangabe am Produkt vor.`,
    )
  }

  const basis = requireNutrientBasis(product)
  const densityKgPerL = requireDensity(product)
  const productMassKgPerSqm = convertLiquidVolumeToMassKg(appliedMlPerSqm, densityKgPerL)

  let gramsPerSqm: number

  switch (basis) {
    case 'mass_mass':
      // kg/m² × 1000 → g Produkt/m²; × (% m/m / 100) → g Nährstoff/m²
      gramsPerSqm = productMassKgPerSqm * 1000 * (labelValue / 100)
      break
    case 'mass_volume':
      // % m/v: Gramm Nährstoff pro 100 ml Produkt
      gramsPerSqm = (appliedMlPerSqm / 100) * labelValue
      break
    case 'grams_per_liter':
      // Label-Feld enthält g Nährstoff pro Liter Produkt
      gramsPerSqm = (appliedMlPerSqm / 1000) * labelValue
      break
    default:
      throw new LiquidFertilizerCalculationError(
        'Für eine sichere Berechnung ist eine bekannte Nährstoffbasis erforderlich.',
      )
  }

  return {
    nutrient,
    gramsPerSqm,
    appliedMlPerSqm,
    productMassKgPerSqm,
  }
}

export function formatProductFormLabel(form: ProductForm | null): string {
  switch (form) {
    case 'liquid':
      return 'Flüssigdünger'
    case 'soluble_powder':
      return 'Lösliches Pulver'
    case 'other':
      return 'Sonstige Form'
    case 'granular':
    default:
      return 'Granulat'
  }
}

export function formatNutrientBasisLabel(basis: NutrientBasis | null): string | null {
  switch (basis) {
    case 'mass_mass':
      return 'Massenprozent (% m/m)'
    case 'mass_volume':
      return 'Massen-Volumen-Prozent (% m/v)'
    case 'grams_per_liter':
      return 'Gramm pro Liter (g/L)'
    case 'unknown':
      return 'Unbekannt'
    default:
      return null
  }
}

export function formatApplicationMethodLabel(method: ApplicationMethod | null): string | null {
  switch (method) {
    case 'foliar':
      return 'Blattdüngung'
    case 'soil':
      return 'Bodendüngung'
    case 'both':
      return 'Blatt- und Bodendüngung'
    default:
      return null
  }
}
