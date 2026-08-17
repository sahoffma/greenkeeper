import type { HomeVoicePhase } from './homeVoiceFlow'

export function canStartHomeRecording(input: {
  phase: HomeVoicePhase
  isListening: boolean
}): boolean {
  if (input.isListening) {
    return false
  }

  return input.phase !== 'starting' && input.phase !== 'processing'
}

export function resolveHomeVoiceStatusText(input: {
  phase: HomeVoicePhase
  isListening: boolean
  speechError: string | null
  flowMessage: string | null
}): string | null {
  if (input.phase === 'starting') {
    return 'Mikrofon wird gestartet …'
  }

  if (input.phase === 'processing') {
    return 'Greenkeeper liest deine Worte …'
  }

  if (input.phase === 'listening' || input.isListening) {
    return 'Ich höre zu …'
  }

  if (input.speechError?.includes('verweigert')) {
    return input.speechError
  }

  if (input.phase === 'saved') {
    return input.flowMessage
  }

  return null
}

export function shouldNavigateOnMicStart(): boolean {
  return false
}
