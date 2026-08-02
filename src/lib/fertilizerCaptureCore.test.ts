import { describe, expect, it } from 'vitest'
import { FERTILIZER_CAPTURE_FIXTURE_PRODUCTS } from '../data/fertilizerCaptureFixtures'
import {
  applyPackageClarification,
  applyStockRemainderAmount,
  applyStockRemainderAnswer,
  acceptRecognitionResult,
  buildCaptureSummary,
  canProceedToConfirm,
  createHomePurchaseHandoffDraft,
  createInitialCaptureDraft,
  defaultUnitForProductForm,
  draftForScreenshotMode,
  needsProductFormSelection,
  proceedToConfirm,
  productRequiresPackageClarification,
  prototypeActionNotice,
  resolveRelativePackageChoice,
  searchFixtureProducts,
  selectFixtureProduct,
  setCustomProductForm,
  shouldShowProductFormFilter,
  layoutStockListByProductForm,
  FERTILIZER_STOCK_UNKNOWN_FORM_GROUP_LABEL,
  startCustomProductCapture,
  updateStockQuantity,
} from './fertilizerCaptureCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import type { ProductRecognizeResult } from '../types/productRecognize'

import type { FertilizerStockListItem } from '../types/fertilizerInventory'

function stockItem(
  overrides: Partial<FertilizerStockListItem> & Pick<FertilizerStockListItem, 'id' | 'productLabel'>,
): FertilizerStockListItem {
  return {
    balance: 5,
    unit: 'kg',
    catalogProductId: null,
    recognitionCandidateId: null,
    productForm: 'granular',
    manufacturer: null,
    packageSizeValue: null,
    packageSizeUnit: null,
    savedProductProfileId: null,
    baseUnit: null,
    accessKind: null,
    ...overrides,
  }
}

describe('fertilizerCaptureCore', () => {
  it('finds fixture product by unique search', () => {
    const results = searchFixtureProducts('All Season')
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe('fixture-icl-all-season')
  })

  it('requires package clarification for dual-package product', () => {
    const product = FERTILIZER_CAPTURE_FIXTURE_PRODUCTS[1]!
    expect(productRequiresPackageClarification(product)).toBe(true)

    const draft = selectFixtureProduct(createInitialCaptureDraft(), product)
    expect(draft.step).toBe('clarify-package')
    expect(draft.clarifyOptions).toEqual(['7 kg', '25 kg'])
  })

  it('resolves smaller sack answer to 7 kg package', () => {
    const product = FERTILIZER_CAPTURE_FIXTURE_PRODUCTS[1]!
    const resolved = resolveRelativePackageChoice(product, 'Diesmal der kleinere Sack.')
    expect(resolved?.quantity).toBe(7)
    expect(resolved?.unit).toBe('kg')
  })

  it('supports free quantity of 3.5 kg without full package', () => {
    const draft = updateStockQuantity(
      setCustomProductForm(
        startCustomProductCapture(createInitialCaptureDraft(), 'Persönlicher Rasendünger'),
        'granular',
      ),
      3.5,
      'kg',
    )

    expect(draft.quantity).toBe(3.5)
    expect(draft.selectedPackageQuantity).toBeNull()
    expect(canProceedToConfirm(draft)).toBe(true)
  })

  it('requires product form selection for custom products', () => {
    const custom = startCustomProductCapture(createInitialCaptureDraft(), 'Persönlicher Rasendünger')
    expect(needsProductFormSelection(custom)).toBe(true)
    expect(canProceedToConfirm(updateStockQuantity(custom, 3.5, 'kg'))).toBe(false)

    const withForm = setCustomProductForm(custom, 'granular')
    expect(needsProductFormSelection(withForm)).toBe(false)
    expect(canProceedToConfirm(updateStockQuantity(withForm, 3.5, 'kg'))).toBe(true)
  })

  it('defaults liquid products to liter unit', () => {
    const liquid = FERTILIZER_CAPTURE_FIXTURE_PRODUCTS[2]!
    const draft = selectFixtureProduct(createInitialCaptureDraft(), liquid)
    expect(defaultUnitForProductForm(liquid.productForm)).toBe('l')
    expect(draft.unit).toBe('l')
  })

  it('allows confirm without optional fields', () => {
    const product = FERTILIZER_CAPTURE_FIXTURE_PRODUCTS[0]!
    const draft = proceedToConfirm(
      updateStockQuantity(selectFixtureProduct(createInitialCaptureDraft(), product), 20, 'kg'),
    )
    expect(draft.step).toBe('confirm')
    expect(buildCaptureSummary(draft)?.stockLine).toBe('20 kg aktuell im Bestand')
  })

  it('hides product-form filter when only one form is present', () => {
    expect(shouldShowProductFormFilter(['granular'])).toBe(false)
    expect(shouldShowProductFormFilter(['granular', 'liquid'])).toBe(true)
  })

  it('groups stock list by product form only when both forms are present', () => {
    const granularOnly = layoutStockListByProductForm([
      stockItem({ id: '1', productLabel: 'Granulat A', productForm: 'granular' }),
    ])

    expect(granularOnly.mode).toBe('flat')

    const mixed = layoutStockListByProductForm([
      stockItem({ id: '1', productLabel: 'Granulat A', productForm: 'granular' }),
      stockItem({ id: '2', productLabel: 'Flüssig B', productForm: 'liquid', balance: 2, unit: 'l' }),
    ])

    expect(mixed.mode).toBe('byForm')
    if (mixed.mode === 'byForm') {
      expect(mixed.groups).toHaveLength(2)
      expect(mixed.groups[0]?.label).toBe('Granulat')
      expect(mixed.groups[1]?.label).toBe('Flüssig')
    }
  })

  describe('layoutStockListByProductForm — unknown product form', () => {
    it('1 — nur null: flache Liste, alle Produkte sichtbar', () => {
      const items = [
        stockItem({ id: 'u1', productLabel: 'Rasendoktor Stress-Manager', productForm: null }),
        stockItem({ id: 'u2', productLabel: 'Unbekannter Dünger', productForm: null }),
      ]

      const layout = layoutStockListByProductForm(items)

      expect(layout.mode).toBe('flat')
      if (layout.mode === 'flat') {
        expect(layout.items).toHaveLength(2)
        expect(layout.items.map((item) => item.id)).toEqual(['u1', 'u2'])
      }
    })

    it('2 — granular + null: flache Liste ohne falsche Gruppierung', () => {
      const layout = layoutStockListByProductForm([
        stockItem({ id: 'g1', productLabel: 'Granulat A', productForm: 'granular' }),
        stockItem({ id: 'u1', productLabel: 'Rasendoktor', productForm: null }),
      ])

      expect(layout.mode).toBe('flat')
    })

    it('3 — liquid + null: flache Liste ohne falsche Gruppierung', () => {
      const layout = layoutStockListByProductForm([
        stockItem({ id: 'l1', productLabel: 'Flüssig A', productForm: 'liquid', unit: 'l' }),
        stockItem({ id: 'u1', productLabel: 'Rasendoktor', productForm: null }),
      ])

      expect(layout.mode).toBe('flat')
    })

    it('4 — granular + liquid: gruppiert ohne Unknown-Gruppe', () => {
      const layout = layoutStockListByProductForm([
        stockItem({ id: 'g1', productLabel: 'Granulat A', productForm: 'granular' }),
        stockItem({ id: 'l1', productLabel: 'Flüssig B', productForm: 'liquid', unit: 'l' }),
      ])

      expect(layout.mode).toBe('byForm')
      if (layout.mode === 'byForm') {
        expect(layout.groups).toHaveLength(2)
        expect(layout.groups.map((group) => group.label)).toEqual(['Granulat', 'Flüssig'])
        expect(layout.groups.some((group) => group.key === 'unknown')).toBe(false)
      }
    })

    it('5 — granular + liquid + null: getrennte Gruppen inkl. Weitere Dünger', () => {
      const layout = layoutStockListByProductForm([
        stockItem({ id: 'g1', productLabel: 'Granulat A', productForm: 'granular' }),
        stockItem({ id: 'l1', productLabel: 'Flüssig B', productForm: 'liquid', unit: 'l' }),
        stockItem({ id: 'u1', productLabel: 'Rasendoktor Stress-Manager', productForm: null }),
      ])

      expect(layout.mode).toBe('byForm')
      if (layout.mode === 'byForm') {
        expect(layout.groups).toHaveLength(3)
        expect(layout.groups[0]?.items.map((item) => item.id)).toEqual(['g1'])
        expect(layout.groups[1]?.items.map((item) => item.id)).toEqual(['l1'])
        expect(layout.groups[2]?.key).toBe('unknown')
        expect(layout.groups[2]?.label).toBe(FERTILIZER_STOCK_UNKNOWN_FORM_GROUP_LABEL)
        expect(layout.groups[2]?.items.map((item) => item.id)).toEqual(['u1'])
        expect(layout.groups[0]?.items.some((item) => item.productForm == null)).toBe(false)
      }
    })

    it('6 — mehrere unbekannte Produkte: stabil, vollständig, ohne Duplikate', () => {
      const items = [
        stockItem({ id: 'g1', productLabel: 'Granulat A', productForm: 'granular' }),
        stockItem({ id: 'l1', productLabel: 'Flüssig B', productForm: 'liquid', unit: 'l' }),
        stockItem({ id: 'u1', productLabel: 'Unknown 1', productForm: null }),
        stockItem({ id: 'u2', productLabel: 'Unknown 2', productForm: null }),
      ]

      const layout = layoutStockListByProductForm(items)

      expect(layout.mode).toBe('byForm')
      if (layout.mode === 'byForm') {
        const groupedIds = layout.groups.flatMap((group) => group.items.map((item) => item.id))
        expect(groupedIds).toEqual(['g1', 'l1', 'u1', 'u2'])
        expect(new Set(groupedIds).size).toBe(4)
        expect(layout.groups[2]?.items.map((item) => item.id)).toEqual(['u1', 'u2'])
      }
    })

    it('7 — leere Liste: flaches Layout mit leerer Itemliste', () => {
      const layout = layoutStockListByProductForm([])

      expect(layout.mode).toBe('flat')
      if (layout.mode === 'flat') {
        expect(layout.items).toEqual([])
      }
    })

    it('8 — gleiche Core-Logik für inStock und outOfStock', () => {
      const inStock = [
        stockItem({ id: 'g1', productLabel: 'Granulat A', productForm: 'granular' }),
        stockItem({ id: 'l1', productLabel: 'Flüssig B', productForm: 'liquid', unit: 'l' }),
        stockItem({ id: 'u1', productLabel: 'Rasendoktor', productForm: null }),
      ]
      const outOfStock = [
        stockItem({ id: 'g2', productLabel: 'Leer Granulat', productForm: 'granular', balance: 0 }),
        stockItem({ id: 'u2', productLabel: 'Leer Unknown', productForm: null, balance: 0 }),
      ]

      const inLayout = layoutStockListByProductForm(inStock)
      const outLayout = layoutStockListByProductForm(outOfStock)

      expect(inLayout.mode).toBe('byForm')
      expect(outLayout.mode).toBe('flat')
      if (inLayout.mode === 'byForm') {
        expect(inLayout.groups.map((group) => group.label)).toEqual([
          'Granulat',
          'Flüssig',
          FERTILIZER_STOCK_UNKNOWN_FORM_GROUP_LABEL,
        ])
      }
    })
  })

  it('separates dictation from conversation semantically via prototype notice text', () => {
    const notice = prototypeActionNotice('dictation')
    expect(notice).toMatch(/nur dieses Suchfeld/)
    expect(notice).toMatch(/startet kein Gespräch/)
  })

  it('does not expose catalog terminology in user-facing summary', () => {
    const summary = buildCaptureSummary(
      proceedToConfirm(
        updateStockQuantity(
          selectFixtureProduct(createInitialCaptureDraft(), FERTILIZER_CAPTURE_FIXTURE_PRODUCTS[0]!),
          7,
          'kg',
        ),
      ),
    )

    expect(summary?.productLine).not.toMatch(/Katalog/i)
  })

  it('models home handoff with single clarify question', () => {
    const draft = createHomePurchaseHandoffDraft()
    expect(draft.homeHandoffNotice).toMatch(/Home übernommen/)
    expect(draft.step).toBe('clarify-package')

    const { draft: resolved, resolved: ok } = applyPackageClarification(draft, 'Der kleinere Sack.')
    expect(ok).toBe(true)
    expect(resolved.quantity).toBe(7)
    expect(resolved.step).toBe('confirm')
  })

  it('provides screenshot drafts for documentation modes', () => {
    expect(draftForScreenshotMode('find').step).toBe('find')
    expect(draftForScreenshotMode('clarify-package').step).toBe('clarify-package')
    expect(draftForScreenshotMode('free-quantity').quantity).toBe(3.5)
    expect(draftForScreenshotMode('summary').step).toBe('confirm')
  })

  it('goes directly to confirm after first purchase with no previous remainder', () => {
    const result = mockRecognitionResult()
    let draft = acceptRecognitionResult(createInitialCaptureDraft(), result, {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    expect(draft.step).toBe('stock-remainder')
    draft = applyStockRemainderAnswer(draft, false)
    expect(draft.step).toBe('confirm')
    expect(draft.quantity).toBe(5)
    expect(draft.purchaseQuantity).toBe(5)
    expect(draft.previousRemainder).toBe(0)
  })

  it('asks remainder amount once and proceeds to confirm when previous stock existed', () => {
    const result = mockRecognitionResult()
    let draft = acceptRecognitionResult(createInitialCaptureDraft(), result, {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    draft = applyStockRemainderAnswer(draft, true)
    expect(draft.step).toBe('stock-remainder-amount')

    draft = applyStockRemainderAmount(draft, 1.5)
    expect(draft.step).toBe('confirm')
    expect(draft.quantity).toBe(6.5)
    expect(draft.purchaseQuantity).toBe(5)
    expect(draft.previousRemainder).toBe(1.5)
  })

  it('skips manual quantity entry for single-package fixture products', () => {
    const product = FERTILIZER_CAPTURE_FIXTURE_PRODUCTS[0]!
    const draft = selectFixtureProduct(createInitialCaptureDraft(), product)
    expect(draft.step).toBe('confirm')
    expect(draft.quantity).toBe(20)
  })

  it('proceeds to confirm after remainder no when product form is unknown', () => {
    const result = mockRecognitionResult()
    let draft = acceptRecognitionResult(createInitialCaptureDraft(), result, {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    draft = {
      ...draft,
      customProductForm: null,
    }

    expect(draft.customProductForm).toBeNull()
    draft = applyStockRemainderAnswer(draft, false)
    expect(draft.step).toBe('confirm')
    expect(draft.quantity).toBe(5)
    expect(draft.previousRemainder).toBe(0)
  })

  it('proceeds to confirm after remainder no for catalog-matched products', () => {
    const result = {
      ...mockRecognitionResult(),
      catalogMatch: {
        matched: true,
        productId: 'catalog-rasendoktor',
        matchType: 'exact',
        confidence: 1,
      },
    } as ProductRecognizeResult

    let draft = acceptRecognitionResult(createInitialCaptureDraft(), result, {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    draft = applyStockRemainderAnswer(draft, false)
    expect(draft.step).toBe('confirm')
    expect(draft.catalogProductId).toBe('catalog-rasendoktor')
    expect(draft.quantity).toBe(5)
    expect(draft.previousRemainder).toBe(0)
  })

  it('routes to enter-quantity after remainder no without reliable purchase amount', () => {
    let draft = acceptRecognitionResult(createInitialCaptureDraft(), mockRecognitionResult(), {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    draft = {
      ...draft,
      purchaseQuantity: null,
      selectedPackageQuantity: null,
      stockQuestion: {
        kind: 'ask_previous_remainder',
        purchaseAmount: 0,
        unit: 'kg',
      },
    }

    draft = applyStockRemainderAnswer(draft, false)
    expect(draft.step).toBe('enter-quantity')
    expect(draft.previousRemainder).toBe(0)
    expect(draft.quantity).toBeNull()
  })
})

function mockRecognitionResult(): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 1,
    dataCompleteness: 0.2,
    recognition: recognitionFromImageAnalysis({
      brand: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Frühjahr & Neuansaat',
      variant: null,
      productDescriptor: null,
      manufacturer: null,
      npkLabel: '14-28-10',
      nitrogen: 14,
      phosphate: 28,
      potash: 10,
      packageSizeValue: 5,
      packageSizeUnit: 'kg',
      form: 'granular',
      gtin: null,
      textFragments: [],
      fieldConfidence: { brand: 0.95, productLine: 0.9, productName: 0.92, npk: 0.93, packageSize: 0.9 },
    }),
    catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
    sources: [],
    missingRequiredFields: [],
    nextAction: { type: 'none', message: null },
    stockCapture: {
      allowed: true,
      recognitionCandidate: true,
      persistToCatalog: false,
      message: null,
    },
    diagnostics: { model: 'test', latencyMs: 1, estimatedCost: null, warnings: [] },
    steps: [],
    spike: true,
  } as ProductRecognizeResult
}
