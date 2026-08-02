import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ActivityConfirmationPanel } from '../components/home/ActivityConfirmationPanel'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { SubpageHeader } from '../components/layout/SubpageHeader'
import { useAuth } from '../contexts/AuthContext'
import { fetchAreas } from '../lib/areas'
import { todayDateInputValue } from '../lib/activityCreate'
import {
  applyFertilizerInventoryItemToArea,
  FertilizerApplicationRuntimeError,
} from '../lib/fertilizerApplication'
import {
  applicationDateInputToIso,
  buildApplicationSourceEventRef,
  buildFertilizerApplicationConfirmationRows,
  formatBalanceLabel,
  formatFertilizerProductFormLabel,
  getFertilizerApplicationIneligibilityMessage,
  isFertilizerStockListItemApplicationEligible,
  isValidInventoryItemRouteId,
  type FertilizerApplicationDraft,
  type FertilizerApplicationFlowPhase,
  validateFertilizerApplicationDraft,
} from '../lib/fertilizerApplicationFlowCore'
import { fetchFertilizerStockListItem } from '../lib/fertilizerInventory'
import { FERTILIZER_ROUTES } from '../lib/fertilizerRoutes'
import { createRandomId } from '../lib/randomId'
import type { Area } from '../types/area'
import type { FertilizerStockListItem } from '../types/fertilizerInventory'
import type { FertilizerApplicationResult } from '../lib/fertilizerApplicationCore'
import styles from './FertilizerApplicationPage.module.css'

export function FertilizerApplicationPage() {
  const { inventoryItemId = '' } = useParams<{ inventoryItemId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [item, setItem] = useState<FertilizerStockListItem | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [phase, setPhase] = useState<FertilizerApplicationFlowPhase>('form')
  const [draft, setDraft] = useState<FertilizerApplicationDraft>({
    amountInput: '',
    areaId: null,
    appliedAtDate: todayDateInputValue(),
    note: '',
    idempotencyKey: null,
  })
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'amount' | 'area' | 'date' | 'note', string>>
  >({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<FertilizerApplicationResult | null>(null)

  useEffect(() => {
    if (!isValidInventoryItemRouteId(inventoryItemId)) {
      setLoadError('Dieses Gebinde wurde nicht gefunden.')
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError(null)

      try {
        const [loadedItem, loadedAreas] = await Promise.all([
          fetchFertilizerStockListItem(inventoryItemId),
          fetchAreas(),
        ])

        if (cancelled) {
          return
        }

        if (!loadedItem) {
          setLoadError('Dieses Gebinde wurde nicht gefunden.')
          setItem(null)
          return
        }

        setItem(loadedItem)
        setAreas(loadedAreas)
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Das Gebinde konnte nicht geladen werden.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [inventoryItemId])

  const selectedArea = useMemo(
    () => areas.find((area) => area.id === draft.areaId) ?? null,
    [areas, draft.areaId],
  )

  const unitLabel = item?.baseUnit ?? item?.unit ?? 'kg'
  const eligible = item != null && isFertilizerStockListItemApplicationEligible(item)

  function handleProceedToConfirm(event: FormEvent) {
    event.preventDefault()
    if (!item) {
      return
    }

    const validation = validateFertilizerApplicationDraft(draft, item)
    setFieldErrors(validation.errors)

    if (!validation.ok) {
      return
    }

    setSubmitError(null)
    setDraft((current) => ({
      ...current,
      idempotencyKey: current.idempotencyKey ?? createRandomId(),
    }))
    setPhase('confirm')
  }

  function handleConfirmSubmit() {
    if (!item || !user || !draft.idempotencyKey || !selectedArea) {
      return
    }

    const validation = validateFertilizerApplicationDraft(draft, item)
    if (!validation.ok || validation.amount == null) {
      setPhase('form')
      setFieldErrors(validation.errors)
      return
    }

    const appliedAt = applicationDateInputToIso(draft.appliedAtDate)
    if (!appliedAt || !item.savedProductProfileId || !item.baseUnit) {
      setSubmitError('Die Anwendung konnte nicht vorbereitet werden.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    void applyFertilizerInventoryItemToArea({
      inventoryItemId: item.id,
      savedProductProfileId: item.savedProductProfileId,
      targetKind: 'area',
      targetId: selectedArea.id,
      applicationAmount: validation.amount,
      applicationUnit: item.baseUnit,
      appliedAt,
      idempotencyKey: draft.idempotencyKey,
      sourceEventRef: buildApplicationSourceEventRef(draft.idempotencyKey),
      note: draft.note.trim() || null,
      userId: user.id,
    })
      .then((applicationResult) => {
        setResult(applicationResult)
        setPhase('success')
      })
      .catch((error) => {
        const message =
          error instanceof FertilizerApplicationRuntimeError
            ? error.message
            : 'Die Anwendung konnte nicht gespeichert werden.'
        setSubmitError(message)
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  function handleEditFromConfirm() {
    setPhase('form')
    setSubmitError(null)
    setDraft((current) => ({
      ...current,
      idempotencyKey: null,
    }))
  }

  const confirmationRows =
    item && selectedArea
      ? buildFertilizerApplicationConfirmationRows({
          item,
          area: selectedArea,
          amount: parseApplicationAmountForConfirm(draft, item),
          appliedAtDate: draft.appliedAtDate,
          note: draft.note,
        })
      : []

  return (
    <HomeAppShell>
      <main className={styles.screen}>
        <SubpageHeader
          title="Dünger anwenden"
          backTo={FERTILIZER_ROUTES.hub}
          backLabel="Zurück zu Dünger"
        />

        {loading && (
          <section className={styles.section}>
            <div className={styles.panel}>
              <p className={styles.emptyMessage}>Gebinde wird geladen…</p>
            </div>
          </section>
        )}

        {!loading && loadError && (
          <section className={styles.section}>
            <div className={styles.panel} role="alert">
              <p className={styles.emptyMessage}>{loadError}</p>
              <p className={styles.emptyHint}>
                <Link to={FERTILIZER_ROUTES.hub}>Zurück zum Düngerbestand</Link>
              </p>
            </div>
          </section>
        )}

        {!loading && !loadError && item && !eligible && (
          <section className={styles.section}>
            <div className={styles.panel} role="alert">
              <p className={styles.emptyMessage}>{getFertilizerApplicationIneligibilityMessage(item)}</p>
              <p className={styles.emptyHint}>
                <Link to={FERTILIZER_ROUTES.hub}>Zurück zum Düngerbestand</Link>
              </p>
            </div>
          </section>
        )}

        {!loading && !loadError && item && eligible && phase !== 'success' && (
          <>
            <section className={styles.section} aria-labelledby="application-product-heading">
              <h2 id="application-product-heading" className={styles.sectionHeading}>
                Gebinde
              </h2>
              <div className={styles.panel}>
                <div className={styles.productHeader}>
                  <h3 className={styles.productName}>{item.productLabel}</h3>
                  {item.manufacturer && <p className={styles.productMeta}>{item.manufacturer}</p>}
                </div>

                <dl className={styles.detailList}>
                  {formatFertilizerProductFormLabel(item.productForm) && (
                    <div className={styles.detailRow}>
                      <dt>Produktform</dt>
                      <dd>{formatFertilizerProductFormLabel(item.productForm)}</dd>
                    </div>
                  )}
                  {item.packageSizeValue != null && item.packageSizeUnit && (
                    <div className={styles.detailRow}>
                      <dt>Gebindegröße</dt>
                      <dd>
                        {formatBalanceLabel(item.packageSizeValue, item.packageSizeUnit)}
                      </dd>
                    </div>
                  )}
                  <div className={styles.detailRow}>
                    <dt>Verfügbarer Bestand</dt>
                    <dd>{formatBalanceLabel(item.balance, unitLabel)}</dd>
                  </div>
                </dl>
              </div>
            </section>

            {phase === 'form' && (
              <section className={styles.section} aria-labelledby="application-form-heading">
                <h2 id="application-form-heading" className={styles.sectionHeading}>
                  Anwendung
                </h2>
                <form className={styles.form} onSubmit={handleProceedToConfirm}>
                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="application-amount">
                      Menge
                    </label>
                    <div className={styles.amountRow}>
                      <input
                        id="application-amount"
                        className={styles.input}
                        inputMode="decimal"
                        value={draft.amountInput}
                        onChange={(event) =>
                          setDraft((current) => ({ ...current, amountInput: event.target.value }))
                        }
                        aria-invalid={Boolean(fieldErrors.amount)}
                      />
                      <span className={styles.unitBadge}>{unitLabel}</span>
                    </div>
                    {fieldErrors.amount && (
                      <p className={styles.fieldError}>{fieldErrors.amount}</p>
                    )}
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="application-area">
                      Fläche
                    </label>
                    <select
                      id="application-area"
                      className={styles.select}
                      value={draft.areaId ?? ''}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          areaId: event.target.value || null,
                        }))
                      }
                      aria-invalid={Boolean(fieldErrors.area)}
                    >
                      <option value="">Fläche auswählen</option>
                      {areas.map((area) => (
                        <option key={area.id} value={area.id}>
                          {area.name}
                          {area.sizeLabel ? ` · ${area.sizeLabel}` : ''}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.area && <p className={styles.fieldError}>{fieldErrors.area}</p>}
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="application-date">
                      Anwendungsdatum
                    </label>
                    <input
                      id="application-date"
                      className={styles.input}
                      type="date"
                      value={draft.appliedAtDate}
                      max={todayDateInputValue()}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, appliedAtDate: event.target.value }))
                      }
                      aria-invalid={Boolean(fieldErrors.date)}
                    />
                    {fieldErrors.date && <p className={styles.fieldError}>{fieldErrors.date}</p>}
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="application-note">
                      Notiz (optional)
                    </label>
                    <textarea
                      id="application-note"
                      className={styles.textarea}
                      value={draft.note}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, note: event.target.value }))
                      }
                      aria-invalid={Boolean(fieldErrors.note)}
                    />
                    {fieldErrors.note && <p className={styles.fieldError}>{fieldErrors.note}</p>}
                  </div>

                  <button type="submit" className={styles.primaryAction}>
                    Weiter zur Bestätigung
                  </button>
                </form>
              </section>
            )}

            {phase === 'confirm' && (
              <section className={styles.section}>
                <ActivityConfirmationPanel
                  rows={confirmationRows}
                  submitting={submitting}
                  onConfirm={handleConfirmSubmit}
                  onEdit={handleEditFromConfirm}
                  onDiscard={() => navigate(FERTILIZER_ROUTES.hub)}
                />
                {submitError && (
                  <p className={styles.formError} role="alert">
                    {submitError}
                  </p>
                )}
              </section>
            )}
          </>
        )}

        {!loading && !loadError && item && eligible && phase === 'success' && result && (
          <section className={styles.section} aria-labelledby="application-success-heading">
            <div className={styles.panel}>
              <h2 id="application-success-heading" className={styles.successTitle}>
                Düngung gespeichert
              </h2>
              <p className={styles.successMessage}>
                {item.productLabel} wurde auf {selectedArea?.name ?? 'der gewählten Fläche'}{' '}
                angewendet. Restbestand: {formatBalanceLabel(result.resultingBalance, unitLabel)}.
              </p>
              <div className={styles.successActions}>
                <button
                  type="button"
                  className={styles.primaryAction}
                  onClick={() => navigate(FERTILIZER_ROUTES.hub)}
                >
                  Zurück zum Düngerbestand
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </HomeAppShell>
  )
}

function parseApplicationAmountForConfirm(
  draft: FertilizerApplicationDraft,
  item: FertilizerStockListItem,
): number {
  const validation = validateFertilizerApplicationDraft(draft, item)
  return validation.amount ?? 0
}
