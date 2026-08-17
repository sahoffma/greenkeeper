import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canStartHomeRecording,
  resolveHomeVoiceStatusText,
  shouldNavigateOnMicStart,
} from './homeVoiceInteraction'

describe('HomeScreen voice-only contract', () => {
  it('does not render a Düngung erfassen home action', () => {
    const source = readFileSync('src/pages/HomeScreen.tsx', 'utf8')

    expect(source).not.toContain('Düngung erfassen')
    expect(source).not.toContain('fertilizerHomeApplicationPath')
    expect(source.indexOf('<HomeAreaSelector')).toBeLessThan(source.indexOf('<HomeVoiceSection'))
  })

  it('uses HomeVoiceSection for the home voice entry', () => {
    const source = readFileSync('src/pages/HomeScreen.tsx', 'utf8')

    expect(source).toContain('HomeVoiceSection')
  })

  it('preserves the home greeting header', () => {
    const source = readFileSync('src/pages/HomeScreen.tsx', 'utf8')

    expect(source).toContain('HomeGreetingSection')
    expect(source).toContain('homeHeader')
  })

  it('preserves the account menu and pinned area selector', () => {
    const source = readFileSync('src/pages/HomeScreen.tsx', 'utf8')

    expect(source).toContain('HomeAccountMenu')
    expect(source).toContain('HomeAreaSelector')
    expect(source).not.toContain('LawnCarouselSection')
    expect(source).not.toContain('HeroSection')
  })
})

describe('canStartHomeRecording', () => {
  it('blocks parallel starts while listening', () => {
    expect(canStartHomeRecording({ phase: 'idle', isListening: true })).toBe(false)
  })

  it('blocks while the microphone is starting', () => {
    expect(canStartHomeRecording({ phase: 'starting', isListening: false })).toBe(false)
  })

  it('blocks while processing', () => {
    expect(canStartHomeRecording({ phase: 'processing', isListening: false })).toBe(false)
  })

  it('allows a restart from idle', () => {
    expect(canStartHomeRecording({ phase: 'idle', isListening: false })).toBe(true)
  })
})

describe('resolveHomeVoiceStatusText', () => {
  it('shows a starting status immediately after tap', () => {
    expect(
      resolveHomeVoiceStatusText({
        phase: 'starting',
        isListening: false,
        speechError: null,
        flowMessage: null,
      }),
    ).toBe('Mikrofon wird gestartet …')
  })

  it('shows an active listening status', () => {
    expect(
      resolveHomeVoiceStatusText({
        phase: 'listening',
        isListening: true,
        speechError: null,
        flowMessage: null,
      }),
    ).toBe('Ich höre zu …')
  })

  it('surfaces permission errors visibly', () => {
    expect(
      resolveHomeVoiceStatusText({
        phase: 'idle',
        isListening: false,
        speechError: 'Mikrofonzugriff wurde verweigert.',
        flowMessage: null,
      }),
    ).toBe('Mikrofonzugriff wurde verweigert.')
  })
})

describe('shouldNavigateOnMicStart', () => {
  it('never navigates on microphone start alone', () => {
    expect(shouldNavigateOnMicStart()).toBe(false)
  })
})
