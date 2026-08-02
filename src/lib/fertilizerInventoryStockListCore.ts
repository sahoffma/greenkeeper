import type { FertilizerStockListItem } from '../types/fertilizerInventory'

export const FERTILIZER_STOCK_LIST_CONTAINER_SELECT = `
      id,
      product_id,
      recognition_candidate_id,
      saved_product_profile_id,
      package_size_value,
      package_size_unit,
      label,
      fertilizer_recognition_candidates (
        brand,
        product_line,
        product_name,
        product_form,
        package_size_unit
      ),
      products (
        official_name,
        manufacturer,
        product_form,
        default_unit
      ),
      product_profiles (
        id,
        official_name,
        manufacturer,
        product_form
      )
    ` as const

export interface FertilizerStockListContainerRow {
  id: string
  product_id: string | null
  recognition_candidate_id: string | null
  saved_product_profile_id: string | null
  package_size_value: number | null
  package_size_unit: string | null
  label: string | null
  fertilizer_recognition_candidates:
    | FertilizerStockListCandidateRow
    | FertilizerStockListCandidateRow[]
    | null
  products: FertilizerStockListCatalogRow | FertilizerStockListCatalogRow[] | null
  product_profiles: FertilizerStockListProfileRow | FertilizerStockListProfileRow[] | null
}

interface FertilizerStockListCandidateRow {
  brand: string | null
  product_line: string | null
  product_name: string | null
  product_form: string | null
  package_size_unit: string | null
}

interface FertilizerStockListCatalogRow {
  official_name: string | null
  manufacturer: string | null
  product_form: string | null
  default_unit: string | null
}

interface FertilizerStockListProfileRow {
  id: string
  official_name: string | null
  manufacturer: string | null
  product_form: string | null
}

function readFirstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) {
    return null
  }

  return Array.isArray(value) ? (value[0] ?? null) : value
}

export function buildSavedProductProfileLabel(
  manufacturer: string | null | undefined,
  officialName: string | null | undefined,
): string | null {
  const name = officialName?.trim()
  if (!name) {
    return manufacturer?.trim() || null
  }

  const mfr = manufacturer?.trim()
  if (!mfr) {
    return name
  }

  if (name.toLowerCase().includes(mfr.toLowerCase())) {
    return name
  }

  return `${mfr} ${name}`.trim()
}

function resolveCandidateLabel(candidate: FertilizerStockListCandidateRow | null): string | null {
  if (!candidate) {
    return null
  }

  const label = [candidate.brand, candidate.product_line, candidate.product_name]
    .filter(Boolean)
    .join(' · ')

  return label || null
}

function resolveCatalogLabel(product: FertilizerStockListCatalogRow | null): string | null {
  if (!product) {
    return null
  }

  return buildSavedProductProfileLabel(product.manufacturer, product.official_name)
}

function resolveProductForm(
  profile: FertilizerStockListProfileRow | null,
  product: FertilizerStockListCatalogRow | null,
  candidate: FertilizerStockListCandidateRow | null,
): FertilizerStockListItem['productForm'] {
  const raw =
    profile?.product_form ??
    product?.product_form ??
    candidate?.product_form ??
    null

  if (raw === 'granular' || raw === 'liquid') {
    return raw
  }

  return null
}

function resolveManufacturer(
  profile: FertilizerStockListProfileRow | null,
  product: FertilizerStockListCatalogRow | null,
  candidate: FertilizerStockListCandidateRow | null,
): string | null {
  const fromProfile = profile?.manufacturer?.trim()
  if (fromProfile) {
    return fromProfile
  }

  const fromProduct = product?.manufacturer?.trim()
  if (fromProduct) {
    return fromProduct
  }

  const fromCandidate = candidate?.brand?.trim()
  return fromCandidate || null
}

export function projectFertilizerStockListItem(
  container: FertilizerStockListContainerRow,
  balance: number,
): FertilizerStockListItem {
  const profile = readFirstRelation(container.product_profiles)
  const product = readFirstRelation(container.products)
  const candidate = readFirstRelation(container.fertilizer_recognition_candidates)

  const profileLabel = buildSavedProductProfileLabel(profile?.manufacturer, profile?.official_name)
  const trimmedLabel = container.label?.trim() || null
  const productLabel =
    profileLabel ??
    trimmedLabel ??
    resolveCatalogLabel(product) ??
    resolveCandidateLabel(candidate) ??
    'Dünger'

  const unit =
    container.package_size_unit ??
    candidate?.package_size_unit ??
    product?.default_unit ??
    'kg'

  const packageSizeValue =
    container.package_size_value != null && container.package_size_value > 0
      ? container.package_size_value
      : null

  const packageSizeUnit =
    packageSizeValue != null ? (container.package_size_unit ?? unit) : null

  return {
    id: container.id,
    productLabel,
    balance,
    unit,
    catalogProductId: container.product_id,
    recognitionCandidateId: container.recognition_candidate_id,
    productForm: resolveProductForm(profile, product, candidate),
    manufacturer: resolveManufacturer(profile, product, candidate),
    packageSizeValue,
    packageSizeUnit,
    savedProductProfileId: profile?.id ?? container.saved_product_profile_id,
  }
}

export function partitionFertilizerStockListItems(items: FertilizerStockListItem[]): {
  inStock: FertilizerStockListItem[]
  outOfStock: FertilizerStockListItem[]
} {
  const inStock: FertilizerStockListItem[] = []
  const outOfStock: FertilizerStockListItem[] = []

  for (const item of items) {
    if (item.balance > 0) {
      inStock.push(item)
    } else {
      outOfStock.push(item)
    }
  }

  return { inStock, outOfStock }
}
