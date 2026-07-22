import { resolveProductName } from './products'
import { searchProductCatalog } from './productAssistantCore'
import type { Product } from '../types/product'
import type { ProductAssistantMatch } from '../types/productAssistant'

function normalizeLookupKey(value: string): string {
  return value.trim().toLowerCase()
}

export function isProductKnownInCatalog(rawName: string, products: Product[]): boolean {
  const trimmed = rawName.trim()

  if (!trimmed) {
    return false
  }

  const lookupKey = normalizeLookupKey(trimmed)

  for (const product of products) {
    if (normalizeLookupKey(product.officialName) === lookupKey) {
      return true
    }

    for (const alias of product.aliases) {
      if (normalizeLookupKey(alias) === lookupKey) {
        return true
      }
    }
  }

  return false
}

export type SpokenProductLookup =
  | { kind: 'known'; officialName: string; product: Product }
  | { kind: 'unknown'; spokenName: string }
  | { kind: 'ambiguous'; spokenName: string; matches: ProductAssistantMatch[] }

export function lookupSpokenProductName(rawName: string, products: Product[]): SpokenProductLookup {
  const spokenName = rawName.trim()

  if (!spokenName) {
    return { kind: 'unknown', spokenName: '' }
  }

  if (isProductKnownInCatalog(spokenName, products)) {
    const officialName = resolveProductName(spokenName, products)
    const product =
      products.find((entry) => entry.officialName === officialName) ??
      products.find(
        (entry) =>
          normalizeLookupKey(entry.officialName) === normalizeLookupKey(officialName) ||
          entry.aliases.some((alias) => normalizeLookupKey(alias) === normalizeLookupKey(spokenName)),
      )

    if (product) {
      return { kind: 'known', officialName: product.officialName, product }
    }
  }

  const searchOutcome = searchProductCatalog(products, {
    manufacturer: '',
    officialName: spokenName,
  })

  if (searchOutcome.kind === 'exact') {
    const product = products.find((entry) => entry.id === searchOutcome.match.productId)

    if (product) {
      return { kind: 'known', officialName: product.officialName, product }
    }
  }

  if (searchOutcome.kind === 'multiple') {
    return { kind: 'ambiguous', spokenName, matches: searchOutcome.matches }
  }

  return { kind: 'unknown', spokenName }
}

export function formatJournalProductName(manufacturer: string, officialName: string): string {
  const trimmedManufacturer = manufacturer.trim()
  const trimmedName = officialName.trim()

  if (trimmedManufacturer && trimmedName) {
    return `${trimmedManufacturer} ${trimmedName}`
  }

  return trimmedName || trimmedManufacturer
}
