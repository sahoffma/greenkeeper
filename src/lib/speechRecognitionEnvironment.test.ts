import { describe, expect, it } from 'vitest'
import {
  resolveSpeechEnvironmentBlocker,
  SPEECH_INSECURE_CONTEXT_MESSAGE,
  SPEECH_UNSUPPORTED_BROWSER_MESSAGE,
} from './speechRecognitionEnvironment'

describe('resolveSpeechEnvironmentBlocker', () => {
  it('blocks insecure local network contexts', () => {
    expect(
      resolveSpeechEnvironmentBlocker({
        isSecureContext: false,
        isSupported: true,
      }),
    ).toBe(SPEECH_INSECURE_CONTEXT_MESSAGE)
  })

  it('blocks unsupported browsers', () => {
    expect(
      resolveSpeechEnvironmentBlocker({
        isSecureContext: true,
        isSupported: false,
      }),
    ).toBe(SPEECH_UNSUPPORTED_BROWSER_MESSAGE)
  })

  it('allows secure supported browsers', () => {
    expect(
      resolveSpeechEnvironmentBlocker({
        isSecureContext: true,
        isSupported: true,
      }),
    ).toBeNull()
  })
})
