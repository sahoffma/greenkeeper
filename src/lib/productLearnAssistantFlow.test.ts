import { describe, expect, it } from 'vitest'
import {
  buildAnalyzeRequestFromCapture,
  createEmptyCaptureState,
  LEARN_SOURCE_OPTIONS,
  validateCaptureState,
} from './productLearnAssistantFlow'

describe('productLearnAssistantFlow', () => {
  it('bietet vier gleichwertige Quellenoptionen', () => {
    expect(LEARN_SOURCE_OPTIONS).toHaveLength(4)
    expect(LEARN_SOURCE_OPTIONS.map((option) => option.type)).toEqual([
      'photos',
      'manufacturer_url',
      'shop_url',
      'pdf',
    ])
  })

  it('validiert URL-Quellen', () => {
    const capture = createEmptyCaptureState('manufacturer_url')
    expect(validateCaptureState(capture)).toMatch(/Link/)

    capture.sourceUrl = 'https://example.com/product'
    expect(validateCaptureState(capture)).toBeNull()
  })

  it('baut Analyse-Requests aus der Capture-State', () => {
    const capture = createEmptyCaptureState('shop_url')
    capture.sourceUrl = 'https://shop.example.com/item'

    const request = buildAnalyzeRequestFromCapture(capture, {
      spokenProductName: 'Test Dünger',
      spokenTranscript: 'Heute Test Dünger ausgebracht',
    })

    expect(request.sourceType).toBe('shop_url')
    expect(request.sourceUrl).toBe('https://shop.example.com/item')
    expect(request.spokenProductName).toBe('Test Dünger')
  })
})
