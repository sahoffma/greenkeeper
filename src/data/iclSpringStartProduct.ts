import type { ProductImportInput } from '../types/product'

/**
 * Offizielle Produktdaten: ICL Sierraform GT Spring Start
 * Quelle: https://icl-growingsolutions.com/en-gb/turf-landscape/products/sierraform-gt-spring-start/
 */
export const iclSpringStartProduct: ProductImportInput = {
  manufacturer: 'ICL',
  officialName: 'Spring Start',
  aliases: ['Spring Star', 'Springstar', 'Spring Start'],

  npk: '16-0-16',
  productForm: 'granular',
  productType: 'spring',

  nPercent: 16,
  p2o5Percent: 0,
  k2oPercent: 16,
  mgoPercent: null,
  so3Percent: null,
  fePercent: 1,
  mnPercent: 0.3,

  recommendedRateMin: 15,
  recommendedRateMax: 35,
  recommendedRateUnit: 'g/m²',

  longevityWeeksMin: 6,
  longevityWeeksMax: 8,

  releaseType: 'mixed',

  seasonMonths: null,

  description:
    'Sierraform GT Spring Start ist ein phosphatfreier Mikrogranulat-Dünger für den Saisonstart. ' +
    'Er enthält Eisen und Mangan für Photosynthese und Farbe sowie geringe MU-Anteile für eine schnelle Reaktion auch bei kühleren Temperaturen. ' +
    'Die Formulierung kombiniert standardfreisetzenden und langsam freisetzenden Stickstoff sowie langsam freisetzendes Kalium (Technologien MU2 und SilK).',

  manufacturerUrl:
    'https://icl-growingsolutions.com/en-gb/turf-landscape/products/sierraform-gt-spring-start/',

  datasheetUrl:
    'https://icl-growingsolutions.com/en-gb/wp-content/themes/icl-v2-repo/pdf-creator/pdf-getter.php?id=9142',

  sourceName: 'ICL Growing Solutions – Sierraform GT Spring Start (en-gb)',
  sourceCheckedAt: '2026-07-17',
}
