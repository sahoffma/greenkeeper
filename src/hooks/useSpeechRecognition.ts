import { useCallback, useEffect, useRef, useState } from 'react'
import type { SpeechRecognitionInstance } from '../types/speech-recognition'

function getSpeechRecognitionConstructor():
  | (new () => SpeechRecognitionInstance)
  | null {
  if (typeof window === 'undefined') {
    return null
  }

  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

function mapSpeechError(errorCode: string): string {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Mikrofonzugriff wurde verweigert. Bitte erlaube den Zugriff in den Browser-Einstellungen.'
    case 'audio-capture':
      return 'Kein Mikrofon gefunden oder Mikrofon nicht verfügbar.'
    case 'no-speech':
      return 'Es wurde keine Sprache erkannt. Bitte versuche es erneut.'
    case 'network':
      return 'Spracherkennung benötigt eine Netzwerkverbindung.'
    case 'aborted':
      return 'Die Spracheingabe wurde abgebrochen.'
    default:
      return 'Die Spracheingabe ist fehlgeschlagen. Bitte versuche es erneut.'
  }
}

interface UseSpeechRecognitionOptions {
  lang?: string
  onFinalTranscript?: (transcript: string) => void
}

export function useSpeechRecognition(options: UseSpeechRecognitionOptions = {}) {
  const { lang = 'de-DE', onFinalTranscript } = options

  const onFinalTranscriptRef = useRef(onFinalTranscript)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const isListeningRef = useRef(false)

  const [isSupported] = useState(() => getSpeechRecognitionConstructor() !== null)
  const [isListening, setIsListening] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript
  }, [onFinalTranscript])

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognitionConstructor()

    if (!SpeechRecognition) {
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = lang

    recognition.onstart = () => {
      isListeningRef.current = true
      setIsListening(true)
      setError(null)
      setInterimTranscript('')
    }

    recognition.onresult = (event) => {
      let interim = ''

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = result[0]?.transcript ?? ''

        if (result.isFinal) {
          const trimmed = transcript.trim()
          if (trimmed) {
            onFinalTranscriptRef.current?.(trimmed)
          }
        } else {
          interim += transcript
        }
      }

      setInterimTranscript(interim.trim())
    }

    recognition.onerror = (event) => {
      if (event.error === 'aborted') {
        return
      }

      setError(mapSpeechError(event.error))
      isListeningRef.current = false
      setIsListening(false)
      setInterimTranscript('')
    }

    recognition.onend = () => {
      isListeningRef.current = false
      setIsListening(false)
      setInterimTranscript('')
    }

    recognitionRef.current = recognition

    return () => {
      recognition.onstart = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.abort()
      recognitionRef.current = null
      isListeningRef.current = false
    }
  }, [lang])

  const start = useCallback(() => {
    const recognition = recognitionRef.current

    if (!recognition || isListeningRef.current) {
      return
    }

    setError(null)

    try {
      recognition.start()
    } catch {
      setError('Die Spracheingabe konnte nicht gestartet werden.')
    }
  }, [])

  const stop = useCallback(() => {
    const recognition = recognitionRef.current

    if (!recognition || !isListeningRef.current) {
      return
    }

    recognition.stop()
  }, [])

  const toggle = useCallback(() => {
    if (isListeningRef.current) {
      stop()
      return
    }

    start()
  }, [start, stop])

  return {
    isSupported,
    isListening,
    interimTranscript,
    error,
    start,
    stop,
    toggle,
  }
}
