import { describe, expect, it } from 'vitest'
import {
  PRODUCT_RECOGNIZE_CLIENT_DEFAULT_TIMEOUT_MS,
} from './productRecognizeClient'
import { RECOGNITION_CLIENT_TIMEOUT_MS } from './fertilizerRecognitionCore'

describe('recognition client timeout constants', () => {
  it('verwendet 90 Sekunden für den Recognition-Request', () => {
    expect(RECOGNITION_CLIENT_TIMEOUT_MS).toBe(90_000)
    expect(PRODUCT_RECOGNIZE_CLIENT_DEFAULT_TIMEOUT_MS).toBe(90_000)
  })
})
