import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CameraIcon } from '../icons/CameraIcon'
import { PencilIcon } from '../icons/PencilIcon'
import { useAuth } from '../../contexts/AuthContext'
import { isProductRecognitionEnabled } from '../../lib/featureFlags'
import {
  applyPackageClarification,
  applyPackageCount,
  applyFreeQuantityEntry,
  applyStockRemainderAmount,
  applyStockRemainderAnswer,
  acceptRecognitionResult,
  buildCaptureSummary,
  canProceedToConfirm,
  createHomePurchaseHandoffDraft,
  createHomeResolvedHandoffDraft,
  createInitialCaptureDraft,
  defaultUnitForProductForm,
  draftForScreenshotMode,
  FREE_STOCK_QUANTITY_QUESTION,
  type FertilizerCaptureDraft,
  type FertilizerCapturePrototypeAction,
  type FertilizerCaptureScreenshotMode,
  type FertilizerQuantityUnit,
  needsProductFormSelection,
  proceedToConfirm,
  prototypeActionNotice,
  searchFixtureProducts,
  selectFixtureProduct,
  setCreationReason,
  setCustomProductForm,
  startCustomProductCapture,
} from '../../lib/fertilizerCaptureCore'
import {
  fingerprintFromRecognitionResult,
  formatInventorySaveConfirmationLines,
  formatSaveConfirmationLines,
} from '../../lib/fertilizerInventoryCore'
import { fetchFertilizerProductStockStatus } from '../../lib/fertilizerInventory'
import {
  catalogProductIdFromResult,
  INITIAL_STOCK_PREVIOUS_REMAINDER_QUESTION,
  INITIAL_STOCK_REMAINDER_AMOUNT_QUESTION,
} from '../../lib/fertilizerRecognitionCore'
import { PACKAGE_COUNT_QUESTION } from '../../lib/productRecognizeStockCore'
import { FERTILIZER_ROUTES } from '../../lib/fertilizerRoutes'
import {
  clearFertilizerCaptureSession,
  clearFertilizerCaptureSavedReceipt,
  loadFertilizerCaptureSavedReceipt,
  loadFertilizerCaptureSession,
  persistFertilizerCaptureSession,
} from '../../lib/fertilizerCaptureSession'
import { completeCaptureAfterSave } from '../../lib/fertilizerCaptureFlowActions'
import {
  FERTILIZER_CAPTURE_CREATION_REASON_OPTIONS,
  saveFertilizerCaptureToInventoryCore,
} from '../../lib/fertilizerCaptureInventorySaveCore'
import { isFertilizerCaptureInventorySaveResult } from '../../types/fertilizerInventory'
import {
  createInitialCaptureUiState,
  createInitialPhotoRecognitionSession,
  isEditableCaptureDraft,
  resolvePersistedCaptureBootstrap,
  type FertilizerCaptureUiState,
  type PhotoRecognitionSessionState,
} from '../../lib/fertilizerCaptureSessionCore'
import type { ProductRecognizeResult } from '../../types/productRecognize'
import { FertilizerPhotoRecognition } from './FertilizerPhotoRecognition'
import { SubpageHeader } from '../layout/SubpageHeader'
import {
  createCaptureNavigationSnapshot,
  fallbackCaptureStepBack,
  popCaptureNavigationStack,
  shouldExitCaptureFlowOnBack,
  type CaptureNavigationSnapshot,
} from '../../lib/fertilizerCaptureNavigationCore'
import styles from './FertilizerCaptureFlow.module.css'

const SCREENSHOT_MODES = new Set<FertilizerCaptureScreenshotMode>([
  'find',
  'clarify-package',
  'free-quantity',
  'summary',
])

function parseScreenshotMode(value: string | null): FertilizerCaptureScreenshotMode | null {
  if (!value || !SCREENSHOT_MODES.has(value as FertilizerCaptureScreenshotMode)) {
    return null
  }

  return value as FertilizerCaptureScreenshotMode
}

function initialDraft(searchParams: URLSearchParams): FertilizerCaptureDraft {
  const screenshotMode = parseScreenshotMode(searchParams.get('screenshot'))
  if (screenshotMode) {
    return draftForScreenshotMode(screenshotMode)
  }

  if (searchParams.get('handoff') === 'home-all-season') {
    return createHomePurchaseHandoffDraft()
  }

  if (searchParams.get('handoff') === 'home-resolved') {
    return createHomeResolvedHandoffDraft()
  }

  return createInitialCaptureDraft()
}

function uiFormFields(ui: FertilizerCaptureUiState) {
  return {
    query: ui.query,
    clarifyAnswer: ui.clarifyAnswer,
    quantityInput: ui.quantityInput,
    unit: ui.unit,
    remainderAmountInput: ui.remainderAmountInput,
    packageCountInput: ui.packageCountInput,
    optionalOpen: ui.optionalOpen,
    notice: ui.notice,
  }
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 14.5a3 3 0 0 0 3-3V7.5a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M6.5 11v1a5.5 5.5 0 0 0 11 0v-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 17.5v2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function BarcodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 7v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10.5 7v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13.5 7v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M16 7v10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 7v10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function shouldUseUrlBootstrap(searchParams: URLSearchParams): boolean {
  return (
    parseScreenshotMode(searchParams.get('screenshot')) != null ||
    searchParams.get('handoff') === 'home-all-season' ||
    searchParams.get('handoff') === 'home-resolved'
  )
}

function resolveCaptureBootstrap(searchParams: URLSearchParams, userId: string | null) {
  if (shouldUseUrlBootstrap(searchParams)) {
    const captureDraft = initialDraft(searchParams)

    return {
      captureDraft,
      ui: createInitialCaptureUiState(captureDraft),
      persistenceEnabled: false,
    }
  }

  const storedReceipt = loadFertilizerCaptureSavedReceipt(userId)
  const storedSession = loadFertilizerCaptureSession(userId)
  const restored = resolvePersistedCaptureBootstrap({
    storedReceipt,
    storedSession,
  })

  if (restored) {
    return {
      captureDraft: restored.captureDraft,
      ui: restored.ui,
      persistenceEnabled: true,
    }
  }

  const captureDraft = createInitialCaptureDraft()

  return {
    captureDraft,
    ui: createInitialCaptureUiState(captureDraft),
    persistenceEnabled: true,
  }
}

export function FertilizerCaptureFlow() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const bootstrapRef = useRef<ReturnType<typeof resolveCaptureBootstrap> | null>(null)

  if (bootstrapRef.current == null) {
    bootstrapRef.current = resolveCaptureBootstrap(
      new URLSearchParams(window.location.search),
      userId,
    )
  }

  const bootstrap = bootstrapRef.current
  const initialForm = uiFormFields(bootstrap.ui)
  const persistenceEnabled = bootstrap.persistenceEnabled

  const [draft, setDraft] = useState<FertilizerCaptureDraft>(bootstrap.captureDraft)
  const [query, setQuery] = useState(initialForm.query)
  const [clarifyAnswer, setClarifyAnswer] = useState(initialForm.clarifyAnswer)
  const [quantityInput, setQuantityInput] = useState(initialForm.quantityInput)
  const [unit, setUnit] = useState<FertilizerQuantityUnit>(initialForm.unit)
  const [optionalOpen, setOptionalOpen] = useState(initialForm.optionalOpen)
  const [notice, setNotice] = useState<string | null>(initialForm.notice)
  const [photoRecognitionOpen, setPhotoRecognitionOpen] = useState(
    bootstrap.ui.photoRecognitionOpen,
  )
  const [photoRecognitionSession, setPhotoRecognitionSession] =
    useState<PhotoRecognitionSessionState | null>(bootstrap.ui.photoRecognition)
  const [remainderAmountInput, setRemainderAmountInput] = useState(initialForm.remainderAmountInput)
  const [packageCountInput, setPackageCountInput] = useState(initialForm.packageCountInput)
  const [navigationStack, setNavigationStack] = useState<CaptureNavigationSnapshot[]>(
    bootstrap.ui.navigationStack ?? [],
  )
  const [saving, setSaving] = useState(false)

  function createCurrentSnapshot(): CaptureNavigationSnapshot {
    return createCaptureNavigationSnapshot({
      captureDraft: draft,
      photoRecognitionOpen,
      photoRecognition: photoRecognitionSession,
      query,
      quantityInput,
      unit,
      clarifyAnswer,
      remainderAmountInput,
      packageCountInput,
      optionalOpen,
      notice,
    })
  }

  function pushNavigationSnapshot() {
    setNavigationStack((stack) => [...stack, createCurrentSnapshot()])
  }

  function restoreNavigationSnapshot(snapshot: CaptureNavigationSnapshot) {
    setDraft(snapshot.captureDraft)
    setPhotoRecognitionOpen(snapshot.photoRecognitionOpen)
    setPhotoRecognitionSession(snapshot.photoRecognition)
    setQuery(snapshot.query)
    setQuantityInput(snapshot.quantityInput)
    setUnit(snapshot.unit)
    setClarifyAnswer(snapshot.clarifyAnswer)
    setRemainderAmountInput(snapshot.remainderAmountInput)
    setPackageCountInput(snapshot.packageCountInput)
    setOptionalOpen(snapshot.optionalOpen)
    setNotice(snapshot.notice)
  }

  function exitCaptureFlow() {
    if (persistenceEnabled) {
      clearFertilizerCaptureSession(userId)

      if (draft.step === 'saved') {
        clearFertilizerCaptureSavedReceipt(userId)
      }
    }

    navigate(FERTILIZER_ROUTES.hub)
  }

  function handleFlowBack() {
    if (photoRecognitionOpen) {
      if (navigationStack.length > 0) {
        const { snapshot, remaining } = popCaptureNavigationStack(navigationStack)

        if (snapshot) {
          restoreNavigationSnapshot(snapshot)
          setNavigationStack(remaining)
          return
        }
      }

      setPhotoRecognitionOpen(false)
      setPhotoRecognitionSession(null)
      return
    }

    if (
      shouldExitCaptureFlowOnBack({
        captureStep: draft.step,
        photoRecognitionOpen,
        navigationStackLength: navigationStack.length,
      })
    ) {
      exitCaptureFlow()
      return
    }

    if (navigationStack.length > 0) {
      const { snapshot, remaining } = popCaptureNavigationStack(navigationStack)

      if (snapshot) {
        restoreNavigationSnapshot(snapshot)
        setNavigationStack(remaining)
        return
      }
    }

    const fallback = fallbackCaptureStepBack(draft)

    if (fallback) {
      setDraft(fallback)
      return
    }

    exitCaptureFlow()
  }

  const buildUiSnapshot = useCallback(
    (): FertilizerCaptureUiState => ({
      photoRecognitionOpen,
      photoRecognition: photoRecognitionSession,
      query,
      quantityInput,
      unit,
      clarifyAnswer,
      remainderAmountInput,
      packageCountInput,
      optionalOpen,
      notice,
      navigationStack,
    }),
    [
      photoRecognitionOpen,
      photoRecognitionSession,
      query,
      quantityInput,
      unit,
      clarifyAnswer,
      remainderAmountInput,
      packageCountInput,
      optionalOpen,
      notice,
      navigationStack,
    ],
  )

  useEffect(() => {
    if (!persistenceEnabled || !isEditableCaptureDraft(draft)) {
      return
    }

    persistFertilizerCaptureSession({
      userId,
      captureDraft: draft,
      ui: buildUiSnapshot(),
    })
  }, [buildUiSnapshot, draft, persistenceEnabled, userId])

  const productRecognitionEnabled = isProductRecognitionEnabled()

  const searchId = useId()
  const quantityId = useId()
  const clarifyId = useId()

  const results = useMemo(() => searchFixtureProducts(query), [query])
  const summary = draft.step === 'confirm' ? buildCaptureSummary(draft) : null
  const hasSearchQuery = query.trim().length > 0
  const showNoResultsHint = hasSearchQuery && results.length === 0

  function showPrototypeNotice(action: FertilizerCapturePrototypeAction) {
    setNotice(prototypeActionNotice(action))
  }

  function handlePhotoCaptureClick() {
    if (productRecognitionEnabled) {
      pushNavigationSnapshot()
      setPhotoRecognitionOpen(true)
      setPhotoRecognitionSession((current) => current ?? createInitialPhotoRecognitionSession())
      setNotice(null)
      return
    }

    showPrototypeNotice('photo')
  }

  async function handleRecognitionAccept(result: ProductRecognizeResult) {
    pushNavigationSnapshot()
    setPhotoRecognitionOpen(false)
    setPhotoRecognitionSession(null)
    setNotice(null)

    try {
      const catalogProductId = catalogProductIdFromResult(result)
      const identityFingerprint = catalogProductId ? null : fingerprintFromRecognitionResult(result)
      const unit = result.recognition.packageSize.unit ?? 'kg'

      const stockStatus = await fetchFertilizerProductStockStatus({
        catalogProductId,
        identityFingerprint,
        unit,
      })

      let nextDraft = acceptRecognitionResult(draft, result, { stockStatus })

      setDraft(nextDraft)

      if (nextDraft.quantity != null) {
        setQuantityInput(String(nextDraft.quantity).replace('.', ','))
      } else {
        setQuantityInput('')
      }
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'Der Bestand konnte nicht geprüft werden.',
      )
    }
  }

  function handleRecognitionCancel() {
    if (navigationStack.length > 0) {
      const { snapshot, remaining } = popCaptureNavigationStack(navigationStack)

      if (snapshot) {
        restoreNavigationSnapshot(snapshot)
        setNavigationStack(remaining)
        return
      }
    }

    setPhotoRecognitionOpen(false)
    setPhotoRecognitionSession(null)
  }

  function handleRemainderYes() {
    const snapshot = createCurrentSnapshot()
    setNavigationStack((stack) => [...stack, snapshot])
    setDraft((current) => applyStockRemainderAnswer(current, true))
  }

  function handleRemainderNo() {
    const snapshot = createCurrentSnapshot()
    setNavigationStack((stack) => [...stack, snapshot])
    setDraft((current) => applyStockRemainderAnswer(current, false))
  }

  function handleRemainderAmountSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = Number.parseFloat(remainderAmountInput.replace(',', '.'))

    if (Number.isNaN(parsed) || parsed < 0) {
      setNotice('Bitte gib eine gültige Restmenge ein.')
      return
    }

    pushNavigationSnapshot()
    setDraft(applyStockRemainderAmount(draft, parsed))
    setNotice(null)
  }

  function handleSelectProduct(productId: string) {
    const product = results.find((item) => item.id === productId)
    if (!product) {
      return
    }

    pushNavigationSnapshot()
    setDraft(selectFixtureProduct(draft, product))
    setUnit(defaultUnitForProductForm(product.productForm))
    setQuantityInput('')
    setClarifyAnswer('')
    setNotice(null)
  }

  function handleCustomProduct() {
    pushNavigationSnapshot()
    setDraft(startCustomProductCapture(draft, query))
    setUnit('kg')
    setQuantityInput('')
    setNotice(null)
  }

  function handleClarifySubmit(event: FormEvent) {
    event.preventDefault()
    const { draft: nextDraft, resolved } = applyPackageClarification(draft, clarifyAnswer)

    if (!resolved) {
      setNotice('Bitte wähle eine der Gebindegrößen oder formuliere sie eindeutig.')
      return
    }

    pushNavigationSnapshot()
    setDraft(nextDraft)
    setQuantityInput(String(nextDraft.quantity ?? ''))
    setUnit(nextDraft.unit)
    setNotice(null)
  }

  function handleEnterQuantitySubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = Number.parseFloat(quantityInput.replace(',', '.'))

    if (Number.isNaN(parsed) || parsed <= 0) {
      setNotice('Bitte gib eine gültige Menge ein.')
      return
    }

    if (needsProductFormSelection(draft)) {
      setNotice('Bitte wähle zuerst Granulat oder Flüssig.')
      return
    }

    pushNavigationSnapshot()
    const nextDraft = applyFreeQuantityEntry(draft, parsed, unit)

    if (!canProceedToConfirm(nextDraft)) {
      setNotice('Bitte wähle zuerst ein Produkt.')
      return
    }

    setDraft(nextDraft)
    setNotice(null)
  }

  function handlePackageCountSubmit(event: FormEvent) {
    event.preventDefault()
    const parsed = Number.parseInt(packageCountInput, 10)

    if (Number.isNaN(parsed) || parsed <= 0) {
      setNotice('Bitte gib eine gültige Anzahl ein.')
      return
    }

    pushNavigationSnapshot()
    const nextDraft = applyPackageCount(draft, parsed)
    setDraft(nextDraft)

    if (nextDraft.quantity != null) {
      setQuantityInput(String(nextDraft.quantity).replace('.', ','))
    }

    setNotice(null)
  }

  async function handleSaveCapture() {
    if (saving || draft.step === 'saved') {
      return
    }

    if (!userId) {
      setNotice('Bitte melde dich erneut an.')
      return
    }

    if (!draft.creationReason) {
      setNotice('Bitte wähle einen Bestandsgrund aus.')
      return
    }

    if (!draft.recognitionResult && !draft.catalogProductId && !draft.recognitionCandidate) {
      setNotice(
        'Speichern ist derzeit nur für erkannte oder Katalogprodukte verfügbar.',
      )
      return
    }

    setSaving(true)
    setNotice(null)

    try {
      const confirmedDraft = proceedToConfirm(draft)
      const result = await saveFertilizerCaptureToInventoryCore({
        draft: confirmedDraft,
        userId,
        creationReason: draft.creationReason,
      })

      const savedDraft = completeCaptureAfterSave({
        userId,
        idempotencyKey: confirmedDraft.idempotencyKey!,
        saveResult: result,
      })

      setDraft(savedDraft)
      setNavigationStack([])
      setPhotoRecognitionOpen(false)
      setPhotoRecognitionSession(null)
      setNotice(null)
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Der Dünger konnte nicht gespeichert werden.',
      )
    } finally {
      setSaving(false)
    }
  }

  function handleCreationReasonSelect(value: (typeof FERTILIZER_CAPTURE_CREATION_REASON_OPTIONS)[number]['value']) {
    setDraft(setCreationReason(draft, value))
    setNotice(null)
  }

  function handleGoToStock() {
    clearFertilizerCaptureSavedReceipt(userId)
    clearFertilizerCaptureSession(userId)
    navigate(FERTILIZER_ROUTES.hub)
  }

  const captureHeader = (
    <SubpageHeader
      title="Dünger erfassen"
      backLabel={draft.step === 'find' && navigationStack.length === 0 ? 'Zurück zu Dünger' : 'Zurück'}
      hideTitle
      onBack={handleFlowBack}
    />
  )

  if (photoRecognitionOpen) {
    const activePhotoSession = photoRecognitionSession ?? createInitialPhotoRecognitionSession()

    return (
      <>
        {captureHeader}
        <FertilizerPhotoRecognition
          session={activePhotoSession}
          onSessionChange={setPhotoRecognitionSession}
          onAccept={handleRecognitionAccept}
          onCancel={handleRecognitionCancel}
        />
      </>
    )
  }

  return (
    <>
      {captureHeader}
    <div className={`${styles.flow} ${draft.step === 'find' ? styles.flowFind : ''}`}>
      {draft.homeHandoffNotice && (
        <div className={styles.handoffNotice} role="status">
          {draft.homeHandoffNotice}
        </div>
      )}

      {notice && (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      )}

      {draft.step === 'find' && (
        <section className={styles.findStep} aria-labelledby="capture-find-heading">
          <h2 id="capture-find-heading" className={styles.stepQuestion}>
            Welchen Dünger möchtest Du erfassen?
          </h2>

          <form className={styles.searchForm} onSubmit={(event) => event.preventDefault()}>
            <label className="visually-hidden" htmlFor={searchId}>
              Produkt oder Hersteller suchen
            </label>
            <div className={styles.searchField}>
              <input
                id={searchId}
                className={styles.searchInputIntegrated}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Produkt oder Hersteller suchen"
                autoComplete="off"
              />
              <button
                type="button"
                className={styles.searchMic}
                aria-label="Suchfeld diktieren"
                title="Diktat für dieses Feld"
                onClick={() => showPrototypeNotice('dictation')}
              >
                <MicIcon />
              </button>
            </div>
          </form>

          {results.length > 0 && (
            <ul className={styles.resultList} aria-label="Suchergebnisse">
              {results.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    className={styles.resultButton}
                    onClick={() => handleSelectProduct(product.id)}
                  >
                    <span className={styles.resultName}>
                      {product.manufacturer} {product.name}
                    </span>
                    <span className={styles.resultMeta}>
                      {product.productForm === 'liquid' ? 'Flüssig' : 'Granulat'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {showNoResultsHint && (
            <p className={styles.noResultsHint} role="status">
              Kein Treffer für „{query.trim()}“
            </p>
          )}

          <div className={styles.findSpacer} aria-hidden="true" />

          <p className={styles.altDivider}>Oder so finden</p>

          <div className={styles.altGrid} role="group" aria-label="Weitere Erfassungswege">
            <button
              type="button"
              className={styles.altTile}
              onClick={handlePhotoCaptureClick}
            >
              <span className={styles.altTileIcon} aria-hidden="true">
                <CameraIcon />
              </span>
              <span className={styles.altTileLabel}>Verpackung fotografieren</span>
            </button>
            <button
              type="button"
              className={styles.altTile}
              onClick={() => showPrototypeNotice('barcode')}
            >
              <span className={styles.altTileIcon} aria-hidden="true">
                <BarcodeIcon />
              </span>
              <span className={styles.altTileLabel}>Barcode scannen</span>
            </button>
          </div>

          <div className={`${styles.customProductCard} ${showNoResultsHint ? styles.customProductCardEmphasis : ''}`}>
            <p className={styles.customProductQuestion}>Produkt nicht gefunden?</p>
            <button type="button" className={styles.customProductAction} onClick={handleCustomProduct}>
              <span className={styles.customProductIcon} aria-hidden="true">
                <PencilIcon />
              </span>
              <span>Eigenes Produkt anlegen</span>
            </button>
          </div>
        </section>
      )}

      {draft.step === 'clarify-package' && draft.clarifyPrompt && (
        <section aria-labelledby="capture-clarify-heading">
          <h2 id="capture-clarify-heading" className={styles.stepQuestion}>
            Noch eine Angabe
          </h2>
          <div className={styles.panel}>
            <p className={styles.clarifyPrompt}>{draft.clarifyPrompt}</p>
            <form className={styles.clarifyForm} onSubmit={handleClarifySubmit}>
              <label className={styles.fieldLabel} htmlFor={clarifyId}>
                Gebindegröße
              </label>
              <input
                id={clarifyId}
                className={styles.textInput}
                value={clarifyAnswer}
                onChange={(event) => setClarifyAnswer(event.target.value)}
                placeholder="z. B. 7 kg oder der kleinere Sack"
              />
              <div className={styles.optionChips} aria-label="Vorschläge">
                {draft.clarifyOptions.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={styles.chip}
                    onClick={() => setClarifyAnswer(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <button type="submit" className={styles.primaryButton}>
                Weiter
              </button>
            </form>
          </div>
        </section>
      )}

      {draft.step === 'stock-remainder' && (
        <section aria-labelledby="capture-remainder-heading">
          <h2 id="capture-remainder-heading" className={styles.stepQuestion}>
            {INITIAL_STOCK_PREVIOUS_REMAINDER_QUESTION}
          </h2>
          {draft.customProductLabel && (
            <p className={styles.selectedProduct}>{draft.customProductLabel}</p>
          )}
          <div className={styles.remainderActions}>
            <button type="button" className={styles.primaryButton} onClick={handleRemainderNo}>
              Nein
            </button>
            <button type="button" className={styles.secondaryOutlineButton} onClick={handleRemainderYes}>
              Ja
            </button>
          </div>
        </section>
      )}

      {draft.step === 'stock-remainder-amount' && (
        <section aria-labelledby="capture-remainder-amount-heading">
          <h2 id="capture-remainder-amount-heading" className={styles.stepQuestion}>
            {INITIAL_STOCK_REMAINDER_AMOUNT_QUESTION}
          </h2>
          <form className={styles.stockForm} onSubmit={handleRemainderAmountSubmit}>
            <div className={styles.quantityRow}>
              <div className={styles.quantityField}>
                <label className={styles.fieldLabel} htmlFor={quantityId}>
                  Restmenge
                </label>
                <input
                  id={quantityId}
                  className={styles.textInput}
                  inputMode="decimal"
                  value={remainderAmountInput}
                  onChange={(event) => setRemainderAmountInput(event.target.value)}
                  placeholder="z. B. 1,5"
                />
              </div>
              <div className={styles.unitField}>
                <span className={styles.fieldLabel}>Einheit</span>
                <p className={styles.unitReadonly}>{draft.unit}</p>
              </div>
            </div>
            <button type="submit" className={styles.primaryButton}>
              Weiter
            </button>
          </form>
        </section>
      )}

      {draft.step === 'stock-package-count' && (
        <section aria-labelledby="capture-package-count-heading">
          <h2 id="capture-package-count-heading" className={styles.stepQuestion}>
            {PACKAGE_COUNT_QUESTION}
          </h2>
          {draft.selectedPackageQuantity != null && (
            <p className={styles.selectedProduct}>
              Gebindegröße: {draft.selectedPackageQuantity} {draft.selectedPackageUnit ?? draft.unit}
            </p>
          )}
          <form className={styles.stockForm} onSubmit={handlePackageCountSubmit}>
            <label className={styles.fieldLabel} htmlFor={quantityId}>
              Anzahl
            </label>
            <input
              id={quantityId}
              className={styles.textInput}
              inputMode="numeric"
              value={packageCountInput}
              onChange={(event) => setPackageCountInput(event.target.value)}
              placeholder="z. B. 2"
            />
            <button type="submit" className={styles.primaryButton}>
              Weiter
            </button>
          </form>
        </section>
      )}

      {draft.step === 'enter-quantity' && (
        <section aria-labelledby="capture-enter-quantity-heading">
          <h2 id="capture-enter-quantity-heading" className={styles.stepQuestion}>
            {FREE_STOCK_QUANTITY_QUESTION}
          </h2>

          {draft.customProductLabel && (
            <p className={styles.selectedProduct}>{draft.customProductLabel}</p>
          )}

          {needsProductFormSelection(draft) && (
            <fieldset className={styles.productFormFieldset}>
              <legend className={styles.fieldLabel}>Produktform</legend>
              <div className={styles.productFormOptions}>
                <button
                  type="button"
                  className={styles.productFormButton}
                  onClick={() => {
                    setDraft(setCustomProductForm(draft, 'granular'))
                    setUnit('kg')
                  }}
                >
                  Granulat
                </button>
                <button
                  type="button"
                  className={styles.productFormButton}
                  onClick={() => {
                    setDraft(setCustomProductForm(draft, 'liquid'))
                    setUnit('l')
                  }}
                >
                  Flüssig
                </button>
              </div>
            </fieldset>
          )}

          <form className={styles.stockForm} onSubmit={handleEnterQuantitySubmit}>
            <div className={styles.quantityRow}>
              <div className={styles.quantityField}>
                <label className={styles.fieldLabel} htmlFor={quantityId}>
                  Menge
                </label>
                <input
                  id={quantityId}
                  className={styles.textInput}
                  inputMode="decimal"
                  value={quantityInput}
                  onChange={(event) => setQuantityInput(event.target.value)}
                  placeholder="z. B. 3,5"
                />
              </div>
              <div className={styles.unitField}>
                <label className={styles.fieldLabel} htmlFor={`${quantityId}-unit`}>
                  Einheit
                </label>
                <select
                  id={`${quantityId}-unit`}
                  className={styles.selectInput}
                  value={unit}
                  onChange={(event) => setUnit(event.target.value as FertilizerQuantityUnit)}
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="l">l</option>
                  <option value="ml">ml</option>
                </select>
              </div>
            </div>

            <button type="submit" className={styles.primaryButton}>
              Weiter zur Zusammenfassung
            </button>
          </form>
        </section>
      )}

      {draft.step === 'confirm' && summary && (
        <section aria-labelledby="capture-confirm-heading">
          <h2 id="capture-confirm-heading" className={styles.stepQuestion}>
            Kurz prüfen
          </h2>
          <div className={styles.summaryPanel}>
            <p className={styles.summaryProduct}>{summary.productLine}</p>
            <p className={styles.summaryStock}>{summary.stockLine}</p>
            {summary.badge && <p className={styles.summaryBadge}>{summary.badge}</p>}
          </div>
          <fieldset className={styles.creationReasonFieldset}>
            <legend className={styles.creationReasonLegend}>Bestandsgrund</legend>
            <div className={styles.optionChips} role="radiogroup" aria-label="Bestandsgrund">
              {FERTILIZER_CAPTURE_CREATION_REASON_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.creationReason === option.value}
                  className={`${styles.chip} ${draft.creationReason === option.value ? styles.chipSelected : ''}`}
                  onClick={() => handleCreationReasonSelect(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void handleSaveCapture()}
            disabled={saving || !draft.creationReason}
          >
            {saving ? 'Wird gespeichert…' : 'Zum Bestand hinzufügen'}
          </button>
        </section>
      )}

      {draft.step === 'saved' && draft.saveResult && (
        <section aria-labelledby="capture-saved-heading">
          <h2 id="capture-saved-heading" className={styles.stepQuestion}>
            {draft.saveResult.productLabel} wurde erfasst.
          </h2>
          <div className={styles.summaryPanel}>
            {isFertilizerCaptureInventorySaveResult(draft.saveResult) ? (
              (() => {
                const lines = formatInventorySaveConfirmationLines(draft.saveResult)
                return (
                  <>
                    <p className={styles.summaryStock}>{lines.packageLine}</p>
                    <p className={styles.summaryStock}>{lines.quantityLine}</p>
                    <p className={styles.summaryProduct}>{lines.reasonLine}</p>
                  </>
                )
              })()
            ) : (
              (() => {
                const lines = formatSaveConfirmationLines({
                  purchaseQuantity: draft.saveResult.purchaseQuantity,
                  purchaseUnit: draft.saveResult.purchaseUnit,
                  previousRemainder: draft.saveResult.previousRemainder,
                  resultingBalance: draft.saveResult.resultingBalance,
                })
                return (
                  <>
                    <p className={styles.summaryStock}>{lines.purchaseLine}</p>
                    {lines.remainderLine && (
                      <p className={styles.summaryStock}>{lines.remainderLine}</p>
                    )}
                    <p className={styles.summaryProduct}>{lines.balanceLine}</p>
                  </>
                )
              })()
            )}
          </div>
          <button type="button" className={styles.primaryButton} onClick={handleGoToStock}>
            Zum Düngerbestand
          </button>
        </section>
      )}
    </div>
    </>
  )
}
