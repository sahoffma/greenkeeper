import {
  FERTILIZER_CAPTURE_FIXTURE_PRODUCTS,
  type FertilizerCapturePackageFixture,
  type FertilizerCaptureProductFixture,
  type FertilizerCaptureProductForm,
} from '../data/fertilizerCaptureFixtures'
import type { FertilizerRecognitionCandidate } from '../types/fertilizerRecognitionCandidate'
import type {
  FertilizerCaptureInventorySaveResult,
  FertilizerCaptureSaveResult,
  FertilizerProductStockStatus,
  FertilizerStockListItem,
} from '../types/fertilizerInventory'
import type { ProductRecognizeResult } from '../types/productRecognize'
import {
  buildRecognitionCandidateFromResult,
  buildRecognitionProductLabel,
  catalogProductIdFromResult,
  formatRecognizedProductDisplay,
  planRecognitionStockTransition,
  applyRecognitionRemainderAnswer,
} from './fertilizerRecognitionCore'
import { resolveRecognitionPackageSizeFromRecognition } from './fertilizerRecognitionEnrichmentBasisCore'
import type { InitialStockQuestion, ProductStockStatusKind } from './productRecognizeStockCore'
import { computePurchaseAmount } from './fertilizerInventoryCore'
import { createRandomId } from './randomId'
import type { FertilizerInventoryCreationReason } from './fertilizerInventoryCreationCore'
import {
  buildPackageSizeHandoffDiagnostics,
  logCapturePackageHandoffDiagnostic,
} from './productRecognizePackageHandoffDiagnosticsCore'
import type { RecognitionClientHandoffTrace } from './fertilizerCaptureRecognitionClientHandoffCore'
import {
  cloneProductRecognizeResultForClientHandoff,
  mergeRecognitionClientHandoffTrace,
} from './fertilizerCaptureRecognitionClientHandoffCore'

function finalizeAcceptRecognitionDraft(
  result: ProductRecognizeResult,
  nextDraft: FertilizerCaptureDraft,
): FertilizerCaptureDraft {
  logCapturePackageHandoffDiagnostic(
    'accept_output',
    buildPackageSizeHandoffDiagnostics({
      acceptInputRecognition: result.recognition,
      acceptOutputRecognition: nextDraft.recognitionResult?.recognition ?? null,
      acceptOutputSelectedPackagePresent:
        nextDraft.selectedPackageQuantity != null && nextDraft.selectedPackageQuantity > 0,
    }),
  )

  return nextDraft
}

export function attachProductProfileToCaptureDraft(
  draft: FertilizerCaptureDraft,
  productProfileId: string,
): FertilizerCaptureDraft {
  return {
    ...draft,
    productProfileId,
    recognitionCandidate: draft.recognitionCandidate
      ? {
          ...draft.recognitionCandidate,
          productProfileId,
        }
      : null,
  }
}

export type FertilizerQuantityUnit = 'kg' | 'g' | 'l' | 'ml'

export type FertilizerCaptureStep =
  | 'find'
  | 'clarify-package'
  | 'stock-package-count'
  | 'enter-quantity'
  | 'stock-remainder'
  | 'stock-remainder-amount'
  | 'confirm'
  | 'saved'

export type FertilizerCapturePrototypeAction = 'photo' | 'barcode' | 'dictation'

export interface FertilizerCaptureDraft {
  step: FertilizerCaptureStep
  selectedProduct: FertilizerCaptureProductFixture | null
  customProductLabel: string | null
  customProductForm: FertilizerCaptureProductForm | null
  selectedPackageQuantity: number | null
  selectedPackageUnit: 'kg' | 'l' | null
  quantity: number | null
  unit: FertilizerQuantityUnit
  clarifyPrompt: string | null
  clarifyOptions: string[]
  homeHandoffNotice: string | null
  /** Erkennungsergebnis — kein Katalog-Write. */
  recognitionResult: ProductRecognizeResult | null
  /** Diagnostic-only client recognition package handoff trace. */
  recognitionClientHandoffTrace: RecognitionClientHandoffTrace | null
  recognitionCandidate: FertilizerRecognitionCandidate | null
  /** Fachliches Produktwissen — unabhängig vom persönlichen Recognition Candidate. */
  productProfileId: string | null
  catalogProductId: string | null
  purchaseQuantity: number | null
  previousRemainder: number | null
  packageCount: number | null
  stockQuestion: InitialStockQuestion | null
  stockStatusKind: ProductStockStatusKind | null
  idempotencyKey: string | null
  creationReason: FertilizerInventoryCreationReason | null
  saveResult: FertilizerCaptureSaveResult | FertilizerCaptureInventorySaveResult | null
}

export interface FertilizerCaptureSummary {
  productLine: string
  stockLine: string
  badge: string | null
}

const SMALLER_RELATIVE_TERMS = [
  'kleiner',
  'kleinere',
  'kleineren',
  'kleinerer',
  'der kleine',
  'die kleine',
  'den kleineren',
]

export function defaultUnitForProductForm(form: FertilizerCaptureProductForm): FertilizerQuantityUnit {
  return form === 'liquid' ? 'l' : 'kg'
}

export function searchFixtureProducts(query: string): FertilizerCaptureProductFixture[] {
  const normalized = query.trim().toLowerCase()

  if (!normalized) {
    return []
  }

  return FERTILIZER_CAPTURE_FIXTURE_PRODUCTS.filter((product) => {
    const haystack = `${product.manufacturer} ${product.name}`.toLowerCase()
    return haystack.includes(normalized)
  })
}

export function productRequiresPackageClarification(
  product: FertilizerCaptureProductFixture,
): boolean {
  return product.packageSizes.length > 1
}

export function buildPackageClarifyPrompt(product: FertilizerCaptureProductFixture): {
  prompt: string
  options: string[]
} {
  const labels = product.packageSizes.map((pkg) => pkg.label)
  const optionsText = labels.join(' oder ')

  return {
    prompt: `Ich habe ${product.manufacturer} ${product.name} erkannt. Dieses Produkt gibt es in mehreren Gebindegrößen. Waren es ${optionsText}? Mit der Gebindegröße kann Greenkeeper Deinen aktuellen Bestand korrekt führen.`,
    options: labels,
  }
}

export function resolveRelativePackageChoice(
  product: FertilizerCaptureProductFixture,
  answer: string,
): FertilizerCapturePackageFixture | null {
  const normalized = answer.trim().toLowerCase()

  const direct = product.packageSizes.find((pkg) => normalized.includes(pkg.label.toLowerCase()))
  if (direct) {
    return direct
  }

  const isSmaller = SMALLER_RELATIVE_TERMS.some((term) => normalized.includes(term))

  if (isSmaller && product.packageSizes.length >= 2) {
    const sorted = [...product.packageSizes].sort((a, b) => a.quantity - b.quantity)
    return sorted[0] ?? null
  }

  const isLarger = normalized.includes('größ') || normalized.includes('gross')

  if (isLarger && product.packageSizes.length >= 2) {
    const sorted = [...product.packageSizes].sort((a, b) => b.quantity - a.quantity)
    return sorted[0] ?? null
  }

  return null
}

export function createInitialCaptureDraft(): FertilizerCaptureDraft {
  return {
    step: 'find',
    selectedProduct: null,
    customProductLabel: null,
    customProductForm: null,
    selectedPackageQuantity: null,
    selectedPackageUnit: null,
    quantity: null,
    unit: 'kg',
    clarifyPrompt: null,
    clarifyOptions: [],
    homeHandoffNotice: null,
    recognitionResult: null,
    recognitionClientHandoffTrace: null,
    recognitionCandidate: null,
    productProfileId: null,
    catalogProductId: null,
    purchaseQuantity: null,
    previousRemainder: null,
    packageCount: null,
    stockQuestion: null,
    stockStatusKind: null,
    idempotencyKey: null,
    creationReason: null,
    saveResult: null,
  }
}

export const FREE_STOCK_QUANTITY_QUESTION = 'Wie viel hast Du?'

export function selectFixtureProduct(draft: FertilizerCaptureDraft, product: FertilizerCaptureProductFixture): FertilizerCaptureDraft {
  const unit = defaultUnitForProductForm(product.productForm)

  if (productRequiresPackageClarification(product)) {
    const { prompt, options } = buildPackageClarifyPrompt(product)

    return {
      ...draft,
      step: 'clarify-package',
      selectedProduct: product,
      customProductLabel: null,
      customProductForm: null,
      unit,
      clarifyPrompt: prompt,
      clarifyOptions: options,
      selectedPackageQuantity: null,
      selectedPackageUnit: null,
      quantity: null,
    }
  }

  const onlyPackage = product.packageSizes[0] ?? null

  return proceedToConfirm({
    ...draft,
    selectedProduct: product,
    customProductLabel: null,
    customProductForm: null,
    unit,
    clarifyPrompt: null,
    clarifyOptions: [],
    selectedPackageQuantity: onlyPackage?.quantity ?? null,
    selectedPackageUnit: onlyPackage?.unit ?? null,
    quantity: onlyPackage?.quantity ?? null,
    purchaseQuantity: onlyPackage?.quantity ?? null,
  })
}

export function startCustomProductCapture(draft: FertilizerCaptureDraft, label: string): FertilizerCaptureDraft {
  const trimmed = label.trim()

  return {
    ...draft,
    step: 'enter-quantity',
    selectedProduct: null,
    customProductLabel: trimmed.length > 0 ? trimmed : 'Persönlicher Rasendünger',
    customProductForm: null,
    unit: 'kg',
    clarifyPrompt: null,
    clarifyOptions: [],
    selectedPackageQuantity: null,
    selectedPackageUnit: null,
    quantity: null,
  }
}

export function applyPackageClarification(
  draft: FertilizerCaptureDraft,
  answer: string,
): { draft: FertilizerCaptureDraft; resolved: boolean } {
  if (!draft.selectedProduct) {
    return { draft, resolved: false }
  }

  const resolvedPackage = resolveRelativePackageChoice(draft.selectedProduct, answer)

  if (!resolvedPackage) {
    return { draft, resolved: false }
  }

  return {
    draft: proceedToConfirm({
      ...draft,
      clarifyPrompt: null,
      clarifyOptions: [],
      selectedPackageQuantity: resolvedPackage.quantity,
      selectedPackageUnit: resolvedPackage.unit,
      quantity: resolvedPackage.quantity,
      unit: resolvedPackage.unit,
      purchaseQuantity: resolvedPackage.quantity,
    }),
    resolved: true,
  }
}

export function needsProductFormSelection(draft: FertilizerCaptureDraft): boolean {
  return draft.customProductLabel != null && draft.customProductForm == null
}

export function setCustomProductForm(
  draft: FertilizerCaptureDraft,
  form: FertilizerCaptureProductForm,
): FertilizerCaptureDraft {
  return {
    ...draft,
    customProductForm: form,
    unit: defaultUnitForProductForm(form),
  }
}

export function updateStockQuantity(
  draft: FertilizerCaptureDraft,
  quantity: number | null,
  unit: FertilizerQuantityUnit,
): FertilizerCaptureDraft {
  return {
    ...draft,
    quantity,
    unit,
  }
}

export function applyFreeQuantityEntry(
  draft: FertilizerCaptureDraft,
  quantity: number,
  unit: FertilizerQuantityUnit,
): FertilizerCaptureDraft {
  const withQuantity = updateStockQuantity(draft, quantity, unit)

  return proceedToConfirm({
    ...withQuantity,
    purchaseQuantity: withQuantity.purchaseQuantity ?? quantity,
  })
}

export function isManualCustomProductCapture(draft: FertilizerCaptureDraft): boolean {
  return (
    draft.customProductLabel != null &&
    draft.recognitionResult == null &&
    draft.catalogProductId == null &&
    draft.recognitionCandidate == null
  )
}

export function hasReliablePurchaseAmount(draft: FertilizerCaptureDraft): boolean {
  if (draft.purchaseQuantity != null && draft.purchaseQuantity > 0) {
    return true
  }

  if (draft.selectedPackageQuantity != null && draft.selectedPackageQuantity > 0) {
    return true
  }

  if (
    draft.stockQuestion?.kind === 'ask_previous_remainder' &&
    draft.stockQuestion.purchaseAmount > 0
  ) {
    return true
  }

  if (
    draft.stockQuestion?.kind === 'ask_remainder_amount' &&
    draft.stockQuestion.purchaseAmount > 0
  ) {
    return true
  }

  return false
}

export function resolvePurchaseAmount(draft: FertilizerCaptureDraft): number | null {
  if (draft.purchaseQuantity != null && draft.purchaseQuantity > 0) {
    return draft.purchaseQuantity
  }

  if (draft.stockQuestion?.kind === 'ask_previous_remainder') {
    return draft.stockQuestion.purchaseAmount
  }

  if (draft.stockQuestion?.kind === 'ask_remainder_amount') {
    return draft.stockQuestion.purchaseAmount
  }

  return null
}

export function canProceedToConfirm(draft: FertilizerCaptureDraft): boolean {
  if (draft.quantity == null || Number.isNaN(draft.quantity) || draft.quantity <= 0) {
    return false
  }

  if (isManualCustomProductCapture(draft) && draft.customProductForm == null) {
    return false
  }

  return (
    draft.selectedProduct != null ||
    draft.customProductLabel != null ||
    draft.recognitionCandidate != null ||
    draft.catalogProductId != null
  )
}

export function proceedToConfirm(draft: FertilizerCaptureDraft): FertilizerCaptureDraft {
  if (!canProceedToConfirm(draft)) {
    return draft
  }

  return {
    ...draft,
    step: 'confirm',
    idempotencyKey: draft.idempotencyKey ?? createRandomId(),
  }
}

export function setCreationReason(
  draft: FertilizerCaptureDraft,
  creationReason: FertilizerInventoryCreationReason,
): FertilizerCaptureDraft {
  return {
    ...draft,
    creationReason,
  }
}

export function buildCaptureSummary(draft: FertilizerCaptureDraft): FertilizerCaptureSummary | null {
  if (draft.quantity == null || draft.quantity <= 0) {
    return null
  }

  const unitLabel = draft.unit
  const stockLine = `${formatQuantity(draft.quantity)} ${unitLabel} aktuell im Bestand`

  if (draft.selectedProduct) {
    return {
      productLine: `${draft.selectedProduct.manufacturer} ${draft.selectedProduct.name}`,
      stockLine,
      badge: null,
    }
  }

  if (draft.recognitionResult) {
    const display = formatRecognizedProductDisplay(draft.recognitionResult)
    return {
      productLine: display.title,
      stockLine,
      badge: draft.recognitionCandidate ? 'Persönlich erkannt' : 'Aus Katalog',
    }
  }

  if (draft.customProductLabel) {
    return {
      productLine: draft.customProductLabel,
      stockLine,
      badge: 'Persönlich erfasst',
    }
  }

  return null
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toLocaleString('de-DE', { maximumFractionDigits: 1 })
}

export function shouldShowProductFormFilter(productFormsInView: FertilizerCaptureProductForm[]): boolean {
  const unique = new Set(productFormsInView)
  return unique.has('granular') && unique.has('liquid')
}

export type FertilizerStockFormGroupKey = FertilizerCaptureProductForm | 'unknown'

export type FertilizerStockFormGroup = {
  key: FertilizerStockFormGroupKey
  label: string
  items: FertilizerStockListItem[]
}

export type FertilizerStockListLayout =
  | { mode: 'flat'; items: FertilizerStockListItem[] }
  | { mode: 'byForm'; groups: FertilizerStockFormGroup[] }

export const FERTILIZER_STOCK_UNKNOWN_FORM_GROUP_LABEL = 'Weitere Dünger'

function isUnknownStockProductForm(
  productForm: FertilizerStockListItem['productForm'],
): boolean {
  return productForm == null || productForm === 'unknown'
}

export function layoutStockListByProductForm(
  items: FertilizerStockListItem[],
): FertilizerStockListLayout {
  const formsInView = items
    .map((item) => item.productForm)
    .filter((form): form is FertilizerCaptureProductForm => form === 'granular' || form === 'liquid')

  if (!shouldShowProductFormFilter(formsInView)) {
    return { mode: 'flat', items }
  }

  const granularItems = items.filter((item) => item.productForm === 'granular')
  const liquidItems = items.filter((item) => item.productForm === 'liquid')
  const unknownItems = items.filter((item) => isUnknownStockProductForm(item.productForm))
  const groups: FertilizerStockFormGroup[] = []

  if (granularItems.length > 0) {
    groups.push({ key: 'granular', label: 'Granulat', items: granularItems })
  }

  if (liquidItems.length > 0) {
    groups.push({ key: 'liquid', label: 'Flüssig', items: liquidItems })
  }

  if (unknownItems.length > 0) {
    groups.push({
      key: 'unknown',
      label: FERTILIZER_STOCK_UNKNOWN_FORM_GROUP_LABEL,
      items: unknownItems,
    })
  }

  return { mode: 'byForm', groups }
}

export function createHomeResolvedHandoffDraft(): FertilizerCaptureDraft {
  const product = FERTILIZER_CAPTURE_FIXTURE_PRODUCTS.find((item) => item.id === 'fixture-icl-all-season')

  if (!product) {
    return createInitialCaptureDraft()
  }

  const withPackage = applyPackageClarification(
    {
      ...createInitialCaptureDraft(),
      step: 'clarify-package',
      selectedProduct: product,
      homeHandoffNotice:
        'Von Home übernommen: „Ich habe einen Sack ICL All Season gekauft.“ — 7 kg erkannt.',
    },
    'Der kleinere Sack.',
  ).draft

  return proceedToConfirm(withPackage)
}

export function createHomePurchaseHandoffDraft(): FertilizerCaptureDraft {
  const product = FERTILIZER_CAPTURE_FIXTURE_PRODUCTS.find((item) => item.id === 'fixture-icl-all-season')

  if (!product) {
    return createInitialCaptureDraft()
  }

  const { prompt, options } = buildPackageClarifyPrompt(product)

  return {
    ...createInitialCaptureDraft(),
    step: 'clarify-package',
    selectedProduct: product,
    clarifyPrompt: prompt,
    clarifyOptions: options,
    homeHandoffNotice:
      'Von Home übernommen: „Ich habe einen Sack ICL All Season gekauft.“ — Gebindegröße noch offen.',
  }
}

export type FertilizerCaptureScreenshotMode =
  | 'find'
  | 'clarify-package'
  | 'free-quantity'
  | 'summary'

export function draftForScreenshotMode(mode: FertilizerCaptureScreenshotMode): FertilizerCaptureDraft {
  switch (mode) {
    case 'find':
      return createInitialCaptureDraft()
    case 'clarify-package':
      return createHomePurchaseHandoffDraft()
    case 'free-quantity': {
      const custom = setCustomProductForm(
        startCustomProductCapture(createInitialCaptureDraft(), 'Persönlicher Rasendünger'),
        'granular',
      )
      return updateStockQuantity(custom, 3.5, 'kg')
    }
    case 'summary': {
      const base = selectFixtureProduct(createInitialCaptureDraft(), FERTILIZER_CAPTURE_FIXTURE_PRODUCTS[0]!)
      const withQty = updateStockQuantity(base, 7, 'kg')
      return proceedToConfirm(withQty)
    }
    default:
      return createInitialCaptureDraft()
  }
}

export function prototypeActionNotice(action: FertilizerCapturePrototypeAction): string {
  switch (action) {
    case 'photo':
      return 'Foto-Erkennung ist in diesem Prototyp noch nicht angebunden. Du kannst das Produkt vorerst über die Suche finden.'
    case 'barcode':
      return 'Barcode-Scan ist in diesem Prototyp noch nicht angebunden. Du kannst das Produkt vorerst über die Suche finden.'
    case 'dictation':
      return 'Diktat füllt nur dieses Suchfeld — es startet kein Gespräch mit Greenkeeper.'
  }
}

export function acceptRecognitionResult(
  draft: FertilizerCaptureDraft,
  result: ProductRecognizeResult,
  options: {
    stockStatus: FertilizerProductStockStatus
    packageCount?: number | null
    clientHandoffTrace?: RecognitionClientHandoffTrace | null
  },
): FertilizerCaptureDraft {
  logCapturePackageHandoffDiagnostic(
    'accept_input',
    buildPackageSizeHandoffDiagnostics({
      acceptInputRecognition: result.recognition,
      clientRecognition: result.recognition,
    }),
  )

  const catalogProductId = catalogProductIdFromResult(result)
  const candidate = buildRecognitionCandidateFromResult(result)
  const label = buildRecognitionProductLabel(result)
  const form = result.recognition.form.normalizedValue
  const customForm = form === 'granular' || form === 'liquid' ? form : null
  const canonicalResult = cloneProductRecognizeResultForClientHandoff(result)
  const resolvedPackage = resolveRecognitionPackageSizeFromRecognition(canonicalResult.recognition)
  const packageSize = resolvedPackage.value
  const packageUnit = resolvedPackage.unit ?? canonicalResult.recognition.packageSize.unit
  const normalizedUnit: FertilizerQuantityUnit =
    packageUnit === 'l' || packageUnit === 'ml' || packageUnit === 'g' ? packageUnit : 'kg'
  const packageCount = options.packageCount ?? 1
  const purchaseAmount = computePurchaseAmount({
    packageSize,
    packageCount,
    explicitQuantity: null,
  })

  const transition = planRecognitionStockTransition({
    result: canonicalResult,
    stockStatus: options.stockStatus,
    purchaseAmount: purchaseAmount ?? undefined,
    unit: normalizedUnit,
  })

  const base = {
    ...draft,
    recognitionResult: canonicalResult,
    recognitionClientHandoffTrace:
      options.clientHandoffTrace != null
        ? mergeRecognitionClientHandoffTrace(
            draft.recognitionClientHandoffTrace,
            options.clientHandoffTrace,
          )
        : draft.recognitionClientHandoffTrace,
    recognitionCandidate: candidate,
    catalogProductId,
    customProductLabel: catalogProductId ? null : label,
    customProductForm: customForm,
    selectedProduct: null,
    selectedPackageQuantity: packageSize,
    selectedPackageUnit: packageUnit === 'l' || packageUnit === 'ml' ? ('l' as const) : ('kg' as const),
    packageCount,
    purchaseQuantity: purchaseAmount,
    stockStatusKind: options.stockStatus.status,
    unit: (transition.unit as FertilizerQuantityUnit) ?? normalizedUnit,
    previousRemainder: null,
    stockQuestion: transition.question ?? null,
  }

  if (transition.kind === 'add_to_existing') {
    return finalizeAcceptRecognitionDraft(
      canonicalResult,
      proceedToConfirm({
        ...base,
        quantity: transition.totalStock ?? null,
        purchaseQuantity: transition.purchaseAmount ?? purchaseAmount,
      }),
    )
  }

  if (transition.kind === 'remainder_question') {
    return finalizeAcceptRecognitionDraft(canonicalResult, {
      ...base,
      step: 'stock-remainder',
      quantity: null,
    })
  }

  if (purchaseAmount == null && packageSize != null) {
    return finalizeAcceptRecognitionDraft(canonicalResult, {
      ...base,
      step: 'stock-package-count',
      quantity: null,
    })
  }

  return finalizeAcceptRecognitionDraft(
    canonicalResult,
    proceedToConfirm({
      ...base,
      quantity: purchaseAmount,
      purchaseQuantity: purchaseAmount,
    }),
  )
}

export function applyPackageCount(
  draft: FertilizerCaptureDraft,
  packageCount: number,
): FertilizerCaptureDraft {
  const purchaseAmount = computePurchaseAmount({
    packageSize: draft.selectedPackageQuantity,
    packageCount,
    explicitQuantity: null,
  })

  if (purchaseAmount == null) {
    return draft
  }

  const next: FertilizerCaptureDraft = {
    ...draft,
    packageCount,
    purchaseQuantity: purchaseAmount,
  }

  if (draft.stockStatusKind === 'first_time' && draft.stockQuestion == null) {
    const transition = planRecognitionStockTransition({
      result: draft.recognitionResult!,
      stockStatus: {
        status: 'first_time',
        currentBalance: 0,
        unit: draft.unit,
      },
      purchaseAmount,
      unit: draft.unit,
    })

    if (transition.kind === 'remainder_question') {
      return {
        ...next,
        step: 'stock-remainder',
        stockQuestion: transition.question ?? null,
      }
    }
  }

  if (draft.stockStatusKind === 'has_stock') {
    const existing = draft.stockQuestion?.kind === 'none' ? draft.stockQuestion.totalStock : null
    return proceedToConfirm({
      ...next,
      quantity: (existing ?? 0) + purchaseAmount,
    })
  }

  return proceedToConfirm({
    ...next,
    quantity: purchaseAmount,
  })
}

function completeRemainderNoAnswer(draft: FertilizerCaptureDraft): FertilizerCaptureDraft {
  const unit = (draft.stockQuestion?.kind === 'ask_previous_remainder'
    ? draft.stockQuestion.unit
    : draft.unit) as FertilizerQuantityUnit

  if (!hasReliablePurchaseAmount(draft)) {
    return {
      ...draft,
      step: 'enter-quantity',
      previousRemainder: 0,
      stockQuestion: null,
      quantity: null,
      unit,
    }
  }

  const purchaseAmount = resolvePurchaseAmount(draft)!
  const prepared: FertilizerCaptureDraft = {
    ...draft,
    quantity: purchaseAmount,
    purchaseQuantity: purchaseAmount,
    previousRemainder: 0,
    unit,
  }

  const confirmed = proceedToConfirm(prepared)

  if (confirmed.step === 'confirm') {
    return confirmed
  }

  return {
    ...prepared,
    step: 'enter-quantity',
    quantity: null,
    stockQuestion: null,
  }
}

export function applyStockRemainderAnswer(
  draft: FertilizerCaptureDraft,
  hadPreviousRemainder: boolean,
): FertilizerCaptureDraft {
  if (!draft.stockQuestion || draft.step !== 'stock-remainder') {
    return draft
  }

  const result = applyRecognitionRemainderAnswer(draft.stockQuestion, {
    hadPreviousRemainder,
  })

  if (!result) {
    return draft
  }

  if ('needsAmount' in result) {
    return {
      ...draft,
      step: 'stock-remainder-amount',
      stockQuestion: {
        kind: 'ask_remainder_amount',
        purchaseAmount: result.purchaseAmount,
        unit: result.unit,
      },
    }
  }

  if (!hadPreviousRemainder) {
    return completeRemainderNoAnswer(draft)
  }

  return draft
}

export function applyStockRemainderAmount(
  draft: FertilizerCaptureDraft,
  remainderAmount: number,
): FertilizerCaptureDraft {
  if (!draft.stockQuestion || draft.step !== 'stock-remainder-amount') {
    return draft
  }

  const result = applyRecognitionRemainderAnswer(draft.stockQuestion, {
    hadPreviousRemainder: true,
    previousRemainderAmount: remainderAmount,
  })

  if (!result || 'needsAmount' in result) {
    return draft
  }

  const purchaseQty =
    draft.purchaseQuantity ??
    (draft.stockQuestion?.kind === 'ask_remainder_amount'
      ? draft.stockQuestion.purchaseAmount
      : null)

  return proceedToConfirm({
    ...draft,
    quantity: result.totalStock,
    purchaseQuantity: purchaseQty ?? draft.purchaseQuantity,
    previousRemainder: remainderAmount,
  })
}
