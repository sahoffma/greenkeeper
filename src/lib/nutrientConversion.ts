import type { ProductElementalNutrients, ProductLabelNutrients } from '../types/product'

const P_FROM_P2O5 = 0.4364
const K_FROM_K2O = 0.8302
const MG_FROM_MGO = 0.6032
const S_FROM_SO3 = 0.4005

function convertOxide(value: number | null, factor: number): number | null {
  if (value == null) {
    return null
  }

  return Number((value * factor).toFixed(4))
}

/** Leitet elementare Nährstoffwerte aus Etikett-Deklarationen ab (nicht für Anzeige). */
export function toElementalNutrients(label: ProductLabelNutrients): ProductElementalNutrients {
  return {
    nPercent: label.nPercent,
    pPercent: convertOxide(label.p2o5Percent, P_FROM_P2O5),
    kPercent: convertOxide(label.k2oPercent, K_FROM_K2O),
    mgPercent: convertOxide(label.mgoPercent, MG_FROM_MGO),
    sPercent: convertOxide(label.so3Percent, S_FROM_SO3),
    fePercent: label.fePercent,
    mnPercent: label.mnPercent,
  }
}
