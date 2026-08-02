import { describe, expect, it } from 'vitest'
import {
  FERTILIZER_STOCK_LIST_CONTAINER_SELECT,
  buildSavedProductProfileLabel,
  partitionFertilizerStockListItems,
  projectFertilizerStockListItem,
  type FertilizerStockListContainerRow,
} from './fertilizerInventoryStockListCore'

const PROFILE_ID = '11111111-1111-4111-8111-111111117a01'

function coreContainer(
  overrides: Partial<FertilizerStockListContainerRow> = {},
): FertilizerStockListContainerRow {
  return {
    id: 'container-a',
    product_id: null,
    recognition_candidate_id: null,
    saved_product_profile_id: PROFILE_ID,
    package_size_value: 25,
    package_size_unit: 'kg',
    label: null,
    fertilizer_recognition_candidates: null,
    products: null,
    product_profiles: {
      id: PROFILE_ID,
      official_name: 'Frühjahr & Neuansaat',
      manufacturer: 'Rasendoktor',
      product_form: 'granular',
    },
    ...overrides,
  }
}

describe('fertilizerInventoryStockListCore', () => {
  it('selects saved profile, package size and product_profiles relation', () => {
    expect(FERTILIZER_STOCK_LIST_CONTAINER_SELECT).toContain('saved_product_profile_id')
    expect(FERTILIZER_STOCK_LIST_CONTAINER_SELECT).toContain('package_size_value')
    expect(FERTILIZER_STOCK_LIST_CONTAINER_SELECT).toContain('product_profiles')
    expect(FERTILIZER_STOCK_LIST_CONTAINER_SELECT).toContain('official_name')
    expect(FERTILIZER_STOCK_LIST_CONTAINER_SELECT).toContain('manufacturer')
    expect(FERTILIZER_STOCK_LIST_CONTAINER_SELECT).toContain('product_form')
  })

  it('projects core container with saved product profile', () => {
    const item = projectFertilizerStockListItem(coreContainer(), 20)

    expect(item.savedProductProfileId).toBe(PROFILE_ID)
    expect(item.catalogProductId).toBeNull()
    expect(item.recognitionCandidateId).toBeNull()
    expect(item.productLabel).toBe('Rasendoktor Frühjahr & Neuansaat')
    expect(item.manufacturer).toBe('Rasendoktor')
    expect(item.productForm).toBe('granular')
    expect(item.unit).toBe('kg')
    expect(item.packageSizeValue).toBe(25)
    expect(item.packageSizeUnit).toBe('kg')
    expect(item.balance).toBe(20)
  })

  it('avoids duplicating manufacturer in product label', () => {
    expect(
      buildSavedProductProfileLabel('Rasendoktor', 'Rasendoktor Frühjahr & Neuansaat'),
    ).toBe('Rasendoktor Frühjahr & Neuansaat')
  })

  it('keeps two containers with the same profile separate', () => {
    const first = projectFertilizerStockListItem(
      coreContainer({ id: 'container-a' }),
      20,
    )
    const second = projectFertilizerStockListItem(
      coreContainer({ id: 'container-b', package_size_value: 10 }),
      10,
    )

    expect(first.id).not.toBe(second.id)
    expect(first.savedProductProfileId).toBe(second.savedProductProfileId)
    expect(first.balance).toBe(20)
    expect(second.balance).toBe(10)
    expect(second.packageSizeValue).toBe(10)
  })

  it('does not aggregate items with the same profile', () => {
    const items = [
      projectFertilizerStockListItem(coreContainer({ id: 'container-a' }), 20),
      projectFertilizerStockListItem(coreContainer({ id: 'container-b' }), 5),
    ]

    expect(items).toHaveLength(2)
    expect(items[0]?.balance).not.toBe(items[1]?.balance)
  })

  it('places zero balance items in outOfStock', () => {
    const partitioned = partitionFertilizerStockListItems([
      projectFertilizerStockListItem(coreContainer({ id: 'in-stock' }), 3),
      projectFertilizerStockListItem(coreContainer({ id: 'empty' }), 0),
    ])

    expect(partitioned.inStock).toHaveLength(1)
    expect(partitioned.inStock[0]?.id).toBe('in-stock')
    expect(partitioned.outOfStock).toHaveLength(1)
    expect(partitioned.outOfStock[0]?.id).toBe('empty')
  })

  it('supports legacy catalog containers', () => {
    const item = projectFertilizerStockListItem(
      {
        id: 'legacy-catalog',
        product_id: 'product-1',
        recognition_candidate_id: null,
        saved_product_profile_id: null,
        package_size_value: null,
        package_size_unit: 'kg',
        label: null,
        fertilizer_recognition_candidates: null,
        products: {
          official_name: 'All Season',
          manufacturer: 'ICL',
          product_form: 'granular',
          default_unit: 'kg',
        },
        product_profiles: null,
      },
      7,
    )

    expect(item.productLabel).toBe('ICL All Season')
    expect(item.manufacturer).toBe('ICL')
    expect(item.catalogProductId).toBe('product-1')
    expect(item.productForm).toBe('granular')
  })

  it('supports legacy recognition candidates', () => {
    const item = projectFertilizerStockListItem(
      {
        id: 'legacy-candidate',
        product_id: null,
        recognition_candidate_id: 'candidate-1',
        saved_product_profile_id: null,
        package_size_value: null,
        package_size_unit: 'ml',
        label: null,
        fertilizer_recognition_candidates: {
          brand: 'BrandX',
          product_line: 'Line',
          product_name: 'Liquid Feed',
          product_form: 'liquid',
          package_size_unit: 'ml',
        },
        products: null,
        product_profiles: null,
      },
      1.5,
    )

    expect(item.productLabel).toBe('BrandX · Line · Liquid Feed')
    expect(item.manufacturer).toBe('BrandX')
    expect(item.productForm).toBe('liquid')
    expect(item.unit).toBe('ml')
  })

  it('uses container label before legacy joins when no saved profile exists', () => {
    const item = projectFertilizerStockListItem(
      {
        id: 'legacy-label',
        product_id: 'product-1',
        recognition_candidate_id: null,
        saved_product_profile_id: null,
        package_size_value: null,
        package_size_unit: 'kg',
        label: 'Mein Sack',
        fertilizer_recognition_candidates: null,
        products: {
          official_name: 'All Season',
          manufacturer: 'ICL',
          product_form: 'granular',
          default_unit: 'kg',
        },
        product_profiles: null,
      },
      2,
    )

    expect(item.productLabel).toBe('Mein Sack')
  })

  it('falls back safely when profile relation is missing on legacy data', () => {
    const item = projectFertilizerStockListItem(
      {
        id: 'legacy-bare',
        product_id: null,
        recognition_candidate_id: null,
        saved_product_profile_id: null,
        package_size_value: null,
        package_size_unit: null,
        label: null,
        fertilizer_recognition_candidates: null,
        products: null,
        product_profiles: null,
      },
      0,
    )

    expect(item.productLabel).toBe('Dünger')
    expect(item.manufacturer).toBeNull()
    expect(item.packageSizeValue).toBeNull()
  })

  it('prefers saved profile label over container label for core containers', () => {
    const item = projectFertilizerStockListItem(
      coreContainer({ label: 'Alter Labeltext' }),
      5,
    )

    expect(item.productLabel).toBe('Rasendoktor Frühjahr & Neuansaat')
  })

  it('does not derive package size from balance', () => {
    const item = projectFertilizerStockListItem(coreContainer(), 3.5)

    expect(item.packageSizeValue).toBe(25)
    expect(item.balance).toBe(3.5)
  })

  it('does not mutate container input', () => {
    const container = coreContainer()
    const snapshot = structuredClone(container)

    projectFertilizerStockListItem(container, 12)

    expect(container).toEqual(snapshot)
  })
})
