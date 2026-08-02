import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { SubpageHeader } from '../components/layout/SubpageHeader'
import {
  fetchFertilizerStockListItem,
  recordFertilizerProductStockOutbound,
} from '../lib/fertilizerInventory'
import { createRandomId } from '../lib/randomId'
import {
  FERTILIZER_ROUTES,
  isValidFertilizerInventoryItemRouteId,
} from '../lib/fertilizerRoutes'
import {
  advanceStockEventFlowToConfirm,
  beginStockEventFlowSaving,
  buildStockEventFlowIdempotencyKey,
  canConfirmStockEventFlow,
  completeStockEventFlowSuccess,
  createInitialStockEventFlowDraft,
  failStockEventFlow,
  FERTILIZER_STOCK_EVENT_OUTBOUND_REASON_OPTIONS,
  parseStockEventQuantityInput,
  resolveStockEventFlowPhase,
  setStockEventOutboundReason,
  shouldStockEventFlowAllowSignedQuantity,
  type FertilizerStockEventFlowDraft,
} from '../lib/fertilizerStockEventFlowCore'
import type { FertilizerStockListItem } from '../types/fertilizerInventory'
import styles from './FertilizerStockEventPage.module.css'

function formatBalance(item: FertilizerStockListItem): string {
  const unit = item.baseUnit ?? item.unit
  const value = item.balance
  const formatted = Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('de-DE', { maximumFractionDigits: 4 })
  return `${formatted} ${unit}`
}

function isOutboundEligibleItem(item: FertilizerStockListItem | null): item is FertilizerStockListItem {
  return item != null && (item.baseUnit === 'kg' || item.baseUnit === 'ml')
}

export function FertilizerStockOutboundPage() {
  const { inventoryItemId } = useParams<{ inventoryItemId: string }>()
  const navigate = useNavigate()
  const [item, setItem] = useState<FertilizerStockListItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<FertilizerStockEventFlowDraft | null>(null)

  const phase = draft ? resolveStockEventFlowPhase(draft) : 'details'
  const allowSigned = draft ? shouldStockEventFlowAllowSignedQuantity(draft) : false

  useEffect(() => {
    if (!inventoryItemId || !isValidFertilizerInventoryItemRouteId(inventoryItemId)) {
      setLoadError('Der Bestand wurde nicht gefunden.')
      setLoading(false)
      return
    }

    let cancelled = false

    void fetchFertilizerStockListItem(inventoryItemId)
      .then((loaded) => {
        if (cancelled) {
          return
        }

        if (!isOutboundEligibleItem(loaded)) {
          setLoadError('Für diesen Bestand sind keine Abgänge möglich.')
          return
        }

        setItem(loaded)
        setDraft(createInitialStockEventFlowDraft('outbound', loaded.id))
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Der Bestand konnte nicht geladen werden.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [inventoryItemId])

  const quantityHint = useMemo(() => {
    if (!draft?.outboundReason) {
      return null
    }

    if (draft.outboundReason === 'inventory_correction') {
      return 'Gib ein positives oder negatives Delta ein, um einen Erfassungsfehler auszugleichen.'
    }

    return 'Gib die Menge positiv ein. Der Bestand wird entsprechend reduziert.'
  }, [draft?.outboundReason])

  const confirmRows = useMemo(() => {
    if (!item || !draft) {
      return []
    }

    const reasonLabel =
      FERTILIZER_STOCK_EVENT_OUTBOUND_REASON_OPTIONS.find(
        (option) => option.value === draft.outboundReason,
      )?.label ?? ''

    return [
      { label: 'Produkt', value: item.productLabel },
      { label: 'Hersteller', value: item.manufacturer ?? '—' },
      { label: 'Aktueller Bestand', value: formatBalance(item) },
      { label: 'Ereignis', value: reasonLabel },
      {
        label: allowSigned ? 'Korrektur' : 'Menge',
        value: `${draft.quantityInput.trim().replace(',', '.')} ${item.baseUnit}`,
      },
    ]
  }, [allowSigned, draft, item])

  function handleSubmitDetails(event: FormEvent) {
    event.preventDefault()
    if (!draft || !canConfirmStockEventFlow(draft)) {
      return
    }

    setDraft(advanceStockEventFlowToConfirm(draft))
  }

  async function handleConfirmSave() {
    if (!draft || !item || !draft.outboundReason) {
      return
    }

    const quantity = parseStockEventQuantityInput(draft.quantityInput, { allowSigned })
    if (quantity == null) {
      return
    }

    const idempotencyKey =
      draft.idempotencyKey
      ?? buildStockEventFlowIdempotencyKey('product-stock-outbound', createRandomId())

    setDraft(beginStockEventFlowSaving(draft, idempotencyKey))

    try {
      await recordFertilizerProductStockOutbound({
        inventoryItemId: item.id,
        reason: draft.outboundReason,
        quantity,
        idempotencyKey,
        note: draft.note.trim() ? draft.note.trim() : null,
      })

      setDraft(completeStockEventFlowSuccess({ ...draft, idempotencyKey }))
    } catch (error) {
      setDraft(
        failStockEventFlow(
          { ...draft, idempotencyKey },
          error instanceof Error ? error.message : 'Der Abgang konnte nicht gespeichert werden.',
        ),
      )
    }
  }

  return (
    <HomeAppShell>
      <main className={styles.screen}>
        <SubpageHeader
          title="Abgang erfassen"
          backTo={FERTILIZER_ROUTES.hub}
          backLabel="Zurück zu Dünger"
          hideTitle
        />

        {loading && <p className={styles.message}>Bestand wird geladen…</p>}

        {loadError && (
          <div className={styles.panel} role="alert">
            <p className={styles.message}>{loadError}</p>
            <Link className={styles.secondaryButton} to={FERTILIZER_ROUTES.hub}>
              Zum Düngerbestand
            </Link>
          </div>
        )}

        {!loading && !loadError && item && draft && phase === 'details' && (
          <form className={styles.form} onSubmit={handleSubmitDetails}>
            <div className={styles.productCard}>
              <h1 className={styles.productName}>{item.productLabel}</h1>
              {item.manufacturer && <p className={styles.productMeta}>{item.manufacturer}</p>}
              <p className={styles.balanceLine}>Aktueller Bestand: {formatBalance(item)}</p>
            </div>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Ereignis</span>
              <select
                className={styles.select}
                value={draft.outboundReason ?? 'gift_given'}
                onChange={(event) =>
                  setDraft(
                    setStockEventOutboundReason(
                      draft,
                      event.target.value as (typeof FERTILIZER_STOCK_EVENT_OUTBOUND_REASON_OPTIONS)[number]['value'],
                    ),
                  )
                }
              >
                {FERTILIZER_STOCK_EVENT_OUTBOUND_REASON_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                {allowSigned ? `Korrektur (${item.baseUnit})` : `Menge (${item.baseUnit})`}
              </span>
              <input
                className={styles.input}
                inputMode={allowSigned ? 'text' : 'decimal'}
                value={draft.quantityInput}
                onChange={(event) =>
                  setDraft({ ...draft, quantityInput: event.target.value, errorMessage: null })
                }
                required
              />
              {quantityHint && <span className={styles.fieldHint}>{quantityHint}</span>}
            </label>

            <label className={styles.field}>
              <span className={styles.fieldLabel}>Notiz (optional)</span>
              <textarea
                className={styles.textarea}
                rows={3}
                value={draft.note}
                onChange={(event) => setDraft({ ...draft, note: event.target.value })}
              />
            </label>

            <button
              type="submit"
              className={styles.primaryButton}
              disabled={!canConfirmStockEventFlow(draft)}
            >
              Weiter zur Bestätigung
            </button>
          </form>
        )}

        {!loading && !loadError && item && draft && phase === 'confirm' && (
          <section className={styles.form} aria-labelledby="outbound-confirm-heading">
            <h1 id="outbound-confirm-heading" className={styles.stepHeading}>
              Abgang bestätigen
            </h1>
            <dl className={styles.confirmList}>
              {confirmRows.map((row) => (
                <div key={row.label} className={styles.confirmRow}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <button type="button" className={styles.primaryButton} onClick={() => void handleConfirmSave()}>
              Abgang speichern
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setDraft({ ...draft, phase: 'details' })}
            >
              Zurück
            </button>
          </section>
        )}

        {!loading && !loadError && draft && phase === 'saving' && (
          <p className={styles.message}>Abgang wird gespeichert…</p>
        )}

        {!loading && !loadError && draft && phase === 'success' && (
          <section className={styles.panel}>
            <h1 className={styles.stepHeading}>Abgang gespeichert</h1>
            <p className={styles.message}>Der Bestand wurde aktualisiert.</p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => navigate(FERTILIZER_ROUTES.hub)}
            >
              Zum Düngerbestand
            </button>
          </section>
        )}

        {!loading && !loadError && draft && phase === 'error' && (
          <section className={styles.panel} role="alert">
            <h1 className={styles.stepHeading}>Speichern fehlgeschlagen</h1>
            <p className={styles.message}>{draft.errorMessage}</p>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void handleConfirmSave()}
            >
              Erneut versuchen
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => setDraft({ ...draft, phase: 'details', errorMessage: null })}
            >
              Eingaben ändern
            </button>
          </section>
        )}
      </main>
    </HomeAppShell>
  )
}
