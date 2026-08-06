import type { FertilizerNutrientMatrix } from '../types/fertilizerReadiness'
import type { ActiveProductStockReadRow } from './fertilizerProductStockReadCore'

/** nutrient_matrix from live saved product_profiles row (Stress-Manager, Rasendoktor). */
export const STRESS_MANAGER_SAVED_NUTRIENT_MATRIX: FertilizerNutrientMatrix = {
  iron: { unit: '%', value: 0, declarationBasis: 'Fe' },
  zinc: { unit: '%', value: 0, declarationBasis: 'Zn' },
  boron: { unit: '%', value: 0, declarationBasis: 'B' },
  copper: { unit: '%', value: 0, declarationBasis: 'Cu' },
  potash: { unit: '%', value: 30, declarationBasis: 'K2O' },
  sulfur: { unit: '%', value: 0, declarationBasis: 'SO3' },
  calcium: { unit: '%', value: 0, declarationBasis: 'CaO' },
  nitrogen: { unit: '%', value: 0, declarationBasis: 'N' },
  magnesium: { unit: '%', value: 0, declarationBasis: 'MgO' },
  manganese: { unit: '%', value: 0, declarationBasis: 'Mn' },
  phosphate: { unit: '%', value: 0, declarationBasis: 'P2O5' },
  molybdenum: { unit: '%', value: 0, declarationBasis: 'Mo' },
  ureaNitrogen: { unit: '%', value: 0, declarationBasis: 'N' },
  nitrateNitrogen: { unit: '%', value: 0, declarationBasis: 'N' },
  organicNitrogen: { unit: '%', value: 0, declarationBasis: 'N' },
  ammoniumNitrogen: { unit: '%', value: 0, declarationBasis: 'N' },
}

export const STRESS_MANAGER_INVENTORY_ITEM_ID = '33333333-3333-4333-8333-333333333333'

export const STRESS_MANAGER_SAVED_PRODUCT_PROFILE_ID =
  '3655fbd7-1bef-4da6-b3e8-84853880bbe0'

export function stressManagerActiveProductStockRow(
  overrides: Partial<ActiveProductStockReadRow> = {},
): ActiveProductStockReadRow {
  return {
    inventoryItemId: STRESS_MANAGER_INVENTORY_ITEM_ID,
    savedProductProfileId: STRESS_MANAGER_SAVED_PRODUCT_PROFILE_ID,
    baseUnit: 'kg',
    balance: 5,
    manufacturer: 'Rasendoktor',
    officialName: 'Stress-Manager',
    productLine: 'Professional',
    productForm: 'granular',
    npkDeclaration: '0-0-30',
    nitrogen: 0,
    phosphate: 0,
    potash: 30,
    nutrientMatrix: STRESS_MANAGER_SAVED_NUTRIENT_MATRIX,
    packageSizeValue: 5,
    packageSizeUnit: 'kg',
    movementCount: 1,
    lastMovementAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  }
}

/** RPC item payload shape returned by get_active_fertilizer_product_stock_item (50815). */
export function stressManagerDetailRpcItemPayload(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    inventoryItemId: STRESS_MANAGER_INVENTORY_ITEM_ID,
    savedProductProfileId: STRESS_MANAGER_SAVED_PRODUCT_PROFILE_ID,
    baseUnit: 'kg',
    balance: 5,
    manufacturer: 'Rasendoktor',
    officialName: 'Stress-Manager',
    productLine: 'Professional',
    productForm: 'granular',
    npkDeclaration: '0-0-30',
    nitrogen: 0,
    phosphate: 0,
    potash: 30,
    nutrientMatrix: STRESS_MANAGER_SAVED_NUTRIENT_MATRIX,
    packageSizeValue: 5,
    packageSizeUnit: 'kg',
    movementCount: 1,
    lastMovementAt: '2026-08-06T10:00:00.000Z',
    ...overrides,
  }
}
