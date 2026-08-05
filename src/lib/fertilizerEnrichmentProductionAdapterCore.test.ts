import { describe, expect, it } from 'vitest'
import { createFertilizerEnrichmentProductionAdapterDependencies } from './fertilizerEnrichmentProductionAdapterCore'
import { CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID } from './fertilizerCaptureRecognitionPackagingCore'

describe('fertilizerEnrichmentProductionAdapterCore', () => {
  it('resolves packaging from inline capture text without storage', async () => {
    const deps = createFertilizerEnrichmentProductionAdapterDependencies()
    const input = {
      objectCategory: 'fertilizer' as const,
      identity: {
        manufacturer: 'Hersteller X',
        officialName: 'Universal NPK',
        productLine: null,
        variant: null,
        identityFingerprint: 'fp-1',
        identityConfidence: 1,
        hasIdentityAmbiguity: false,
      },
      allowedInputChannels: ['capture_flow' as const],
      captureInlineSourceTexts: {
        [CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID]:
          'Manufacturer: Hersteller X\nProduct: Universal NPK\nNPK 10-5-20',
      },
    }

    const result = await deps.resolvePackagingSource!(
      {
        referenceId: CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID,
        adapterType: 'packaging',
        hintType: 'recognition',
      },
      {
        input,
        orchestrationRunId: 'run-1',
        attempt: 1,
      },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.text).toContain('Universal NPK')
    }
  })

  it('registers manufacturer fetch for external URLs without storage', async () => {
    const deps = createFertilizerEnrichmentProductionAdapterDependencies()
    expect(deps.fetchManufacturerDocument).toBeTypeOf('function')
  })
})
