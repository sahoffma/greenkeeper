import { describe, expect, it } from 'vitest'
import {
  defaultNutrientDeclarationBasisForMatrixKey,
  sanitizeNutrientDeclarationBasis,
} from './fertilizerNutrientDeclarationBasisCore'
import { mapEnrichmentNutrientMatrixToSaved } from './fertilizerProductProfileSaveCore'
import { buildFertilizerProductDetailRows } from './fertilizerProductDetailDisplayCore'
import type { FertilizerEnrichmentNutrientMatrix } from '../types/fertilizerEnrichment'
import type { ActiveProductStockReadRow } from './fertilizerProductStockReadCore'

function detailRow(
  overrides: Partial<ActiveProductStockReadRow> = {},
): ActiveProductStockReadRow {
  return {
    inventoryItemId: '33333333-3333-4333-8333-333333333333',
    savedProductProfileId: '11111111-1111-4111-8111-111111111111',
    baseUnit: 'kg',
    balance: 5,
    manufacturer: 'Hersteller',
    officialName: 'Produkt',
    productForm: 'granular',
    movementCount: 1,
    lastMovementAt: null,
    ...overrides,
  }
}

describe('fertilizerNutrientDeclarationBasisCore', () => {
  it('rejects formatted percent strings as declaration basis', () => {
    expect(
      sanitizeNutrientDeclarationBasis({
        key: 'iron',
        declarationBasis: '3 %',
        value: 3,
      }),
    ).toBe('Fe')
  })

  it('keeps chemical symbols', () => {
    expect(
      sanitizeNutrientDeclarationBasis({
        key: 'manganese',
        declarationBasis: 'Mn',
        value: 0.1,
      }),
    ).toBe('Mn')
  })

  it('defaults sulfur to S', () => {
    expect(defaultNutrientDeclarationBasisForMatrixKey('sulfur')).toBe('S')
  })
})

describe('saved nutrient matrix basis sanitization', () => {
  it('stores Fe instead of duplicated percent basis', () => {
    const matrix = {
      iron: {
        value: 3,
        declarationBasis: '3 %',
        normalization: 'declared' as const,
        provenanceId: 'source-1',
        unit: '%' as const,
        evidence: null,
        sourceUrl: null,
        sourceCategory: null,
        confidence: null,
        conflictStatus: null,
      },
    } as FertilizerEnrichmentNutrientMatrix

    expect(mapEnrichmentNutrientMatrixToSaved(matrix).iron).toEqual({
      value: 3,
      unit: '%',
      declarationBasis: 'Fe',
    })
  })
})

describe('detail display formatting', () => {
  it('formats iron as value percent basis without duplication', () => {
    const rows = buildFertilizerProductDetailRows(
      detailRow({
        nutrientMatrix: {
          iron: { value: 3, unit: '%', declarationBasis: '3 %' },
        },
      }),
    )

    expect(rows.some((row) => row.label === 'Eisen' && row.value === '3 % Fe')).toBe(true)
  })

  it('formats manganese with german decimal formatting', () => {
    const rows = buildFertilizerProductDetailRows(
      detailRow({
        nutrientMatrix: {
          manganese: { value: 0.1, unit: '%', declarationBasis: '0,1 %' },
        },
      }),
    )

    const manganeseRow = rows.find((row) => row.label === 'Mangan')
    expect(manganeseRow?.value).toBe('0,1 % Mn')
  })
})
