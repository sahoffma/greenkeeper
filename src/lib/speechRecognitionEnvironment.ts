export const SPEECH_INSECURE_CONTEXT_MESSAGE =
  'Spracheingabe funktioniert nur über HTTPS oder localhost. Für Tests am Mobilgerät öffne die App über https://… oder http://localhost:5173.'

export const SPEECH_UNSUPPORTED_BROWSER_MESSAGE =
  'Spracheingabe wird in diesem Browser nicht unterstützt. Du kannst unten schreiben.'

export function isSecureSpeechContext(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.isSecureContext
}

export function resolveSpeechEnvironmentBlocker(input: {
  isSecureContext: boolean
  isSupported: boolean
}): string | null {
  if (!input.isSecureContext) {
    return SPEECH_INSECURE_CONTEXT_MESSAGE
  }

  if (!input.isSupported) {
    return SPEECH_UNSUPPORTED_BROWSER_MESSAGE
  }

  return null
}
