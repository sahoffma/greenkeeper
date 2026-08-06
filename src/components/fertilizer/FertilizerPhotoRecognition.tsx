import { useEffect, useId, useRef } from 'react'
import { CameraIcon } from '../icons/CameraIcon'
import {
  formatRecognizedProductDisplay,
  logRecognitionFailureDiagnostic,
  RECOGNITION_CLIENT_TIMEOUT_MS,
  RECOGNITION_ERROR_FALLBACK_MESSAGE,
  RECOGNITION_PRIVACY_HINT,
  RECOGNITION_SLOW_HINT_MESSAGE,
  RECOGNITION_SLOW_HINT_MS,
  RECOGNITION_UI_PROGRESS_STEPS,
  recognitionAllowsAcceptance,
  recognitionNeedsClarification,
  resolveRecognitionFailureMessage,
  resolveRecognitionResultFailureMessage,
} from '../../lib/fertilizerRecognitionCore'
import { formatRecognitionResultScreenCopy } from '../../lib/fertilizerProductDisplay'
import {
  cancelRecognitionFlight,
  getActiveRecognitionFlight,
  startRecognitionFlight,
} from '../../lib/fertilizerRecognitionFlight'
import type { PhotoRecognitionSessionState } from '../../lib/fertilizerCaptureSessionCore'
import {
  recognizeProductFromImage,
} from '../../lib/productRecognizeClient'
import { trackFertilizerRecognition } from '../../lib/fertilizerRecognitionTelemetry'
import { createRandomId } from '../../lib/randomId'
import type { ProductRecognizeResult } from '../../types/productRecognize'
import styles from './FertilizerPhotoRecognition.module.css'

import {
  resolvePhotoRecognitionAcceptInvocation,
  storePhotoRecognitionAnalysisResult,
  type RecognitionClientHandoffTrace,
} from '../../lib/fertilizerCaptureRecognitionClientHandoffCore'
import {
  buildRecognitionClientPreFetchDiagnostics,
  logRecognitionClientPreFetch,
} from '../../lib/productRecognizeClientDiagnosticsCore'
import { encodeRecognitionFileForUpload } from '../../lib/productRecognizeImagePrepClientCore'

export interface FertilizerPhotoRecognitionProps {
  session: PhotoRecognitionSessionState
  onSessionChange: (next: PhotoRecognitionSessionState) => void
  onAccept: (result: ProductRecognizeResult, clientHandoffTrace: RecognitionClientHandoffTrace) => void
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

  const commitSessionChange = (next: PhotoRecognitionSessionState) => {
    sessionRef.current = next
    onSessionChange(next)
  }

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
      commitSessionChange({
        ...sessionRef.current,
        progressIndex: Math.min(
          sessionRef.current.progressIndex + 1,
          RECOGNITION_UI_PROGRESS_STEPS.length - 1,
        ),
      })
    }, 4000)

    const slowTimer = window.setTimeout(() => {
      commitSessionChange({
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
      const stored = storePhotoRecognitionAnalysisResult(
        sessionRef.current,
        response,
        sessionRef.current.clientHandoffTrace,
      )
      commitSessionChange({
        ...stored.session,
        clientHandoffTrace: stored.trace,
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
      commitSessionChange({
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

    const failureMessage = resolveRecognitionResultFailureMessage(response)
    logRecognitionFailureDiagnostic({ result: response, requestId })

    commitSessionChange({
      ...sessionRef.current,
      phase: 'error',
      result: response,
      errorMessage: failureMessage,
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
        commitSessionChange({
          ...sessionRef.current,
          phase: 'select',
          inFlightRequestId: null,
          errorMessage: null,
        })
      }

      return
    }

    const failureMessage = resolveRecognitionFailureMessage({ error: caught })
    logRecognitionFailureDiagnostic({ error: caught, requestId })

    commitSessionChange({
      ...sessionRef.current,
      phase: 'error',
      errorMessage: failureMessage,
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
  }

  async function analyzeFile(file: File) {
    const requestId = createRandomId()
    startedAtRef.current = Date.now()

    commitSessionChange({
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
        const encodeStartedAt = Date.now()
        const encoded = await encodeRecognitionFileForUpload(file)
        const encodeMs = Date.now() - encodeStartedAt
        const fetchStartedAt = new Date().toISOString()
        const preFetchDiagnostics = buildRecognitionClientPreFetchDiagnostics({
          fileName: file.name,
          browserMimeType: file.type || 'image/jpeg',
          originalBytes: file.size,
          resolvedUploadMimeType: encoded.mimeType,
          base64Length: encoded.base64.length,
          imageBase64: encoded.base64,
          encodeMs,
          fetchStartedAt,
        })
        logRecognitionClientPreFetch(preFetchDiagnostics)

        return recognizeProductFromImage({
          imageBase64: encoded.base64,
          mimeType: encoded.mimeType,
          fileName: file.name,
          signal,
          timeoutMs: RECOGNITION_CLIENT_TIMEOUT_MS,
          preFetchDiagnostics,
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
    commitSessionChange({
      ...createInitialPhotoSessionFrom(sessionRef.current),
      phase: 'select',
      inFlightRequestId: null,
      errorMessage: null,
      progressIndex: 0,
      slowHint: false,
    })
  }

  function handleAccept() {
    const acceptInvocation = resolvePhotoRecognitionAcceptInvocation(
      session,
      session.clientHandoffTrace,
    )
    if (!acceptInvocation) {
      return
    }

    trackFertilizerRecognition({
      outcome: 'success',
      catalogHit: acceptInvocation.result.catalogMatch.matched,
      webSourceFound: acceptInvocation.result.sources.some((source) =>
        ['official_manufacturer', 'official_brand'].includes(source.type),
      ),
      backPhotoRequested: false,
      totalLatencyMs: startedAtRef.current ? Date.now() - startedAtRef.current : null,
      fileFormat: acceptInvocation.result.diagnostics.imagePrep?.originalFormat ?? null,
      identityConfidence: acceptInvocation.result.identityConfidence,
      dataCompleteness: acceptInvocation.result.dataCompleteness,
      userAccepted: true,
      userDiscarded: false,
    })

    onAccept(acceptInvocation.result, acceptInvocation.trace)
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

    commitSessionChange({
      ...createInitialPhotoSessionFrom(sessionRef.current),
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
    commitSessionChange({
      ...createInitialPhotoSessionFrom(sessionRef.current),
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
