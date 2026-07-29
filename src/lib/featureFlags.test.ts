import { describe, expect, it, vi } from 'vitest'
import { isProductRecognitionEnabled } from './featureFlags'

describe('featureFlags', () => {
  it('1 — Feature-Flag deaktiviert: Erkennung aus', () => {
    vi.stubEnv('VITE_PRODUCT_RECOGNITION_ENABLED', 'false')
    expect(isProductRecognitionEnabled()).toBe(false)
    vi.unstubAllEnvs()
  })

  it('2 — Feature-Flag aktiviert: Erkennung verfügbar', () => {
    vi.stubEnv('VITE_PRODUCT_RECOGNITION_ENABLED', 'true')
    expect(isProductRecognitionEnabled()).toBe(true)
    vi.unstubAllEnvs()
  })
})
