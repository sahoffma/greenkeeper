import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition'
import {
  canStartHomeRecording,
  resolveHomeVoiceStatusText,
} from '../../lib/homeVoiceInteraction'
import {
  appendTranscript,
  buildConfirmationRows,
  evaluateHomeTranscript,
  HOME_VOICE_PREP_MESSAGE,
  isParseEndpointUnavailable,
  MAX_HOME_RECORDING_MS,
  saveHomeParsedActivity,
  type HomeVoicePhase,
} from '../../lib/homeVoiceFlow'
import {
  buildHomeFertilizerReadySummary,
  detectFixtureFertilizerPurchase,
  homeFertilizerCapturePath,
  homeFertilizerClarifyMessage,
  resolveHomeFertilizerPackageAnswer,
} from '../../lib/homeFertilizerPurchaseFlow'
import { resolveSpeechEnvironmentBlocker, isSecureSpeechContext } from '../../lib/speechRecognitionEnvironment'
import type { FertilizerCaptureSummary } from '../../lib/fertilizerCaptureCore'
import type { Area } from '../../types/area'
import type { ParsedActivityResult } from '../../types/parseActivity'
import { ActivityConfirmationPanel } from './ActivityConfirmationPanel'
import styles from './HomeVoiceSection.module.css'

const TEXT_EXAMPLES = [
  'Heute habe ich Rasenfläche 1 gemäht.',
  'Ich habe einen Sack ICL All Season gekauft.',
  'Auf meiner hinteren Fläche ist eine gelbe Stelle.',
]

interface HomeVoiceSectionProps {
  selectedArea: Area | null
}

export function HomeVoiceSection({ selectedArea }: HomeVoiceSectionProps) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const recordingTimerRef = useRef<number | null>(null)

  const [phase, setPhase] = useState<HomeVoicePhase>('idle')
  const [spokenInput, setSpokenInput] = useState('')
  const [textModeOpen, setTextModeOpen] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [flowMessage, setFlowMessage] = useState<string | null>(null)
  const [flowError, setFlowError] = useState<string | null>(null)
  const [parseResult, setParseResult] = useState<ParsedActivityResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [fertilizerFlowActive, setFertilizerFlowActive] = useState(false)
  const [fertilizerClarifyAnswer, setFertilizerClarifyAnswer] = useState('')
  const [fertilizerSummary, setFertilizerSummary] = useState<FertilizerCaptureSummary | null>(null)

  const clearRecordingTimer = useCallback(() => {
    if (recordingTimerRef.current != null) {
      window.clearTimeout(recordingTimerRef.current)
      recordingTimerRef.current = null
    }
  }, [])

  const handleFinalTranscript = useCallback((transcript: string) => {
    setSpokenInput((current) => appendTranscript(current, transcript))
  }, [])

  const {
    isSupported,
    isListening,
    interimTranscript,
    error: speechError,
    start,
    stop,
  } = useSpeechRecognition({
    onFinalTranscript: handleFinalTranscript,
  })

  const resetFlow = useCallback(() => {
    clearRecordingTimer()
    setPhase('idle')
    setSpokenInput('')
    setTextInput('')
    setFlowMessage(null)
    setFlowError(null)
    setParseResult(null)
    setSubmitting(false)
    setFertilizerFlowActive(false)
    setFertilizerClarifyAnswer('')
    setFertilizerSummary(null)
  }, [clearRecordingTimer])

  useEffect(() => {
    return () => {
      clearRecordingTimer()
    }
  }, [clearRecordingTimer])

  useEffect(() => {
    if (!isListening) {
      clearRecordingTimer()
      return
    }

    setPhase('listening')
    recordingTimerRef.current = window.setTimeout(() => {
      stop()
    }, MAX_HOME_RECORDING_MS)

    return () => {
      clearRecordingTimer()
    }
  }, [clearRecordingTimer, isListening, stop])

  useEffect(() => {
    if (phase !== 'starting' || isListening || speechError) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setPhase((current) => (current === 'starting' ? 'idle' : current))
      setFlowError('Die Spracheingabe konnte nicht gestartet werden. Bitte versuche es erneut.')
    }, 4_000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [isListening, phase, speechError])

  const activeTranscript = useMemo(() => {
    const source = textModeOpen ? textInput : spokenInput
    return source.trim()
  }, [spokenInput, textInput, textModeOpen])

  const confirmationRows = useMemo(() => {
    if (!parseResult || !selectedArea) {
      return []
    }

    return buildConfirmationRows(parseResult, selectedArea.name)
  }, [parseResult, selectedArea])

  const evaluateTranscript = useCallback(
    async (transcript: string) => {
      if (!selectedArea) {
        setFlowError('Bitte wähle zuerst eine Rasenfläche aus.')
        setPhase('draft')
        return
      }

      setPhase('processing')
      setFlowError(null)
      setFlowMessage(null)
      setParseResult(null)
      setFertilizerFlowActive(false)
      setFertilizerSummary(null)

      if (detectFixtureFertilizerPurchase(transcript)) {
        setFertilizerFlowActive(true)
        setFlowMessage(homeFertilizerClarifyMessage())
        setPhase('draft')
        return
      }

      try {
        const result = await evaluateHomeTranscript(transcript, selectedArea.name)
        setParseResult(result)
        setPhase('confirm')
      } catch (error) {
        if (isParseEndpointUnavailable(error)) {
          setFlowMessage(HOME_VOICE_PREP_MESSAGE)
          setPhase('draft')
          return
        }

        setFlowError(
          error instanceof Error
            ? error.message
            : 'Deine Eingabe konnte gerade nicht ausgewertet werden.',
        )
        setPhase('draft')
      }
    },
    [selectedArea],
  )

  useEffect(() => {
    if (phase !== 'listening' || isListening) {
      return
    }

    if (!spokenInput.trim()) {
      setPhase('idle')
      return
    }

    void evaluateTranscript(spokenInput.trim())
  }, [evaluateTranscript, isListening, phase, spokenInput])

  const isSecureContext = isSecureSpeechContext()

  const handleMicClick = () => {
    if (isListening) {
      stop()
      return
    }

    if (!canStartHomeRecording({ phase, isListening })) {
      return
    }

    const environmentBlocker = resolveSpeechEnvironmentBlocker({
      isSecureContext,
      isSupported,
    })

    if (environmentBlocker) {
      setFlowError(environmentBlocker)
      setPhase('idle')
      return
    }

    if (!selectedArea) {
      setFlowError('Bitte wähle zuerst eine Rasenfläche aus.')
      setPhase('idle')
      return
    }

    setTextModeOpen(false)
    setFlowError(null)
    setFlowMessage(null)
    setParseResult(null)
    setSpokenInput('')
    setPhase('starting')
    start()
  }

  const handleTextSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!activeTranscript) {
      return
    }

    void evaluateTranscript(activeTranscript)
  }

  const handleConfirm = async () => {
    if (!parseResult || !selectedArea || !user) {
      return
    }

    setSubmitting(true)
    setFlowError(null)

    try {
      await saveHomeParsedActivity({
        areaId: selectedArea.id,
        userId: user.id,
        result: parseResult,
      })
      setPhase('saved')
      setFlowMessage('Dein Eintrag wurde gespeichert.')
      setParseResult(null)
    } catch (error) {
      setFlowError(
        error instanceof Error ? error.message : 'Der Eintrag konnte nicht gespeichert werden.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = () => {
    if (!selectedArea) {
      return
    }

    navigate(`/area/${selectedArea.id}/new`)
  }

  const handleFertilizerClarifySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const resolved = resolveHomeFertilizerPackageAnswer(fertilizerClarifyAnswer)
    if (!resolved) {
      setFlowError('Bitte wähle eine Gebindegröße oder formuliere sie eindeutig.')
      return
    }

    const summary = buildHomeFertilizerReadySummary(fertilizerClarifyAnswer)
    if (!summary) {
      setFlowError('Die Antwort konnte nicht eindeutig zugeordnet werden.')
      return
    }

    setFlowError(null)
    setFlowMessage(null)
    setFertilizerSummary(summary)
    setPhase('confirm')
  }

  const handleOpenFertilizerCapture = () => {
    navigate(homeFertilizerCapturePath(Boolean(fertilizerSummary)))
  }

  const statusText = resolveHomeVoiceStatusText({
    phase,
    isListening,
    speechError,
    flowMessage,
  })

  const micDenied = Boolean(speechError?.includes('verweigert'))
  const environmentBlocker = resolveSpeechEnvironmentBlocker({
    isSecureContext,
    isSupported,
  })

  return (
    <section className={styles.section} aria-labelledby="home-voice-heading">
      <div className={styles.intro}>
        <h2 id="home-voice-heading" className={styles.title}>
          Was hast du heute gemacht?
        </h2>
      </div>

      <div className={styles.micWrap}>
        <button
          type="button"
          className={`${styles.micButton} ${isListening || phase === 'starting' ? styles.micButtonActive : ''}`}
          aria-pressed={isListening || phase === 'starting'}
          aria-label={
            isListening ? 'Aufnahme beenden' : phase === 'starting' ? 'Mikrofon wird gestartet' : 'Spracheingabe starten'
          }
          disabled={phase === 'processing' || submitting || !selectedArea}
          onClick={handleMicClick}
        >
          <span className={styles.micIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 14.5a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5.5a3 3 0 0 0 3 3Z"
                fill="currentColor"
              />
              <path
                d="M19 11.5a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.58A7 7 0 0 0 19 11.5Z"
                fill="currentColor"
              />
            </svg>
          </span>
        </button>

        {statusText && (
          <p className={styles.status} aria-live="polite">
            {statusText}
          </p>
        )}

        {isListening && (
          <button type="button" className={styles.stopButton} onClick={stop}>
            Aufnahme beenden
          </button>
        )}

        {environmentBlocker && (
          <p className={styles.error} role="status">
            {environmentBlocker}
          </p>
        )}

        {micDenied && (
          <p className={styles.error}>
            Der Mikrofonzugriff ist nicht erlaubt. Du kannst ihn in den Browser-Einstellungen
            freigeben.
          </p>
        )}

        {speechError && !micDenied && !isListening && phase !== 'starting' && (
          <p className={styles.hint}>{speechError}</p>
        )}
      </div>

      {!textModeOpen ? (
        <button
          type="button"
          className={styles.textToggle}
          onClick={() => {
            setTextModeOpen(true)
            setFlowError(null)
            setFlowMessage(null)
            setParseResult(null)
            setPhase('idle')
          }}
        >
          Lieber schreiben
        </button>
      ) : (
        <form className={styles.textPanel} onSubmit={handleTextSubmit}>
          <label className={styles.textLabel} htmlFor="home-text-input">
            Was hast du heute gemacht?
          </label>
          <textarea
            id="home-text-input"
            className={styles.textarea}
            value={textInput}
            placeholder="Was hast du heute gemacht?"
            onChange={(event) => setTextInput(event.target.value)}
          />

          <ul className={styles.examples} aria-label="Beispiele">
            {TEXT_EXAMPLES.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>

          <div className={styles.textActions}>
            <button
              type="submit"
              className={styles.sendButton}
              disabled={!textInput.trim() || phase === 'processing' || submitting || !selectedArea}
            >
              {phase === 'processing' ? 'Bitte warten …' : 'Dokumentieren'}
            </button>
            <button
              type="button"
              className={styles.cancelTextButton}
              onClick={() => {
                setTextModeOpen(false)
                resetFlow()
              }}
            >
              Schließen
            </button>
          </div>
        </form>
      )}

      {(phase === 'draft' || phase === 'listening') && activeTranscript && !parseResult && (
        <div className={styles.transcriptPreview} aria-live="polite">
          <p className={styles.transcriptLabel}>Deine Worte</p>
          <p className={styles.transcriptText}>
            {isListening ? appendTranscript(spokenInput, interimTranscript) : activeTranscript}
          </p>
        </div>
      )}

      {flowMessage && phase !== 'saved' && !fertilizerSummary && (
        <p className={styles.message}>{flowMessage}</p>
      )}
      {flowError && <p className={styles.error}>{flowError}</p>}

      {fertilizerFlowActive && !fertilizerSummary && (
        <form className={styles.fertilizerPanel} onSubmit={handleFertilizerClarifySubmit}>
          <label className={styles.fertilizerLabel} htmlFor="home-fertilizer-clarify">
            Deine Antwort
          </label>
          <input
            id="home-fertilizer-clarify"
            className={styles.fertilizerInput}
            value={fertilizerClarifyAnswer}
            onChange={(event) => setFertilizerClarifyAnswer(event.target.value)}
            placeholder="z. B. Der kleinere Sack"
          />
          <div className={styles.fertilizerActions}>
            <button type="submit" className={styles.sendButton} disabled={!fertilizerClarifyAnswer.trim()}>
              Weiter
            </button>
            <button type="button" className={styles.cancelTextButton} onClick={resetFlow}>
              Verwerfen
            </button>
          </div>
        </form>
      )}

      {fertilizerSummary && (
        <div className={styles.fertilizerSummaryPanel}>
          <p className={styles.fertilizerSummaryTitle}>{fertilizerSummary.productLine}</p>
          <p className={styles.fertilizerSummaryStock}>{fertilizerSummary.stockLine}</p>
          <div className={styles.fertilizerActions}>
            <button type="button" className={styles.sendButton} onClick={handleOpenFertilizerCapture}>
              Zum Bestand hinzufügen
            </button>
            <button type="button" className={styles.cancelTextButton} onClick={resetFlow}>
              Verwerfen
            </button>
          </div>
        </div>
      )}

      {phase === 'confirm' && parseResult && (
        <ActivityConfirmationPanel
          rows={confirmationRows}
          warnings={parseResult.warnings}
          submitting={submitting}
          onConfirm={() => {
            void handleConfirm()
          }}
          onEdit={handleEdit}
          onDiscard={resetFlow}
        />
      )}

      {phase === 'saved' && flowMessage && (
        <div className={styles.savedBanner}>
          <p>{flowMessage}</p>
          <button type="button" className={styles.savedDismiss} onClick={resetFlow}>
            Weiter
          </button>
        </div>
      )}
    </section>
  )
}
