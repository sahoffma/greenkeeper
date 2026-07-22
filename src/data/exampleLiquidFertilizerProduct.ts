import type { ProductImportInput } from '../types/product'

/**
 * Fiktives Beispielprodukt für Flüssigdünger-Import und Berechnungen.
 * Nicht automatisch importieren.
 */
export const exampleLiquidFertilizerProduct: ProductImportInput = {
  manufacturer: 'GreenLab',
  officialName: 'Rasen Aktiv Flüssig',
  aliases: ['Rasen Aktiv', 'RasenAktiv Flüssig'],

  productForm: 'liquid',
  npk: '8-2-6',
  productType: 'general',

  nPercent: 8,
  p2o5Percent: 2,
  k2oPercent: 6,
  mgoPercent: null,
  so3Percent: null,
  fePercent: 0.5,
  mnPercent: null,

  densityKgPerL: 1.18,
  nutrientBasis: 'mass_mass',

  liquidRateMin: 20,
  liquidRateMax: 40,

  dilutionMin: 10,
  dilutionMax: 20,

  waterRateMin: 0.5,
  waterRateMax: 1.0,

  applicationMethod: 'both',

  description:
    'Fiktiver Flüssigdünger für Rasen mit Blatt- und Bodenanwendung. ' +
    'Dosierung erfolgt in ml/m² mit anschließender Verdünnung in Wasser.',

  sourceName: 'Greenkeeper Beispieldatensatz (fiktiv)',
  sourceCheckedAt: '2026-07-20',
}
