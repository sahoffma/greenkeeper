import { useCallback, useMemo, useRef, useState } from 'react'
import {
  analysisToImportPayload,
  buildProductAssistantPreview,
  inferAiFieldConfidence,
  searchProductCatalog,
} from '../../lib/productAssistantCore'
import {
  analyzeProductAssistant,
  submitProductAssistantProposal,
} from '../../lib/productAssistantClient'
import { buildPreviewDisplayRows } from '../../lib/productAssistantDisplay'
import { getErrorMessage } from '../../lib/errors'
import { formatJournalProductName } from '../../lib/productLookup'
import {
  buildAnalyzeRequestFromCapture,
  buildSubmissionSources,
  createEmptyCaptureState,
  LEARN_SOURCE_OPTIONS,
  resolveInputChannel,
  validateCaptureState,
  type ProductLearnCaptureState,
} from '../../lib/productLearnAssistantFlow'
import type { Product } from '../../types/product'
import type {
  ProductAssistantMatch,
  ProductAssistantPreview,
  ProductLearnSourceType,
} from '../../types/productAssistant'
import styles from './ProductLearnAssistant.module.css'

type LearnStep = 'similar' | 'intro' | 'capture' | 'loading' | 'preview' | 'complete'

export interface ProductLearnAssistantResult {
  productName: string
  submissionMessage?: string
}

export interface ProductLearnAssistantProps {
  spokenProductName: string
  spokenTranscript?: string
  similarMatches?: ProductAssistantMatch[]
  products: Product[]
  variant?: 'inline' | 'page'
  onSelectKnownProduct?: (officialName: string) => void
  onComplete: (result: ProductLearnAssistantResult) => void
  onDismiss?: () => void
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Datei konnte nicht gelesen werden.'))
      }
    }

    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    reader.readAsDataURL(file)
  })
}

function DisplayRows({ rows }: { rows: Array<{ label: string; value: string }> }) {
  return (
    <div className={styles.detailGrid}>
      {rows.map((row) => (
        <div key={row.label} className={styles.detailRow}>
          <div className={styles.detailLabel}>{row.label}</div>
          <div className={styles.detailValue}>{row.value}</div>
        </div>
      ))}
    </div>
  )
}

export function ProductLearnAssistant({
  spokenProductName,
  spokenTranscript,
  similarMatches = [],
  products,
  variant = 'inline',
  onSelectKnownProduct,
  onComplete,
  onDismiss,
}: ProductLearnAssistantProps) {
  const photoInputRef = useRef<HTMLInputElement>(null)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const initialStep: LearnStep = similarMatches.length > 0 ? 'similar' : 'intro'

  const [step, setStep] = useState<LearnStep>(initialStep)
  const [selectedSource, setSelectedSource] = useState<ProductLearnSourceType | null>(null)
  const [capture, setCapture] = useState<ProductLearnCaptureState | null>(null)
  const [preview, setPreview] = useState<ProductAssistantPreview | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [completionMessage, setCompletionMessage] = useState<string | null>(null)

  const previewRows = useMemo(
    () => (preview ? buildPreviewDisplayRows(preview) : []),
    [preview],
  )

  const resetToIntro = useCallback(() => {
    setStep('intro')
    setSelectedSource(null)
    setCapture(null)
    setPreview(null)
    setWarnings([])
    setError(null)
    setCompletionMessage(null)
  }, [])

  const handleSelectSource = (sourceType: ProductLearnSourceType) => {
    setError(null)
    setSelectedSource(sourceType)
    setCapture(createEmptyCaptureState(sourceType))
    setStep('capture')
  }

  const handlePhotosChange = async (files: FileList | null) => {
    if (!files || files.length === 0 || !capture) {
      return
    }

    setError(null)

    try {
      const nextPhotos = [...capture.photos]

      for (const file of Array.from(files)) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          throw new Error('Bitte wähle JPEG-, PNG- oder WebP-Fotos.')
        }

        if (file.size > 4 * 1024 * 1024) {
          throw new Error('Jedes Foto darf maximal 4 MB groß sein.')
        }

        if (nextPhotos.length >= 6) {
          throw new Error('Maximal 6 Fotos pro Einreichung.')
        }

        const dataUrl = await readFileAsDataUrl(file)
        nextPhotos.push({ dataUrl, mimeType: file.type })
      }

      setCapture({ ...capture, photos: nextPhotos })
    } catch (photoError) {
      setError(getErrorMessage(photoError, 'Fotos konnten nicht geladen werden.'))
    }
  }

  const handlePdfChange = async (file: File | null) => {
    if (!capture) {
      return
    }

    setError(null)

    if (!file) {
      setCapture({ ...capture, pdf: null })
      return
    }

    if (file.type !== 'application/pdf') {
      setError('Bitte wähle eine PDF-Datei.')
      return
    }

    if (file.size > 8 * 1024 * 1024) {
      setError('Die PDF-Datei darf maximal 8 MB groß sein.')
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      setCapture({ ...capture, pdf: { dataUrl, mimeType: file.type } })
    } catch (pdfError) {
      setError(getErrorMessage(pdfError, 'PDF konnte nicht geladen werden.'))
    }
  }

  const runAnalysis = async () => {
    if (!capture) {
      return
    }

    const validationError = validateCaptureState(capture)

    if (validationError) {
      setError(validationError)
      return
    }

    setStep('loading')
    setError(null)

    try {
      const catalogSearch = searchProductCatalog(products, {
        manufacturer: '',
        officialName: spokenProductName,
      })

      if (catalogSearch.kind === 'exact') {
        const product = products.find((entry) => entry.id === catalogSearch.match.productId)

        if (product) {
          onSelectKnownProduct?.(product.officialName)
          onComplete({ productName: product.officialName })
          return
        }
      }

      const analysis = await analyzeProductAssistant(
        buildAnalyzeRequestFromCapture(capture, {
          spokenProductName,
          spokenTranscript,
        }),
      )

      const nextPreview = buildProductAssistantPreview(analysis, {
        manufacturer: '',
        officialName: spokenProductName,
      })

      if (!nextPreview) {
        throw new Error(
          'Aus der Quelle konnte kein Produktname erkannt werden. Bitte versuche eine andere Quelle.',
        )
      }

      setPreview(nextPreview)
      setWarnings(analysis.warnings)
      setStep('preview')
    } catch (analysisError) {
      setError(getErrorMessage(analysisError, 'Die Produktanalyse ist fehlgeschlagen.'))
      setStep('capture')
    }
  }

  const handleSubmitAndContinue = async () => {
    if (!preview || !capture) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const payload = analysisToImportPayload(preview, {
        manufacturer: preview.displayManufacturer,
        officialName: preview.displayOfficialName,
      })

      if (!payload) {
        throw new Error('Der Produktvorschlag ist unvollständig.')
      }

      const response = await submitProductAssistantProposal({
        payload,
        channel: resolveInputChannel(capture),
        sourceType: capture.sourceType,
        sourceDescription: preview.sourceDescription,
        aiFieldConfidence: inferAiFieldConfidence(preview),
        sources: buildSubmissionSources(capture, preview.sourceDescription),
      })

      const journalProductName = formatJournalProductName(
        preview.displayManufacturer === 'Unbekannt' ? '' : preview.displayManufacturer,
        preview.displayOfficialName,
      )

      setCompletionMessage(response.message)
      setStep('complete')
      onComplete({
        productName: journalProductName || spokenProductName,
        submissionMessage: response.message,
      })
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Der Vorschlag konnte nicht eingereicht werden.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleKnownMatch = (match: ProductAssistantMatch) => {
    const product = products.find((entry) => entry.id === match.productId)
    const officialName = product?.officialName ?? match.officialName

    onSelectKnownProduct?.(officialName)
    onComplete({ productName: officialName })
  }

  const selectedOption = LEARN_SOURCE_OPTIONS.find((option) => option.type === selectedSource)

  const rootClassName = variant === 'inline' ? styles.inlinePanel : styles.productLearn

  return (
    <section className={rootClassName} aria-labelledby="product-learn-heading">
      <h2 id="product-learn-heading" className="visually-hidden">
        Produkt kennenlernen
      </h2>

      {(spokenProductName || spokenTranscript) && step !== 'complete' && (
        <div className={styles.contextCard}>
          {spokenProductName && (
            <>
              <p className={styles.contextLabel}>Aus deiner Spracheingabe</p>
              <p className={styles.contextProduct}>{spokenProductName}</p>
            </>
          )}
          {spokenTranscript && variant === 'inline' && (
            <p className={styles.contextTranscript}>{spokenTranscript}</p>
          )}
        </div>
      )}

      {error && <div className={styles.errorBox}>{error}</div>}
      {completionMessage && step === 'complete' && (
        <div className={styles.successBox}>{completionMessage}</div>
      )}

      {step === 'similar' && similarMatches.length > 0 && (
        <div className={styles.captureCard}>
          <h3 className={styles.captureTitle}>Meintest du eines dieser Produkte?</h3>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, lineHeight: 1.5 }}>
            Falls ja, kannst du direkt weitermachen – ansonsten helf mir kurz, das neue Produkt
            kennenzulernen.
          </p>
          <div className={styles.matchList}>
            {similarMatches.map((match) => (
              <button
                key={match.productId}
                type="button"
                className={styles.matchButton}
                onClick={() => handleKnownMatch(match)}
              >
                <strong>
                  {match.manufacturer} – {match.officialName}
                </strong>
                <span>{match.matchReason}</span>
              </button>
            ))}
          </div>
          <div className={styles.actions} style={{ marginTop: 'var(--space-md)' }}>
            <button type="button" className={styles.primaryButton} onClick={() => setStep('intro')}>
              Nein, anderes Produkt
            </button>
          </div>
        </div>
      )}

      {step === 'intro' && (
        <div className={styles.intro}>
          <h3 className={styles.introTitle}>Dieses Produkt kenne ich noch nicht.</h3>
          <p className={styles.introSubtitle}>
            Hilf mir kurz dabei, dieses Produkt kennenzulernen. Wähle einfach die Möglichkeit, die
            für dich gerade am einfachsten ist.
          </p>
          <div className={styles.optionGrid}>
            {LEARN_SOURCE_OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                className={styles.optionButton}
                onClick={() => handleSelectSource(option.type)}
              >
                <span className={styles.optionIcon} aria-hidden="true">
                  {option.icon}
                </span>
                <span className={styles.optionCopy}>
                  <span className={styles.optionTitle}>{option.title}</span>
                  <span className={styles.optionDescription}>{option.description}</span>
                </span>
              </button>
            ))}
          </div>
          {onDismiss && (
            <div className={styles.actions}>
              <button type="button" className={styles.ghostButton} onClick={onDismiss}>
                Später ergänzen
              </button>
            </div>
          )}
        </div>
      )}

      {step === 'capture' && capture && selectedOption && (
        <div className={styles.captureCard}>
          <h3 className={styles.captureTitle}>{selectedOption.title}</h3>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 0, lineHeight: 1.5 }}>
            {selectedOption.description}
          </p>

          {capture.sourceType === 'photos' && (
            <>
              <label className={styles.uploadArea} htmlFor="learn-photo-input">
                <input
                  id="learn-photo-input"
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => void handlePhotosChange(event.target.files)}
                />
                <strong>Fotos hinzufügen</strong>
                <span>JPEG, PNG oder WebP – bis zu 6 Fotos, je 4 MB</span>
              </label>
              {capture.photos.length > 0 && (
                <div className={styles.photoGrid}>
                  {capture.photos.map((photo, index) => (
                    <img
                      key={`${photo.mimeType}-${index}`}
                      src={photo.dataUrl}
                      alt={`Verpackungsfoto ${index + 1}`}
                      className={styles.photoThumb}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {(capture.sourceType === 'manufacturer_url' || capture.sourceType === 'shop_url') && (
            <input
              className={styles.urlInput}
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={capture.sourceUrl}
              onChange={(event) =>
                setCapture({ ...capture, sourceUrl: event.target.value })
              }
              autoComplete="off"
            />
          )}

          {capture.sourceType === 'pdf' && (
            <label className={styles.uploadArea} htmlFor="learn-pdf-input">
              <input
                id="learn-pdf-input"
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                onChange={(event) => void handlePdfChange(event.target.files?.[0] ?? null)}
              />
              <strong>{capture.pdf ? 'PDF ausgewählt' : 'PDF hochladen'}</strong>
              <span>Maximal 8 MB</span>
            </label>
          )}

          <div className={styles.actions} style={{ marginTop: 'var(--space-md)' }}>
            <button type="button" className={styles.primaryButton} onClick={() => void runAnalysis()}>
              Analyse starten
            </button>
            <button type="button" className={styles.secondaryButton} onClick={resetToIntro}>
              Andere Quelle wählen
            </button>
          </div>
        </div>
      )}

      {step === 'loading' && (
        <div className={styles.loading} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span>Ich schaue mir die Quelle an und bereite deinen Journaleintrag vor …</span>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className={styles.captureCard}>
          <div className={styles.previewHeader}>
            <h3 className={styles.previewTitle}>So habe ich das Produkt verstanden</h3>
            <span className={styles.badge}>Zur Prüfung</span>
          </div>

          {warnings.length > 0 && (
            <div className={styles.warningBox} style={{ marginBottom: 'var(--space-md)' }}>
              {warnings.join(' ')}
            </div>
          )}

          <DisplayRows rows={previewRows} />

          <div className={styles.actions} style={{ marginTop: 'var(--space-md)' }}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={submitting}
              onClick={() => void handleSubmitAndContinue()}
            >
              {submitting
                ? 'Wird übernommen …'
                : variant === 'inline'
                  ? 'Produkt übernehmen und weiter'
                  : 'Vorschlag absenden'}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={submitting}
              onClick={resetToIntro}
            >
              Andere Quelle
            </button>
          </div>
        </div>
      )}

      {step === 'complete' && variant === 'page' && !completionMessage && (
        <div className={styles.actions}>
          <button type="button" className={styles.primaryButton} onClick={resetToIntro}>
            Weiteres Produkt prüfen
          </button>
        </div>
      )}
    </section>
  )
}
