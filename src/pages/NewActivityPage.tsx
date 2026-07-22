import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { ProductLearnAssistant } from '../components/ProductLearnAssistant/ProductLearnAssistant'
import { fetchMeasureActivity } from '../lib/activities'
import { activityTypeRequiresProduct } from '../lib/activityLabels'
import { useAuth } from '../contexts/AuthContext'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import {
  createMeasureActivity,
  todayDateInputValue,
  updateMeasureActivity,
} from '../lib/activityCreate'
import { getErrorMessage } from '../lib/errors'
import { buildActivitySummaryRows } from '../lib/parseActivityCore'
import { parseActivityTranscript } from '../lib/parseActivity'
import { lookupSpokenProductName } from '../lib/productLookup'
import { fetchProducts } from '../lib/products'
import type { AreaOutletContext } from '../types/area'
import type { ActivityType } from '../types/activity'
import type { ParsedActivityResult, ParsedActivityUnit } from '../types/parseActivity'
import type { Product } from '../types/product'
import type { ProductAssistantMatch } from '../types/productAssistant'
import styles from './NewActivityPage.module.css'

const SPEECH_EXAMPLES = [
  'Ich habe heute 25 Gramm Spring Start pro Quadratmeter ausgebracht.',
  'Ich habe heute den Rasen gemäht.',
  'Ich habe heute bewässert.',
  'Ich habe heute vertikutiert.',
  'Ich habe heute nachgesät.',
  'Ich habe heute einen Wetting Agent ausgebracht.',
  'Ich habe heute Rasensand ausgebracht.',
]

const UNIT_OPTIONS: Array<ParsedActivityUnit | ''> = ['', 'g/m²', 'kg', 'g', 'ml', 'l', 'l/m²', 'mm']

function appendTranscript(current: string, next: string): string {
  if (!current) {
    return next
  }

  return `${current} ${next}`
}

function formatConfidence(value: number): string {
  return `${Math.round(value * 100)} %`
}

function formatAmountValue(value: number | null): string {
  if (value == null) {
    return ''
  }

  return String(value)
}

export function NewActivityPage() {
  const { areaId = '', activityId } = useParams()
  const isEditing = Boolean(activityId)
  const navigate = useNavigate()
  const { user } = useAuth()
  const { area, refreshArea } = useOutletContext<AreaOutletContext>()

  const [activityType, setActivityType] = useState<ActivityType>('fertilization')
  const [activityLabel, setActivityLabel] = useState('')
  const [occurredAt, setOccurredAt] = useState(todayDateInputValue)
  const [productName, setProductName] = useState('')
  const [amount, setAmount] = useState('')
  const [amountUnit, setAmountUnit] = useState<ParsedActivityUnit | ''>('')
  const [mowHeightMm, setMowHeightMm] = useState('')
  const [notes, setNotes] = useState('')
  const [spokenInput, setSpokenInput] = useState('')
  const [parseResult, setParseResult] = useState<ParsedActivityResult | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [evaluateError, setEvaluateError] = useState<string | null>(null)
  const [loadingActivity, setLoadingActivity] = useState(isEditing)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [learnAssistant, setLearnAssistant] = useState<{
    spokenName: string
    similarMatches: ProductAssistantMatch[]
  } | null>(null)
  const [assistantNotice, setAssistantNotice] = useState<string | null>(null)

  const showReview = Boolean(parseResult) && !learnAssistant

  const handleFinalTranscript = useCallback((transcript: string) => {
    setSpokenInput((current) => appendTranscript(current, transcript))
  }, [])

  const {
    isSupported,
    isListening,
    interimTranscript,
    error: speechError,
    toggle: toggleSpeechInput,
  } = useSpeechRecognition({
    onFinalTranscript: handleFinalTranscript,
  })

  useEffect(() => {
    if (!isEditing || !activityId) {
      return
    }

    const editActivityId = activityId
    let cancelled = false

    async function loadActivity() {
      setLoadingActivity(true)
      setError(null)

      try {
        const data = await fetchMeasureActivity(editActivityId)

        if (cancelled) {
          return
        }

        if (data.areaId !== areaId) {
          throw new Error('Diese Maßnahme gehört nicht zu dieser Fläche.')
        }

        setActivityType(data.activityType)
        setActivityLabel(data.activityLabel)
        setOccurredAt(data.occurredAt)
        setProductName(data.productName ?? '')
        setAmount(formatAmountValue(data.amountApplied))
        setAmountUnit((data.amountUnit as ParsedActivityUnit | null) ?? '')
        setMowHeightMm(formatAmountValue(data.mowHeightMm))
        setNotes(data.notes ?? '')
        setParseResult({
          activityType: data.activityType,
          activityLabel: data.activityLabel,
          date: data.occurredAt,
          productName: data.productName,
          amount: data.amountApplied,
          unit: (data.amountUnit as ParsedActivityUnit | null) ?? null,
          mowHeightMm: data.mowHeightMm,
          note: data.notes,
          confidence: 1,
          warnings: [],
        })
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'Die Maßnahme konnte nicht geladen werden.'))
        }
      } finally {
        if (!cancelled) {
          setLoadingActivity(false)
        }
      }
    }

    void loadActivity()

    return () => {
      cancelled = true
    }
  }, [activityId, areaId, isEditing])

  useEffect(() => {
    let cancelled = false

    async function loadProducts() {
      try {
        const data = await fetchProducts()
        if (!cancelled) {
          setProducts(data)
        }
      } catch {
        // Produktbibliothek optional.
      }
    }

    void loadProducts()

    return () => {
      cancelled = true
    }
  }, [])

  function applyParsedResult(result: ParsedActivityResult, options?: { skipProductName?: boolean }) {
    setActivityType(result.activityType)
    setActivityLabel(result.activityLabel)
    setOccurredAt(result.date)

    if (result.productName && !options?.skipProductName) {
      setProductName(result.productName)
    }

    if (result.amount != null) {
      setAmount(String(result.amount))
    } else {
      setAmount('')
    }

    if (result.unit) {
      setAmountUnit(result.unit)
    } else {
      setAmountUnit('')
    }

    if (result.mowHeightMm != null) {
      setMowHeightMm(String(result.mowHeightMm))
    } else {
      setMowHeightMm('')
    }

    setNotes(result.note ?? '')
  }

  async function handleEvaluate() {
    const transcript = spokenInput.trim()

    if (!transcript) {
      setEvaluateError('Bitte gib zuerst eine gesprochene oder manuelle Eingabe ein.')
      return
    }

    setEvaluating(true)
    setEvaluateError(null)
    setAssistantNotice(null)
    setLearnAssistant(null)

    try {
      const result = await parseActivityTranscript({
        transcript,
        currentDate: todayDateInputValue(),
        currentAreaName: area.name,
      })

      const needsProductLookup =
        activityTypeRequiresProduct(result.activityType) && Boolean(result.productName)

      if (needsProductLookup) {
        let productLibrary = products

        if (productLibrary.length === 0) {
          try {
            productLibrary = await fetchProducts()
            setProducts(productLibrary)
          } catch {
            // optional
          }
        }

        if (productLibrary.length > 0) {
          const lookup = lookupSpokenProductName(result.productName!, productLibrary)

          if (lookup.kind === 'known') {
            const normalizedResult = {
              ...result,
              productName: lookup.officialName,
            }
            setParseResult(normalizedResult)
            applyParsedResult(normalizedResult)
            return
          }

          setParseResult(result)
          applyParsedResult(result, { skipProductName: true })
          setLearnAssistant({
            spokenName: lookup.spokenName,
            similarMatches: lookup.kind === 'ambiguous' ? lookup.matches : [],
          })
          return
        }

        setParseResult(result)
        applyParsedResult(result, { skipProductName: true })
        setLearnAssistant({
          spokenName: result.productName!.trim(),
          similarMatches: [],
        })
        return
      }

      setParseResult(result)
      applyParsedResult(result)
    } catch (evaluationError) {
      setEvaluateError(getErrorMessage(evaluationError, 'Die Eingabe konnte nicht ausgewertet werden.'))
      setParseResult(null)
    } finally {
      setEvaluating(false)
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!user) {
      setError('Du bist nicht angemeldet.')
      return
    }

    setSubmitting(true)
    setError(null)

    const parsedAmount = amount.trim() ? Number(amount.replace(',', '.')) : null
    const parsedMowHeight = mowHeightMm.trim() ? Number(mowHeightMm.replace(',', '.')) : null

    if (amount.trim() && Number.isNaN(parsedAmount)) {
      setError('Bitte gib eine gültige Menge ein.')
      setSubmitting(false)
      return
    }

    if (mowHeightMm.trim() && Number.isNaN(parsedMowHeight)) {
      setError('Bitte gib eine gültige Schnitthöhe ein.')
      setSubmitting(false)
      return
    }

    if (activityType === 'fertilization' && !productName.trim()) {
      setError('Bitte gib ein Produkt an.')
      setSubmitting(false)
      return
    }

    const payload = {
      areaId,
      activityType,
      activityLabel: activityLabel || undefined,
      occurredAt,
      productName: productName.trim() || null,
      notes,
      amountApplied: parsedAmount,
      amountUnit: amountUnit || null,
      mowHeightMm: parsedMowHeight,
    }

    try {
      if (isEditing && activityId) {
        await updateMeasureActivity({
          activityId,
          ...payload,
        })

        await refreshArea()

        navigate(`/area/${areaId}/timeline`, {
          replace: true,
          state: { notice: 'Maßnahme aktualisiert' },
        })
        return
      }

      await createMeasureActivity({
        userId: user.id,
        ...payload,
      })

      await refreshArea()

      navigate(`/area/${areaId}`, {
        replace: true,
        state: { notice: 'Maßnahme gespeichert' },
      })
    } catch (submitError) {
      setError(
        getErrorMessage(
          submitError,
          isEditing
            ? 'Die Maßnahme konnte nicht aktualisiert werden.'
            : 'Die Maßnahme konnte nicht gespeichert werden.',
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancel() {
    navigate(isEditing ? `/area/${areaId}/timeline` : `/area/${areaId}`)
  }

  function handleLearnAssistantComplete(result: { productName: string; submissionMessage?: string }) {
    setProductName(result.productName)
    setLearnAssistant(null)
    setAssistantNotice(
      result.submissionMessage ??
        'Produkt übernommen – du kannst deinen Journaleintrag jetzt speichern.',
    )
  }

  function handleLearnKnownProduct(officialName: string) {
    setProductName(officialName)
    setLearnAssistant(null)
    setAssistantNotice('Produkt aus der Bibliothek übernommen.')
  }

  const spokenInputPreview =
    interimTranscript && isListening
      ? appendTranscript(spokenInput, interimTranscript)
      : spokenInput

  const canEvaluate = spokenInput.trim().length > 0 && !evaluating && !submitting && !isListening
  const formDisabled = loadingActivity || submitting || evaluating

  const voiceStatusText = evaluating
    ? 'Ich werte deine Maßnahme aus …'
    : isListening
      ? 'Ich höre zu …'
      : 'Tippe zum Sprechen'

  const summaryRows = useMemo(() => {
    if (!parseResult || learnAssistant) {
      return []
    }

    return buildActivitySummaryRows(parseResult, {
      areaName: area.name,
      referenceDate: todayDateInputValue(),
    })
  }, [area.name, learnAssistant, parseResult])

  const showProductField =
    activityTypeRequiresProduct(activityType) || Boolean(productName.trim())
  const showAmountFields =
    ['fertilization', 'watering', 'application'].includes(activityType) ||
    Boolean(amount.trim()) ||
    Boolean(amountUnit)
  const showMowHeightField = activityType === 'mowing' || Boolean(mowHeightMm.trim())

  if (loadingActivity) {
    return (
      <div className={styles.formPage}>
        <p style={{ color: 'var(--color-text-secondary)' }}>Maßnahme wird geladen …</p>
      </div>
    )
  }

  return (
    <div className={styles.formPage}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{isEditing ? 'Maßnahme bearbeiten' : area.name}</p>
        <h1 className={styles.title}>{isEditing ? activityLabel || 'Maßnahme bearbeiten' : 'Neue Maßnahme'}</h1>
        {!isEditing && (
          <p className={styles.subtitle}>
            Erzähle mir einfach, was du heute auf deinem Rasen gemacht hast.
          </p>
        )}
      </header>

      <section className={`surface-card ${styles.card}`} aria-labelledby="measure-flow-heading">
        <h2 id="measure-flow-heading" className="visually-hidden">
          Neue Maßnahme erfassen
        </h2>

        <section className={styles.voiceSection} aria-labelledby="voice-section-heading">
          <h2 id="voice-section-heading" className="visually-hidden">
            Spracheingabe
          </h2>

          {isSupported ? (
            <>
              <div className={styles.voiceHero}>
                <button
                  className={`${styles.micButton} ${isListening ? styles.micButtonActive : ''}`}
                  type="button"
                  disabled={formDisabled}
                  onClick={toggleSpeechInput}
                  aria-pressed={isListening}
                  aria-label={isListening ? 'Spracheingabe beenden' : 'Spracheingabe starten'}
                >
                  <svg
                    className={styles.micIcon}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                    <line x1="8" x2="16" y1="22" y2="22" />
                  </svg>
                </button>

                <p className={styles.voiceStatus} aria-live="polite">
                  {voiceStatusText}
                </p>
              </div>

              {!showReview && (
                <div className={styles.examples}>
                  <p className={styles.examplesTitle}>Beispiele</p>
                  <ul className={styles.examplesList}>
                    {SPEECH_EXAMPLES.map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className={styles.transcriptCard}>
                <label className={styles.transcriptLabel} htmlFor="spoken-input">
                  {showReview ? 'Deine Beschreibung' : 'Erkannte Sprache'}
                </label>
                <textarea
                  id="spoken-input"
                  className={styles.transcriptTextarea}
                  value={isListening ? spokenInputPreview : spokenInput}
                  onChange={(event) => {
                    setSpokenInput(event.target.value)
                    setEvaluateError(null)
                  }}
                  placeholder="Beschreibe deine Maßnahme …"
                  readOnly={isListening}
                />
                {isListening && interimTranscript && (
                  <p className={styles.interimHint}>
                    Erkannte Zwischenergebnisse werden live ergänzt.
                  </p>
                )}
              </div>

              <button
                className={styles.evaluateButton}
                type="button"
                disabled={!canEvaluate || formDisabled}
                onClick={() => {
                  void handleEvaluate()
                }}
              >
                {evaluating ? 'Maßnahme wird erkannt …' : 'Maßnahme erkennen'}
              </button>

              {evaluateError && <p className={styles.speechError}>{evaluateError}</p>}
            </>
          ) : (
            <p className={styles.unsupportedHint}>
              Spracheingabe wird in diesem Browser nicht unterstützt. Du kannst deine Maßnahme
              unten manuell ergänzen, sobald du sie beschrieben hast.
            </p>
          )}

          {speechError && <p className={styles.speechError}>{speechError}</p>}

          {learnAssistant && (
            <ProductLearnAssistant
              spokenProductName={learnAssistant.spokenName}
              spokenTranscript={spokenInput.trim()}
              similarMatches={learnAssistant.similarMatches}
              products={products}
              variant="inline"
              onComplete={handleLearnAssistantComplete}
              onSelectKnownProduct={handleLearnKnownProduct}
              onDismiss={() => setLearnAssistant(null)}
            />
          )}

          {assistantNotice && <div className={styles.assistantNotice}>{assistantNotice}</div>}
        </section>

        {showReview && (
          <>
            <section className={styles.summarySection} aria-labelledby="measure-summary-heading">
              <div className={styles.summaryHeader}>
                <h2 id="measure-summary-heading" className={styles.summaryTitle}>
                  So habe ich deine Maßnahme verstanden
                </h2>
                {parseResult && (
                  <p className={styles.summaryMeta}>
                    Sicherheit: {formatConfidence(parseResult.confidence)}
                  </p>
                )}
              </div>

              <dl className={styles.summaryList}>
                {summaryRows.map((row) => (
                  <div key={row.label} className={styles.summaryRow}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>

              {parseResult && parseResult.warnings.length > 0 && (
                <ul className={styles.warningList}>
                  {parseResult.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </section>

            <form className={styles.form} onSubmit={handleSubmit}>
              <p className={styles.formIntro}>
                Prüfe kurz die Details – du kannst alles anpassen, bevor du speicherst.
              </p>

              <label className={styles.field}>
                <span className={styles.label}>Datum</span>
                <input
                  className={styles.input}
                  type="date"
                  required
                  value={occurredAt}
                  disabled={formDisabled}
                  onChange={(event) => setOccurredAt(event.target.value)}
                />
              </label>

              {showProductField && (
                <label className={styles.field}>
                  <span className={styles.label}>
                    Produkt{activityType === 'fertilization' ? '' : ' (optional)'}
                  </span>
                  <input
                    className={styles.input}
                    type="text"
                    required={activityType === 'fertilization'}
                    value={productName}
                    disabled={formDisabled}
                    onChange={(event) => setProductName(event.target.value)}
                    placeholder="z. B. ICL Spring Start"
                  />
                </label>
              )}

              {showMowHeightField && (
                <label className={styles.field}>
                  <span className={styles.label}>Schnitthöhe (optional)</span>
                  <input
                    className={styles.input}
                    type="text"
                    inputMode="decimal"
                    value={mowHeightMm}
                    disabled={formDisabled}
                    onChange={(event) => setMowHeightMm(event.target.value)}
                    placeholder="z. B. 20"
                  />
                </label>
              )}

              {showAmountFields && (
                <div className={styles.amountRow}>
                  <label className={styles.field}>
                    <span className={styles.label}>Menge (optional)</span>
                    <input
                      className={styles.input}
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      disabled={formDisabled}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="z. B. 25"
                    />
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Einheit (optional)</span>
                    <select
                      className={styles.input}
                      value={amountUnit}
                      disabled={formDisabled}
                      onChange={(event) =>
                        setAmountUnit(event.target.value as ParsedActivityUnit | '')
                      }
                    >
                      {UNIT_OPTIONS.map((unit) => (
                        <option key={unit || 'empty'} value={unit}>
                          {unit || '—'}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              <label className={styles.field}>
                <span className={styles.label}>Notiz (optional)</span>
                <textarea
                  className={styles.textarea}
                  value={notes}
                  disabled={formDisabled}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Ergänzende Notiz zur Maßnahme"
                />
              </label>

              {error && <p className={styles.error}>{error}</p>}

              <div className={styles.actions}>
                <button className={styles.submit} type="submit" disabled={formDisabled}>
                  {submitting ? 'Speichern …' : 'Maßnahme speichern'}
                </button>
                <button
                  className={styles.cancel}
                  type="button"
                  disabled={formDisabled}
                  onClick={handleCancel}
                >
                  Abbrechen
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  )
}
