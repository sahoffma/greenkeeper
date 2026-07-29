import { useEffect, useId, useRef } from 'react'
import { CameraIcon } from '../icons/CameraIcon'
import {
  formatRecognizedProductDisplay,
  RECOGNITION_CLIENT_TIMEOUT_MS,
  RECOGNITION_ERROR_FALLBACK_MESSAGE,
  RECOGNITION_PRIVACY_HINT,
  RECOGNITION_SLOW_HINT_MESSAGE,
  RECOGNITION_SLOW_HINT_MS,
  RECOGNITION_UI_PROGRESS_STEPS,
  recognitionAllowsAcceptance,
  recognitionNeedsClarification,
} from '../../lib/fertilizerRecognitionCore'
import { formatRecognitionResultScreenCopy } from '../../lib/fertilizerProductDisplay'
import {
  cancelRecognitionFlight,
  getActiveRecognitionFlight,
  startRecognitionFlight,
} from '../../lib/fertilizerRecognitionFlight'
import type { PhotoRecognitionSessionState } from '../../lib/fertilizerCaptureSessionCore'
import {
  ProductRecognizeClientError,
  recognizeProductFromImage,
} from '../../lib/productRecognizeClient'
import { trackFertilizerRecognition } from '../../lib/fertilizerRecognitionTelemetry'
import { createRandomId } from '../../lib/randomId'
import type { ProductRecognizeResult } from '../../types/productRecognize'
import styles from './FertilizerPhotoRecognition.module.css'

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const [, meta, base64] = /^data:([^;]+);base64,(.+)$/.exec(result) ?? []

      resolve({
        mimeType: meta ?? (file.type || 'image/jpeg'),
        base64: base64 ?? result,
      })
    }

    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    reader.readAsDataURL(file)
  })
}

export interface FertilizerPhotoRecognitionProps {
  session: PhotoRecognitionSessionState
  onSessionChange: (next: PhotoRecognitionSessionState) => void
  onAccept: (result: ProductRecognizeResult) => void
  onCancel: () => void
}

export function FertilizerPhotoRecognition({
  session,
  onSessionChange,
  onAccept,
  onCancel,
}: FertilizerPhotoRecognitionProps) {
  const cameraInputId = useId()
  const fileInputId = useId()
  const startedAtRef = useRef<number | null>(null)
  const sessionRef = useRef(session)
  sessionRef.current = session

  useEffect(() => {
    if (session.phase !== 'analyzing' || !session.inFlightRequestId) {
      return
    }

    const requestId = session.inFlightRequestId
    const existing = getActiveRecognitionFlight(requestId)

    if (!existing) {
      return
    }

    startedAtRef.current = startedAtRef.current ?? Date.now()

    void existing
      .then((response) => {
        if (sessionRef.current.inFlightRequestId !== requestId) {
          return
        }

        applyRecognitionResponse(response, requestId)
      })
      .catch((caught) => {
        if (sessionRef.current.inFlightRequestId !== requestId) {
          return
        }

        handleRecognitionFailure(caught, requestId, sessionRef.current.imageMeta?.mimeType ?? null)
      })
  }, [session.inFlightRequestId, session.phase])

  useEffect(() => {
    if (session.phase !== 'analyzing') {
      return
    }

    const stepTimer = window.setInterval(() => {
      onSessionChange({
        ...sessionRef.current,
        progressIndex: Math.min(
          sessionRef.current.progressIndex + 1,
          RECOGNITION_UI_PROGRESS_STEPS.length - 1,
        ),
      })
    }, 4000)

    const slowTimer = window.setTimeout(() => {
      onSessionChange({
        ...sessionRef.current,
        slowHint: true,
      })
    }, RECOGNITION_SLOW_HINT_MS)

    return () => {
      window.clearInterval(stepTimer)
      window.clearTimeout(slowTimer)
    }
  }, [session.phase, session.inFlightRequestId, onSessionChange])

  function applyRecognitionResponse(response: ProductRecognizeResult, requestId: string) {
    if (sessionRef.current.inFlightRequestId !== requestId) {
      return
    }

    const latency = startedAtRef.current ? Date.now() - startedAtRef.current : null
    const webSourceFound = response.sources.some((source) =>
      ['official_manufacturer', 'official_brand'].includes(source.type),
    )

    if (recognitionAllowsAcceptance(response)) {
      onSessionChange({
        ...sessionRef.current,
        phase: 'result',
        result: response,
        errorMessage: null,
        inFlightRequestId: null,
      })
      trackFertilizerRecognition({
        outcome: 'success',
        catalogHit: response.catalogMatch.matched,
        webSourceFound,
        backPhotoRequested: false,
        totalLatencyMs: latency,
        pipelineLatencies: response.diagnostics.pipelineLatencies
          ? { ...response.diagnostics.pipelineLatencies }
          : undefined,
        fileFormat: response.diagnostics.imagePrep?.originalFormat ?? null,
        identityConfidence: response.identityConfidence,
        dataCompleteness: response.dataCompleteness,
        userAccepted: null,
        userDiscarded: null,
      })
      return
    }

    if (recognitionNeedsClarification(response)) {
      onSessionChange({
        ...sessionRef.current,
        phase: 'unclear',
        result: response,
        errorMessage: null,
        inFlightRequestId: null,
      })
      trackFertilizerRecognition({
        outcome: 'unclear',
        catalogHit: response.catalogMatch.matched,
        webSourceFound,
        backPhotoRequested: response.nextAction.type === 'request_back_photo',
        totalLatencyMs: latency,
        fileFormat: response.diagnostics.imagePrep?.originalFormat ?? null,
        identityConfidence: response.identityConfidence,
        dataCompleteness: response.dataCompleteness,
        userAccepted: null,
        userDiscarded: null,
      })
      return
    }

    onSessionChange({
      ...sessionRef.current,
      phase: 'error',
      result: response,
      errorMessage: RECOGNITION_ERROR_FALLBACK_MESSAGE,
      inFlightRequestId: null,
    })
    trackFertilizerRecognition({
      outcome: 'technical_failure',
      catalogHit: false,
      webSourceFound: false,
      backPhotoRequested: false,
      totalLatencyMs: latency,
      fileFormat: response.diagnostics.imagePrep?.originalFormat ?? null,
      identityConfidence: response.identityConfidence,
      dataCompleteness: response.dataCompleteness,
      userAccepted: null,
      userDiscarded: null,
    })
  }

  function handleRecognitionFailure(
    caught: unknown,
    requestId: string,
    fileFormat: string | null,
  ) {
    if (sessionRef.current.inFlightRequestId !== requestId) {
      return
    }

    if (caught instanceof DOMException && caught.name === 'AbortError') {
      const reason =
        caught instanceof Error && 'cause' in caught
          ? String((caught as Error & { cause?: unknown }).cause)
          : 'cancelled'

      trackFertilizerRecognition({
        outcome: reason === 'timeout' ? 'timeout' : 'cancelled',
        catalogHit: false,
        webSourceFound: false,
        backPhotoRequested: false,
        totalLatencyMs: startedAtRef.current ? Date.now() - startedAtRef.current : null,
        fileFormat,
        identityConfidence: null,
        dataCompleteness: null,
        userAccepted: null,
        userDiscarded: null,
      })

      if (reason !== 'superseded') {
        onSessionChange({
          ...sessionRef.current,
          phase: 'select',
          inFlightRequestId: null,
          errorMessage: null,
        })
      }

      return
    }

    onSessionChange({
      ...sessionRef.current,
      phase: 'error',
      errorMessage: RECOGNITION_ERROR_FALLBACK_MESSAGE,
      inFlightRequestId: null,
    })
    trackFertilizerRecognition({
      outcome: 'technical_failure',
      catalogHit: false,
      webSourceFound: false,
      backPhotoRequested: false,
      totalLatencyMs: startedAtRef.current ? Date.now() - startedAtRef.current : null,
      fileFormat,
      identityConfidence: null,
      dataCompleteness: null,
      userAccepted: null,
      userDiscarded: null,
    })

    if (caught instanceof ProductRecognizeClientError) {
      onSessionChange({
        ...sessionRef.current,
        phase: 'error',
        errorMessage: RECOGNITION_ERROR_FALLBACK_MESSAGE,
        inFlightRequestId: null,
      })
    }
  }

  async function analyzeFile(file: File) {
    const requestId = createRandomId()
    startedAtRef.current = Date.now()

    onSessionChange({
      ...sessionRef.current,
      phase: 'analyzing',
      result: null,
      errorMessage: null,
      progressIndex: 0,
      slowHint: false,
      inFlightRequestId: requestId,
      imageMeta: {
        fileName: file.name,
        mimeType: file.type || 'image/jpeg',
        lastModified: file.lastModified,
      },
    })

    try {
      const response = await startRecognitionFlight(requestId, async (signal) => {
        const encoded = await fileToBase64(file)
        return recognizeProductFromImage({
          imageBase64: encoded.base64,
          mimeType: encoded.mimeType,
          fileName: file.name,
          signal,
          timeoutMs: RECOGNITION_CLIENT_TIMEOUT_MS,
        })
      })

      if (sessionRef.current.inFlightRequestId !== requestId) {
        return
      }

      applyRecognitionResponse(response, requestId)
    } catch (caught) {
      handleRecognitionFailure(caught, requestId, file.type || null)
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (file) {
      void analyzeFile(file)
    }
  }

  function handleCancelAnalysis() {
    cancelRecognitionFlight(session.inFlightRequestId)
    onSessionChange({
      ...sessionRef.current,
      phase: 'select',
      inFlightRequestId: null,
      errorMessage: null,
      progressIndex: 0,
      slowHint: false,
    })
  }

  function handleAccept() {
    if (!session.result) {
      return
    }

    trackFertilizerRecognition({
      outcome: 'success',
      catalogHit: session.result.catalogMatch.matched,
      webSourceFound: session.result.sources.some((source) =>
        ['official_manufacturer', 'official_brand'].includes(source.type),
      ),
      backPhotoRequested: false,
      totalLatencyMs: startedAtRef.current ? Date.now() - startedAtRef.current : null,
      fileFormat: session.result.diagnostics.imagePrep?.originalFormat ?? null,
      identityConfidence: session.result.identityConfidence,
      dataCompleteness: session.result.dataCompleteness,
      userAccepted: true,
      userDiscarded: false,
    })

    onAccept(session.result)
  }

  function handleDiscard() {
    if (session.result) {
      trackFertilizerRecognition({
        outcome: 'success',
        catalogHit: session.result.catalogMatch.matched,
        webSourceFound: false,
        backPhotoRequested: false,
        totalLatencyMs: null,
        fileFormat: session.result.diagnostics.imagePrep?.originalFormat ?? null,
        identityConfidence: session.result.identityConfidence,
        dataCompleteness: session.result.dataCompleteness,
        userAccepted: false,
        userDiscarded: true,
      })
    }

    onSessionChange({
      ...createInitialPhotoSessionFrom(session),
      phase: 'select',
      result: null,
      errorMessage: null,
      inFlightRequestId: null,
    })
  }

  function createInitialPhotoSessionFrom(current: PhotoRecognitionSessionState) {
    return {
      ...current,
      progressIndex: 0,
      slowHint: false,
      imageMeta: null,
    }
  }

  function resetToSelect() {
    onSessionChange({
      ...createInitialPhotoSessionFrom(session),
      phase: 'select',
      result: null,
      errorMessage: null,
      inFlightRequestId: null,
    })
  }

  const display = session.result ? formatRecognizedProductDisplay(session.result) : null
  const resultCopy =
    session.result && session.phase === 'result'
      ? formatRecognitionResultScreenCopy(session.result)
      : null

  if (session.phase === 'select') {
    return (
      <section className={styles.panel} aria-labelledby="photo-recognition-heading">
        <h2 id="photo-recognition-heading" className={styles.title}>
          Verpackung fotografieren
        </h2>
        <p className={styles.privacyHint}>{RECOGNITION_PRIVACY_HINT}</p>

        <div className={styles.actions}>
          <label className={styles.actionButton} htmlFor={cameraInputId}>
            <CameraIcon />
            <span>Kamera</span>
          </label>
          <label className={styles.actionButton} htmlFor={fileInputId}>
            <span>Foto auswählen</span>
          </label>
        </div>

        <input
          id={cameraInputId}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          capture="environment"
          onChange={handleFileChange}
        />
        <input
          id={fileInputId}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          onChange={handleFileChange}
        />

        <button type="button" className={styles.secondaryButton} onClick={onCancel}>
          Zurück
        </button>
      </section>
    )
  }

  if (session.phase === 'analyzing') {
    return (
      <section className={styles.panel} aria-live="polite">
        <h2 className={styles.title}>Analyse läuft</h2>
        <ol className={styles.progressList}>
          {RECOGNITION_UI_PROGRESS_STEPS.map((step, index) => (
            <li
              key={step}
              className={`${styles.progressItem} ${index <= session.progressIndex ? styles.progressItemActive : ''}`}
            >
              {step}
            </li>
          ))}
        </ol>
        {session.slowHint && <p className={styles.slowHint}>{RECOGNITION_SLOW_HINT_MESSAGE}</p>}
        <button type="button" className={styles.secondaryButton} onClick={handleCancelAnalysis}>
          Abbrechen
        </button>
      </section>
    )
  }

  if (session.phase === 'result' && display && session.result) {
    return (
      <section className={styles.panel} aria-labelledby="photo-result-heading">
        <h2 id="photo-result-heading" className={styles.title}>
          Produkt erkannt
        </h2>
        <div className={styles.productCard}>
          <div className={styles.identityGroup}>
            <p className={styles.productTitle}>{display.title}</p>
            {display.descriptor && (
              <p className={styles.productDescriptor}>{display.descriptor}</p>
            )}
          </div>
          {(display.npk || display.packageSize || display.productForm) && (
            <div className={styles.productDataGroup}>
              {display.npk && <p className={styles.productDataItem}>{display.npk}</p>}
              {display.packageSize && (
                <p className={styles.productDataItem}>{display.packageSize}</p>
              )}
              {display.productForm && (
                <p className={styles.productDataItem}>{display.productForm}</p>
              )}
            </div>
          )}
          {resultCopy ? (
            <div className={styles.resultCopy}>
              <p className={styles.resultCopyLine}>{resultCopy.headline}</p>
              <p className={styles.resultCopyLine}>{resultCopy.subline}</p>
            </div>
          ) : null}
        </div>
        <div className={styles.resultActions}>
          <button type="button" className={styles.primaryButton} onClick={handleAccept}>
            Produkt übernehmen
          </button>
          <button type="button" className={styles.secondaryButton} onClick={handleDiscard}>
            Anderes Produkt
          </button>
        </div>
      </section>
    )
  }

  if (session.phase === 'unclear' && session.result) {
    return (
      <section className={styles.panel}>
        <h2 className={styles.title}>Noch nicht eindeutig</h2>
        <p className={styles.clarifyMessage}>
          {session.result.nextAction.message ??
            'Ich kann das Produkt noch nicht sicher zuordnen. Bitte versuche ein klareres Foto.'}
        </p>
        <div className={styles.resultActions}>
          {session.result.nextAction.type === 'request_back_photo' && (
            <button type="button" className={styles.primaryButton} onClick={resetToSelect}>
              Rückseite fotografieren
            </button>
          )}
          <button type="button" className={styles.secondaryButton} onClick={onCancel}>
            Anderen Weg wählen
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className={styles.panel}>
      <h2 className={styles.title}>Erkennung nicht verfügbar</h2>
      <p className={styles.errorMessage}>
        {session.errorMessage ?? RECOGNITION_ERROR_FALLBACK_MESSAGE}
      </p>
      <div className={styles.resultActions}>
        <button type="button" className={styles.primaryButton} onClick={resetToSelect}>
          Foto erneut versuchen
        </button>
        <button type="button" className={styles.secondaryButton} onClick={onCancel}>
          Produkt suchen
        </button>
      </div>
    </section>
  )
}
