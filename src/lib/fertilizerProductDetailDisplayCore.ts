import { buildNpkLabel } from './nutrientDisplay'
import { formatNpkDeclarationDisplay } from './fertilizerProductDisplay'
import { formatFertilizerProductFormLabel } from './fertilizerApplicationFlowCore'
import type { FertilizerNutrientMatrix, FertilizerNutrientMatrixKey } from '../types/fertilizerReadiness'
import type { ActiveProductStockReadRow } from './fertilizerProductStockReadCore'

export interface FertilizerProductDetailDisplayRow {
  label: string
  value: string
}

const TRACE_NUTRIENT_LABELS: Partial<Record<FertilizerNutrientMatrixKey, string>> = {
  iron: 'Eisen',
  manganese: 'Mangan',
  copper: 'Kupfer',
  zinc: 'Zink',
  boron: 'Bor',
  molybdenum: 'Molybdän',
  sulfur: 'Schwefel',
  calcium: 'Calcium',
  nitrateNitrogen: 'Nitrat-Stickstoff',
  ammoniumNitrogen: 'Ammonium-Stickstoff',
  ureaNitrogen: 'Harnstoff-Stickstoff',
  organicNitrogen: 'Organischer Stickstoff',
}

function formatNutrientMatrixValue(
  key: FertilizerNutrientMatrixKey,
  matrix: FertilizerNutrientMatrix | null | undefined,
): string | null {
  const entry = matrix?.[key]
  if (entry == null || entry.value == null) {
    return null
  }

  const basis = entry.declarationBasis?.trim()
  const suffix = basis ? ` ${basis}` : ''
  return `${entry.value} ${entry.unit}${suffix}`.trim()
}

export function buildSavedProductNpkDisplay(input: {
  npkDeclaration?: string | null
  nitrogen?: number | null
  phosphate?: number | null
  potash?: number | null
}): string | null {
  const fromDeclaration = formatNpkDeclarationDisplay(input.npkDeclaration)
  if (fromDeclaration) {
    return fromDeclaration
  }

  if (
    input.nitrogen == null
    || input.phosphate == null
    || input.potash == null
  ) {
    return null
  }

  return buildNpkLabel(input.nitrogen, input.phosphate, input.potash)
    ? `NPK ${buildNpkLabel(input.nitrogen, input.phosphate, input.potash)}`
    : null
}

export function buildFertilizerProductDetailRows(
  row: ActiveProductStockReadRow,
): FertilizerProductDetailDisplayRow[] {
  const rows: FertilizerProductDetailDisplayRow[] = []

  if (row.manufacturer) {
    rows.push({ label: 'Hersteller', value: row.manufacturer })
  }

  if (row.officialName) {
    rows.push({ label: 'Produktname', value: row.officialName })
  }

  if (row.productLine) {
    rows.push({ label: 'Produktlinie', value: row.productLine })
  }

  if (row.variant) {
    rows.push({ label: 'Variante', value: row.variant })
  }

  const productFormLabel = formatFertilizerProductFormLabel(row.productForm)
  if (productFormLabel) {
    rows.push({ label: 'Produktform', value: productFormLabel })
  }

  const balanceUnit = row.baseUnit
  const balanceFormatted = Number.isInteger(row.balance)
    ? String(row.balance)
    : row.balance.toLocaleString('de-DE', { maximumFractionDigits: 4 })
  rows.push({ label: 'Aktueller Bestand', value: `${balanceFormatted} ${balanceUnit}` })

  if (row.packageSizeValue != null && row.packageSizeUnit) {
    rows.push({
      label: 'Gebindegröße',
      value: `${row.packageSizeValue} ${row.packageSizeUnit}`,
    })
  }

  const npk = buildSavedProductNpkDisplay(row)
  if (npk) {
    rows.push({ label: 'NPK', value: npk })
  }

  const magnesium = formatNutrientMatrixValue('magnesium', row.nutrientMatrix)
  if (magnesium) {
    rows.push({ label: 'Magnesium', value: magnesium })
  }

  const iron = formatNutrientMatrixValue('iron', row.nutrientMatrix)
  if (iron) {
    rows.push({ label: 'Eisen', value: iron })
  }

  const traceRows: FertilizerProductDetailDisplayRow[] = []
  for (const [key, label] of Object.entries(TRACE_NUTRIENT_LABELS) as Array<
    [FertilizerNutrientMatrixKey, string]
  >) {
    if (key === 'iron') {
      continue
    }

    const value = formatNutrientMatrixValue(key, row.nutrientMatrix)
    if (value) {
      traceRows.push({ label, value })
    }
  }

  rows.push(...traceRows)

  return rows
}

export function formatFertilizerStockListNpkSummary(
  row: Pick<
    ActiveProductStockReadRow,
    'npkDeclaration' | 'nitrogen' | 'phosphate' | 'potash'
  >,
): string | null {
  return buildSavedProductNpkDisplay(row)
}
