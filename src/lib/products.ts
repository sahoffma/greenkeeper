import { supabase } from './supabase'
import { getErrorMessage } from './errors'
import { mapProductRow, PRODUCT_SELECT, type ProductRow } from './productMapping'
import type { Product } from '../types/product'

export { mapProductRow, PRODUCT_SELECT, type ProductRow }

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase()
}

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .order('manufacturer')
    .order('official_name')

  if (error) {
    throw new Error(getErrorMessage(error, 'Produktbibliothek konnte nicht geladen werden.'))
  }

  return (data ?? []).map((row) => mapProductRow(row as unknown as ProductRow))
}

export function resolveProductName(rawName: string, products: Product[]): string {
  const trimmed = rawName.trim()

  if (!trimmed) {
    return rawName
  }

  const lookupKey = normalizeLookupKey(trimmed)

  for (const product of products) {
    if (normalizeLookupKey(product.officialName) === lookupKey) {
      return product.officialName
    }
  }

  for (const product of products) {
    for (const alias of product.aliases) {
      if (normalizeLookupKey(alias) === lookupKey) {
        return product.officialName
      }
    }
  }

  return rawName
}
