import type { Product } from '../types/product'
import { buildProductUserTrustDisplay } from './productDisplayTrust'
import {
  formatApplicationMethodLabel,
  formatProductFormLabel,
} from './liquidFertilizerCalculations'
import { formatMicronutrientLabel, formatNpkLabel } from './nutrientDisplay'
import type { ProductAssistantPreview } from '../types/productAssistant'

export interface ProductAssistantDisplayRow {
  label: string
  value: string
}

export function formatDosageLabel(product: Pick<
  Product,
  | 'productForm'
  | 'recommendedRateMin'
  | 'recommendedRateMax'
  | 'recommendedRateUnit'
  | 'liquidRateMin'
  | 'liquidRateMax'
>): string {
  if (product.productForm === 'liquid') {
    if (product.liquidRateMin != null && product.liquidRateMax != null) {
      return `${product.liquidRateMin}–${product.liquidRateMax} ml/m²`
    }

    if (product.liquidRateMin != null) {
      return `${product.liquidRateMin} ml/m²`
    }

    if (product.liquidRateMax != null) {
      return `${product.liquidRateMax} ml/m²`
    }

    return 'Keine Angabe'
  }

  const unit = product.recommendedRateUnit ?? 'g/m²'

  if (product.recommendedRateMin != null && product.recommendedRateMax != null) {
    return `${product.recommendedRateMin}–${product.recommendedRateMax} ${unit}`
  }

  if (product.recommendedRateMin != null) {
    return `${product.recommendedRateMin} ${unit}`
  }

  if (product.recommendedRateMax != null) {
    return `${product.recommendedRateMax} ${unit}`
  }

  return 'Keine Angabe'
}

export function formatLongevityLabel(
  min: number | null,
  max: number | null,
): string {
  if (min != null && max != null) {
    return `${min}–${max} Wochen`
  }

  if (min != null) {
    return `${min} Wochen`
  }

  if (max != null) {
    return `${max} Wochen`
  }

  return 'Keine Angabe'
}

export function buildMicronutrientRows(product: Pick<
  Product,
  'fePercent' | 'mnPercent' | 'mgoPercent' | 'so3Percent'
>): ProductAssistantDisplayRow[] {
  const rows: ProductAssistantDisplayRow[] = []

  const fe = formatMicronutrientLabel('Fe', product.fePercent)
  const mn = formatMicronutrientLabel('Mn', product.mnPercent)
  const mgo = formatMicronutrientLabel('MgO', product.mgoPercent)
  const so3 = formatMicronutrientLabel('SO₃', product.so3Percent)

  if (fe) rows.push({ label: 'Eisen', value: fe })
  if (mn) rows.push({ label: 'Mangan', value: mn })
  if (mgo) rows.push({ label: 'Magnesium (MgO)', value: mgo })
  if (so3) rows.push({ label: 'Schwefel (SO₃)', value: so3 })

  return rows
}

export function buildExistingProductDisplayRows(product: Product): ProductAssistantDisplayRow[] {
  const trust = buildProductUserTrustDisplay(product)
  const micronutrients = buildMicronutrientRows(product)
  const rows: ProductAssistantDisplayRow[] = [
    { label: 'Hersteller', value: product.manufacturer },
    { label: 'Offizieller Name', value: product.officialName },
    { label: 'Produktform', value: formatProductFormLabel(product.productForm) },
    { label: 'NPK (Etikett)', value: formatNpkLabel(product) ?? 'Keine Angabe' },
  ]

  if (micronutrients.length > 0) {
    rows.push(...micronutrients)
  } else {
    rows.push({ label: 'Mikronährstoffe', value: 'Keine Angabe' })
  }

  rows.push(
    { label: 'Empfohlene Dosierung', value: formatDosageLabel(product) },
    {
      label: 'Anwendungsart',
      value: formatApplicationMethodLabel(product.applicationMethod) ?? 'Keine Angabe',
    },
    {
      label: 'Wirkungsdauer',
      value: formatLongevityLabel(product.longevityWeeksMin, product.longevityWeeksMax),
    },
    { label: 'Vertrauensstatus', value: trust.verificationLabel },
  )

  if (trust.lastReviewedLabel) {
    rows.push({ label: 'Prüfhinweis', value: trust.lastReviewedLabel })
  }

  if (trust.hasSourceEvidence) {
    rows.push({ label: 'Quelle', value: 'Quellenangabe vorhanden' })
  }

  return rows
}

export function buildPreviewDisplayRows(preview: ProductAssistantPreview): ProductAssistantDisplayRow[] {
  const micronutrients = buildMicronutrientRows(preview)

  const rows: ProductAssistantDisplayRow[] = [
    { label: 'Hersteller', value: preview.displayManufacturer },
    { label: 'Produktname', value: preview.displayOfficialName },
    {
      label: 'Produktform',
      value: preview.productForm ? formatProductFormLabel(preview.productForm) : 'Nicht erkannt',
    },
    { label: 'NPK (Etikett)', value: preview.npk ?? 'Nicht erkannt' },
    {
      label: 'Empfohlene Dosierung',
      value: formatDosageLabel({
        productForm: preview.productForm,
        recommendedRateMin: preview.recommendedRateMin,
        recommendedRateMax: preview.recommendedRateMax,
        recommendedRateUnit: preview.recommendedRateUnit,
        liquidRateMin: preview.liquidRateMin,
        liquidRateMax: preview.liquidRateMax,
      }),
    },
    {
      label: 'Anwendungsart',
      value: preview.applicationMethod
        ? (formatApplicationMethodLabel(preview.applicationMethod) ?? 'Nicht erkannt')
        : 'Nicht erkannt',
    },
    {
      label: 'Wirkungsdauer',
      value: formatLongevityLabel(preview.longevityWeeksMin, preview.longevityWeeksMax),
    },
    {
      label: 'Erkannte Quelle',
      value: preview.sourceDescription ?? 'Keine Quelle angegeben',
    },
  ]

  if (micronutrients.length > 0) {
    for (const row of micronutrients) {
      rows.push(row)
    }
  } else {
    rows.push({ label: 'Mikronährstoffe', value: 'Keine erkannt' })
  }

  if (preview.missingFields.length > 0) {
    rows.push({
      label: 'Fehlende Angaben',
      value: preview.missingFields.join(', '),
    })
  }

  if (preview.uncertainFields.length > 0) {
    rows.push({
      label: 'Unsichere Angaben',
      value: preview.uncertainFields.join(', '),
    })
  }

  if (preview.devMode) {
    rows.push({
      label: 'Hinweis',
      value: 'Entwicklungsmodus – nur manuell eingegebene Basisdaten, keine KI-Erfindungen.',
    })
  }

  return rows
}
