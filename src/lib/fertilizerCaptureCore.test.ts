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
  startCustomProductCapture,
  updateStockQuantity,
} from './fertilizerCaptureCore'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import type { ProductRecognizeResult } from '../types/productRecognize'

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
