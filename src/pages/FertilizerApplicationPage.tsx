import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { SubpageHeader } from '../components/layout/SubpageHeader'
import { useAuth } from '../contexts/AuthContext'
import { fetchAreas } from '../lib/areas'
import { todayDateInputValue } from '../lib/activityCreate'
import { buildCareGroupSummaries } from '../lib/careGroupsCore'
import { fetchCareGroupMemberships } from '../lib/careGroups'
import {
  applyFertilizerInventoryItemToAreas,
  FertilizerMultiAreaApplicationRuntimeError,
  type FertilizerMultiAreaApplicationResult,
} from '../lib/fertilizerMultiAreaApplication'
import {
  applyCareGroupSelection,
  buildFertilizerApplicationConfirmationRows,
  buildMultiAreaApplicationCommandInput,
  buildSuccessAreaLabels,
  canSubmitFertilizerApplication,
  formatApplicationModeLabel,
  formatBalanceLabel,
  formatFertilizerProductFormLabel,
  getApplicableAreas,
  getApplicationInputUnitLabel,
  getFertilizerApplicationIneligibilityMessage,
  isAreaApplicableForFertilizerApplication,
  isFertilizerStockListItemApplicationEligible,
  isValidInventoryItemRouteId,
  resolveInitialDraftSelection,
  switchToManualAreaSelection,
  toggleAreaSelection,
  type FertilizerApplicationDraft,
  type FertilizerApplicationFlowPhase,
  validateFertilizerApplicationDraft,
} from '../lib/fertilizerApplicationFlowCore'
import { fetchFertilizerStockListItem } from '../lib/fertilizerInventory'
import { FERTILIZER_ROUTES } from '../lib/fertilizerRoutes'
import { createRandomId } from '../lib/randomId'
import type { Area } from '../types/area'
import type { CareGroupSummary } from '../types/careGroup'
import type { FertilizerStockListItem } from '../types/fertilizerInventory'
import styles from './FertilizerApplicationPage.module.css'

export function FertilizerApplicationPage() {
  const { inventoryItemId = '' } = useParams<{ inventoryItemId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [item, setItem] = useState<FertilizerStockListItem | null>(null)
  const [areas, setAreas] = useState<Area[]>([])
  const [careGroups, setCareGroups] = useState<CareGroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [phase, setPhase] = useState<FertilizerApplicationFlowPhase>('form')
  const [draft, setDraft] = useState<FertilizerApplicationDraft>({
    mode: 'rate_per_sqm',
    inputValue: '',
    selectedAreaIds: [],
    selectionSource: 'manual',
    careGroupId: null,
    appliedAtDate: todayDateInputValue(),
    note: '',
    idempotencyKey: null,
  })
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<'input' | 'areas' | 'date' | 'note', string>>
  >({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<FertilizerMultiAreaApplicationResult | null>(null)

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
        const [loadedItem, loadedAreas, memberships] = await Promise.all([
          fetchFertilizerStockListItem(inventoryItemId),
          fetchAreas(),
          fetchCareGroupMemberships(),
        ])

        if (cancelled) {
          return
        }

        if (!loadedItem) {
          setLoadError('Dieses Gebinde wurde nicht gefunden.')
          setItem(null)
          return
        }

        const applicableAreas = getApplicableAreas(loadedAreas)
        const initialSelection = resolveInitialDraftSelection(applicableAreas)

        setItem(loadedItem)
        setAreas(loadedAreas)
        setCareGroups(buildCareGroupSummaries(memberships))
        setDraft((current) => ({
          ...current,
          ...initialSelection,
        }))
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

  const applicableAreas = useMemo(() => getApplicableAreas(areas), [areas])
  const unitLabel = item?.baseUnit ?? item?.unit ?? 'kg'
  const eligible = item != null && isFertilizerStockListItemApplicationEligible(item)
  const validation = useMemo(
    () =>
      item
        ? validateFertilizerApplicationDraft(draft, item, areas)
        : { ok: false, normalized: null, errors: {} },
    [draft, item, areas],
  )

  function handleProceedToConfirm(event: FormEvent) {
    event.preventDefault()
    if (!item) {
      return
    }

    const nextValidation = validateFertilizerApplicationDraft(draft, item, areas)
    setFieldErrors(nextValidation.errors)

    if (!nextValidation.ok) {
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
    if (!item || !user || !draft.idempotencyKey) {
      return
    }

    const nextValidation = validateFertilizerApplicationDraft(draft, item, areas)
    if (!nextValidation.ok) {
      setPhase('form')
      setFieldErrors(nextValidation.errors)
      return
    }

    const command = buildMultiAreaApplicationCommandInput({
      draft,
      item,
      areas,
      userId: user.id,
      idempotencyKey: draft.idempotencyKey,
    })

    if (!command) {
      setSubmitError('Die Anwendung konnte nicht vorbereitet werden.')
      return
    }

    setSubmitting(true)
    setSubmitError(null)

    void applyFertilizerInventoryItemToAreas(command)
      .then((applicationResult) => {
        setResult(applicationResult)
        setPhase('success')
      })
      .catch((error) => {
        const message =
          error instanceof FertilizerMultiAreaApplicationRuntimeError
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

  function handleToggleArea(areaId: string) {
    setDraft((current) => {
      const nextSelected = toggleAreaSelection(current.selectedAreaIds, areaId)
      if (current.selectionSource === 'care_group') {
        return {
          ...current,
          ...switchToManualAreaSelection(nextSelected),
        }
      }

      return {
        ...current,
        selectedAreaIds: nextSelected,
      }
    })
  }

  function handleApplyCareGroup(careGroupId: string) {
    setDraft((current) => ({
      ...current,
      ...applyCareGroupSelection(careGroupId, careGroups, applicableAreas),
    }))
  }

  const confirmationRows =
    item && validation.normalized
      ? buildFertilizerApplicationConfirmationRows({
          item,
          draft,
          normalized: validation.normalized,
          areas,
        })
      : []

  const successAreaLabels =
    result != null ? buildSuccessAreaLabels(result.areas.map((area) => area.areaId), areas) : []

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
                  <fieldset className={styles.fieldset}>
                    <legend className={styles.fieldLabel}>Eingabemodus</legend>
                    <div className={styles.modeOptions}>
                      {(['rate_per_sqm', 'total_amount_proportional'] as const).map((mode) => (
                        <label key={mode} className={styles.modeOption}>
                          <input
                            type="radio"
                            name="application-mode"
                            checked={draft.mode === mode}
                            onChange={() =>
                              setDraft((current) => ({
                                ...current,
                                mode,
                                idempotencyKey: null,
                              }))
                            }
                          />
                          <span>{formatApplicationModeLabel(mode)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className={styles.field}>
                    <label className={styles.fieldLabel} htmlFor="application-input">
                      {draft.mode === 'rate_per_sqm' ? 'Aufwandmenge' : 'Gesamtmenge'}
                    </label>
                    <div className={styles.amountRow}>
                      <input
                        id="application-input"
                        className={styles.input}
                        inputMode="decimal"
                        value={draft.inputValue}
                        onChange={(event) =>
                          setDraft((current) => ({
                            ...current,
                            inputValue: event.target.value,
                            idempotencyKey: null,
                          }))
                        }
                        aria-invalid={Boolean(fieldErrors.input)}
                      />
                      <span className={styles.unitBadge}>
                        {getApplicationInputUnitLabel(
                          draft.mode,
                          unitLabel === 'ml' ? 'ml' : 'kg',
                        )}
                      </span>
                    </div>
                    {fieldErrors.input && <p className={styles.fieldError}>{fieldErrors.input}</p>}
                  </div>

                  <div className={styles.field}>
                    <span className={styles.fieldLabel}>Flächen</span>
                    {careGroups.length > 0 && (
                      <div className={styles.careGroupActions}>
                        {careGroups.map((group, index) => (
                          <button
                            key={group.id}
                            type="button"
                            className={styles.careGroupButton}
                            onClick={() => handleApplyCareGroup(group.id)}
                          >
                            Pflegegruppe {index + 1} vorauswählen
                          </button>
                        ))}
                      </div>
                    )}
                    <ul className={styles.areaList}>
                      {areas.map((area) => {
                        const applicable = isAreaApplicableForFertilizerApplication(area)
                        const checked = draft.selectedAreaIds.includes(area.id)

                        return (
                          <li key={area.id} className={styles.areaListItem}>
                            <label
                              className={
                                applicable ? styles.areaOption : styles.areaOptionDisabled
                              }
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={!applicable}
                                onChange={() => handleToggleArea(area.id)}
                              />
                              <span className={styles.areaOptionText}>
                                <span className={styles.areaOptionName}>{area.name}</span>
                                <span className={styles.areaOptionMeta}>
                                  {applicable
                                    ? area.sizeLabel
                                    : 'Größe fehlt — nicht anwendbar'}
                                </span>
                              </span>
                            </label>
                          </li>
                        )
                      })}
                    </ul>
                    {fieldErrors.areas && <p className={styles.fieldError}>{fieldErrors.areas}</p>}
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
                        setDraft((current) => ({
                          ...current,
                          appliedAtDate: event.target.value,
                          idempotencyKey: null,
                        }))
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
                        setDraft((current) => ({
                          ...current,
                          note: event.target.value,
                          idempotencyKey: null,
                        }))
                      }
                      aria-invalid={Boolean(fieldErrors.note)}
                    />
                    {fieldErrors.note && <p className={styles.fieldError}>{fieldErrors.note}</p>}
                  </div>

                  <button
                    type="submit"
                    className={styles.primaryAction}
                    disabled={!canSubmitFertilizerApplication({ submitting, phase, item })}
                  >
                    Weiter zur Bestätigung
                  </button>
                </form>
              </section>
            )}

            {phase === 'confirm' && validation.normalized && (
              <section className={styles.section}>
                <div className={styles.confirmPanel} aria-labelledby="application-confirm-heading">
                  <h2 id="application-confirm-heading" className={styles.confirmTitle}>
                    Anwendung bestätigen
                  </h2>

                  <dl className={styles.confirmList}>
                    {confirmationRows.map((row) => (
                      <div key={`${row.label}-${row.value}`} className={styles.confirmRow}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>

                  <div className={styles.confirmActions}>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      disabled={submitting}
                      onClick={handleConfirmSubmit}
                    >
                      {submitting ? 'Bitte warten …' : 'Anwenden'}
                    </button>

                    <div className={styles.confirmSecondaryActions}>
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        disabled={submitting}
                        onClick={handleEditFromConfirm}
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        disabled={submitting}
                        onClick={() => navigate(FERTILIZER_ROUTES.hub)}
                      >
                        Verwerfen
                      </button>
                    </div>
                  </div>
                </div>
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
                {item.productLabel} wurde auf {result.areas.length}{' '}
                {result.areas.length === 1 ? 'Fläche' : 'Flächen'} angewendet. Gesamtentnahme:{' '}
                {formatBalanceLabel(result.totalApplicationAmount, unitLabel)}. Restbestand:{' '}
                {formatBalanceLabel(result.resultingBalance, unitLabel)}.
              </p>
              {successAreaLabels.length > 0 && (
                <ul className={styles.successAreaList}>
                  {successAreaLabels.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              )}
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
