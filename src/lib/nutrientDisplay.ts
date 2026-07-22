import type { Product, ProductLabelNutrients } from '../types/product'

function formatLabelNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value)
  }

  return String(value).replace(/\.?0+$/, '')
}

/** Baut die NPK-Etikett-Anzeige aus N, P₂O₅ und K₂O. */
export function buildNpkLabel(
  nPercent: number | null,
  p2o5Percent: number | null,
  k2oPercent: number | null,
): string | null {
  if (nPercent == null || p2o5Percent == null || k2oPercent == null) {
    return null
  }

  return `${formatLabelNumber(nPercent)}-${formatLabelNumber(p2o5Percent)}-${formatLabelNumber(k2oPercent)}`
}

export function formatNpkLabel(product: Pick<Product, 'npk' | 'nPercent' | 'p2o5Percent' | 'k2oPercent'>): string | null {
  if (product.npk?.trim()) {
    return product.npk.trim()
  }

  return buildNpkLabel(product.nPercent, product.p2o5Percent, product.k2oPercent)
}

export function formatMicronutrientLabel(
  symbol: 'Fe' | 'Mn' | 'MgO' | 'SO₃',
  value: number | null,
): string | null {
  if (value == null) {
    return null
  }

  return `${formatLabelNumber(value)} % ${symbol}`
}

export function formatProductNutrientSummary(product: Product): string {
  const npk = formatNpkLabel(product)

  if (!npk) {
    return 'Keine Nährstoffdeklaration'
  }

  const extras: string[] = []

  const fe = formatMicronutrientLabel('Fe', product.fePercent)
  const mn = formatMicronutrientLabel('Mn', product.mnPercent)
  const mgo = formatMicronutrientLabel('MgO', product.mgoPercent)
  const so3 = formatMicronutrientLabel('SO₃', product.so3Percent)

  if (fe) extras.push(fe)
  if (mn) extras.push(mn)
  if (mgo) extras.push(mgo)
  if (so3) extras.push(so3)

  if (extras.length === 0) {
    return npk
  }

  return `${npk} (${extras.join(', ')})`
}

export function pickLabelNutrients(product: Product): ProductLabelNutrients {
  return {
    nPercent: product.nPercent,
    p2o5Percent: product.p2o5Percent,
    k2oPercent: product.k2oPercent,
    mgoPercent: product.mgoPercent,
    so3Percent: product.so3Percent,
    fePercent: product.fePercent,
    mnPercent: product.mnPercent,
  }
}
