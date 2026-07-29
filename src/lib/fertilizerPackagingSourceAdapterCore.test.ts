import { describe, expect, it, vi } from 'vitest'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerDeclarationNormalization'
import type {
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentSourceHint,
} from '../types/fertilizerEnrichmentOrchestration'
import { FertilizerEnrichmentOrchestrationContractError } from './fertilizerEnrichmentOrchestrationCore'
import { orchestrateFertilizerEnrichment } from './fertilizerEnrichmentOrchestrationCore'
import { buildRawFertilizerDeclarationInput } from './fertilizerSourceAdapterMergeCore'
import {
  createFertilizerPackagingSourceAdapter,
  FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
  runFertilizerPackagingSourceAdapter,
  selectPackagingSourceHint,
  type FertilizerPackagingSourceAdapterDependencies,
} from './fertilizerPackagingSourceAdapterCore'
import {
  FERTILIZER_USER_PROVIDED_SOURCE_UNEXPECTED_FAILURE_MESSAGE,
  type FertilizerUserProvidedSourceResolveResult,
} from './fertilizerUserProvidedSourceAdapterCore'
import type { FertilizerSourceAdapterContext } from './fertilizerEnrichmentOrchestrationCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const REFERENCE_ID = 'packaging-back-001'

function packagingHint(
  referenceId: string,
  overrides: Partial<FertilizerEnrichmentSourceHint> = {},
): FertilizerEnrichmentSourceHint {
  return {
    referenceId,
    adapterType: 'packaging',
    hintType: 'user',
    ...overrides,
  }
}

function buildIdentityInput(
  overrides: Partial<FertilizerEnrichmentOrchestrationInput> = {},
): FertilizerEnrichmentOrchestrationInput {
  return {
    objectCategory: 'fertilizer',
    identity: {
      manufacturer: 'ICL',
      officialName: 'Spring Start',
      productLine: 'Professional',
      variant: '15-0-26',
      identityFingerprint: 'icl-spring-start-15-0-26',
      identityConfidence: 0.95,
      hasIdentityAmbiguity: false,
    },
    allowedInputChannels: ['capture_flow'],
    userProvidedSources: [{ kind: 'packaging_back_photo', referenceId: REFERENCE_ID }],
    sourceHints: [packagingHint(REFERENCE_ID)],
    ...overrides,
  }
}

function buildPackagingText(options: {
  product?: string
  manufacturer?: string | null
  variant?: string
  npk?: string
  nitrogen?: number
  phosphate?: number
  potash?: number
  complete?: boolean
  truncated?: boolean
  includeBasis?: boolean
} = {}): string {
  const product = options.product ?? 'Spring Start'
  const variant = options.variant ?? '15-0-26'
  const npk = options.npk ?? variant
  const nitrogen = options.nitrogen ?? 15
  const phosphate = options.phosphate ?? 0
  const potash = options.potash ?? 26
  const includeBasis = options.includeBasis ?? true

  const lines: string[] = []
  if (options.manufacturer !== null) {
    lines.push(`Manufacturer: ${options.manufacturer ?? 'ICL'}`)
  }
  lines.push(
    `Product: ${product}`,
    ...(variant ? [`Product variant: ${variant}`] : []),
    'Form: Granular',
    '',
    `NPK ${npk}`,
    ...(includeBasis ? ['Declaration basis (N / P2O5 / K2O)', ''] : []),
    'Nutrient declaration (% by weight):',
    `Nitrogen (N): ${nitrogen}%`,
    `Phosphate (P2O5): ${phosphate}%`,
    `Potash (K2O): ${potash}%`,
    options.complete === false ? 'Declaration section incomplete' : 'Declaration section complete',
  )

  if (options.truncated) {
    lines.push('Document truncated')
  }

  return lines.join('\n')
}

function successResolve(
  text: string | null,
  overrides: Partial<Extract<FertilizerUserProvidedSourceResolveResult, { ok: true }>> = {},
): Extract<FertilizerUserProvidedSourceResolveResult, { ok: true }> {
  return {
    ok: true,
    referenceId: REFERENCE_ID,
    contentType: 'text/plain',
    text,
    title: 'Packaging back label',
    providedAt: FIXED_NOW,
    contentHash: 'pack-hash-1',
    mediaKind: 'text',
    ...overrides,
  }
}

function buildAdapterContext(
  input: FertilizerEnrichmentOrchestrationInput,
): FertilizerSourceAdapterContext {
  return {
    input,
    adapterType: FERTILIZER_PACKAGING_SOURCE_ADAPTER_TYPE,
    orchestrationRunId: 'orch-packaging-test',
    attempt: 1,
    successfulResults: [],
    partialResults: [],
    isCancelled: () => false,
    shouldTimeout: () => false,
  }
}

function defaultDependencies(
  resolvePackagingSource: FertilizerPackagingSourceAdapterDependencies['resolvePackagingSource'],
  overrides: Partial<FertilizerPackagingSourceAdapterDependencies> = {},
): FertilizerPackagingSourceAdapterDependencies {
  return {
    resolvePackagingSource,
    now: () => FIXED_NOW,
    ...overrides,
  }
}

describe('fertilizerPackagingSourceAdapterCore', () => {
  it('P-1: no matching packaging source yields no_match', async () => {
    const resolvePackagingSource = vi.fn(async () => successResolve(buildPackagingText()))
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput({ sourceHints: [] })),
      defaultDependencies(resolvePackagingSource),
    )

    expect(resolvePackagingSource).not.toHaveBeenCalled()
    expect(result.status).toBe('no_match')
  })

  it('P-2: raw image without text yields invalid_source without OCR', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve(null, { contentType: 'image/jpeg', mediaKind: 'image' }),
    )
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    expect(result.status).toBe('invalid_source')
    if (result.status === 'invalid_source') {
      expect(result.sourceType).toBe('packaging_image')
    }
    if (result.status === 'success' || result.status === 'partial') {
      expect(result.extraction?.extractedNpk).toBeUndefined()
    }
  })

  it('P-3: pre-extracted back label text is processed', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve(buildPackagingText({ manufacturer: null, complete: false, includeBasis: false })),
    )
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    expect(['success', 'partial']).toContain(result.status)
    if (result.status === 'success' || result.status === 'partial') {
      expect(result.extraction?.extractedNpk?.nitrogen).toBe(15)
    }
  })

  it('P-4: complete packaging declaration can yield success', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve(buildPackagingText({ complete: true, manufacturer: null })),
    )
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    expect(result.status).toBe('success')
    if (result.status === 'success') {
      expect(result.sourceCategory).toBe('packaging_evidence')
      expect(result.sourceType).toBe('packaging_label_text')
    }
  })

  it('P-5: text excerpt yields partial coverage', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve(buildPackagingText({ complete: false, includeBasis: false })),
    )
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    expect(result.status).toBe('partial')
    if (result.status === 'partial') {
      expect(result.extraction?.coverageMetadata?.nutrientSectionFullyCaptured).toBe(false)
    }
  })

  it('P-6: NPK 0-0-30 preserves zero values', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve(
        buildPackagingText({
          variant: '0-0-30',
          npk: '0-0-30',
          nitrogen: 0,
          phosphate: 0,
          potash: 30,
          complete: true,
        }),
      ),
    )
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(
        buildIdentityInput({
          identity: { ...buildIdentityInput().identity, variant: '0-0-30' },
        }),
      ),
      defaultDependencies(resolvePackagingSource),
    )

    if (result.status === 'success' || result.status === 'partial') {
      expect(result.extraction?.extractedNpk).toEqual(
        expect.objectContaining({ nitrogen: 0, phosphate: 0, potash: 30 }),
      )
    }
  })

  it('P-7: clearly different product yields no_match', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve(buildPackagingText({ product: 'Autumn Mix' })),
    )
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    expect(result.status).toBe('no_match')
  })

  it('P-8: clearly different variant yields no_match', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve(buildPackagingText({ variant: '10-10-10', npk: '10-10-10' })),
    )
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    expect(result.status).toBe('no_match')
  })

  it('P-9: missing variant yields partial', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve(
        buildPackagingText({ variant: '' }).replace('Product variant: \n', ''),
      ),
    )
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    expect(result.status).toBe('partial')
  })

  it('P-10: missing basis yields partial', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve(buildPackagingText({ complete: true, includeBasis: false })),
    )
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    expect(result.status).toBe('partial')
    if (result.status === 'partial') {
      expect(result.extraction?.extractedNpk?.declarationBasis).toBeNull()
    }
  })

  it('P-11: unreadable section does not invent values', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve('Product: Spring Start\nDeclaration section incomplete'),
    )
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    expect(result.status).toBe('partial')
    if (result.status === 'partial') {
      expect(result.extraction?.extractedNpk).toBeUndefined()
    }
  })

  it('P-12: resolver throw yields controlled failed result', async () => {
    const resolvePackagingSource = vi.fn(async () => {
      throw new Error('Sensitive resolver failure')
    })
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.technicalError.message).toBe(FERTILIZER_USER_PROVIDED_SOURCE_UNEXPECTED_FAILURE_MESSAGE)
      expect(result.technicalError.message).not.toContain('Sensitive')
    }
  })

  it('P-13: parser throw yields parser_error', async () => {
    const resolvePackagingSource = vi.fn(async () => successResolve('   '))
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.technicalError.code).toBe('parser_error')
    }
  })

  it('P-14: provenance uses packaging source type and category', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve(buildPackagingText({ complete: true, manufacturer: null })),
    )
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    if (result.status === 'success' || result.status === 'partial') {
      expect(result.sourceCategory).toBe('packaging_evidence')
      expect(result.sourceType).toBe('packaging_label_text')
      expect(result.sourceType).not.toBe('pdf_document')
      expect(result.sourceCategory).not.toBe('official_document')
    }
  })

  it('P-15: adapter does not emit numeric zero for missing nutrients', async () => {
    const resolvePackagingSource = vi.fn(async () =>
      successResolve(buildPackagingText({ complete: true })),
    )
    const adapterResult = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolvePackagingSource),
    )

    if (adapterResult.status === 'success' || adapterResult.status === 'partial') {
      const boron = adapterResult.extraction?.extractedNutrients?.find((n) => n.key === 'boron')
      expect(boron).toBeUndefined()

      const raw = buildRawFertilizerDeclarationInput(buildIdentityInput(), [adapterResult], {
        enrichmentRunId: 'enr-p15',
        extractedAt: FIXED_NOW,
      })
      const boronField = raw.nutrientMatrix?.boron
      if (boronField) {
        expect(boronField.value).not.toBe(0)
      }
    }
  })

  it('P-16: input and source hints remain immutable', async () => {
    const hints = [packagingHint(REFERENCE_ID)]
    const input = buildIdentityInput({ sourceHints: hints })
    const snapshot = structuredClone(input)

    await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(input),
      defaultDependencies(async () => successResolve(buildPackagingText({ complete: true }))),
    )

    expect(input).toEqual(snapshot)
    expect(selectPackagingSourceHint(input)?.referenceId).toBe(REFERENCE_ID)
  })

  it('P-17: orchestration compatibility with partial packaging yields needs_input', async () => {
    const adapter = createFertilizerPackagingSourceAdapter(
      defaultDependencies(async () =>
        successResolve(buildPackagingText({ complete: false, includeBasis: false })),
      ),
    )

    const result = await orchestrateFertilizerEnrichment(
      buildIdentityInput(),
      {
        adapters: [adapter],
        assessFastPath: () => ({
          decision: 'ineligible',
          profilePresent: false,
          identityMatch: false,
          variantMatch: false,
          enrichmentVersionCompatible: false,
          normalizationVersionCompatible: false,
          readinessVersionCompatible: false,
          matrixComplete: false,
          provenanceComplete: false,
          hasBlockingConflicts: false,
          staleness: 'unknown',
        }),
        now: () => FIXED_NOW,
        createOrchestrationRunId: () => 'orch-packaging',
        createNormalizationRunId: () => 'norm-packaging',
      },
      {
        normalizedAt: FIXED_NOW,
        evaluatedAt: FIXED_NOW,
        normalizationRunId: 'norm-packaging',
      },
    )

    expect(result.status).toBe('needs_input')
  })

  it('rethrows contract errors from resolver', async () => {
    const resolvePackagingSource = vi.fn(async () => {
      throw new FertilizerEnrichmentOrchestrationContractError('contract violation')
    })

    await expect(
      runFertilizerPackagingSourceAdapter(
        buildAdapterContext(buildIdentityInput()),
        defaultDependencies(resolvePackagingSource),
      ),
    ).rejects.toBeInstanceOf(FertilizerEnrichmentOrchestrationContractError)
  })

  it('factory exposes packaging adapter type', () => {
    const adapter = createFertilizerPackagingSourceAdapter(
      defaultDependencies(async () => successResolve(buildPackagingText())),
    )
    expect(adapter.adapterType).toBe('packaging')
  })

  it('user_document hint is ignored by packaging adapter', async () => {
    const resolvePackagingSource = vi.fn(async () => successResolve(buildPackagingText()))
    const result = await runFertilizerPackagingSourceAdapter(
      buildAdapterContext(
        buildIdentityInput({
          sourceHints: [{ referenceId: REFERENCE_ID, adapterType: 'user_document', hintType: 'user' }],
        }),
      ),
      defaultDependencies(resolvePackagingSource),
    )

    expect(resolvePackagingSource).not.toHaveBeenCalled()
    expect(result.status).toBe('no_match')
  })

  it('matrix keys remain controlled', () => {
    expect(FERTILIZER_NUTRIENT_MATRIX_KEYS.length).toBeGreaterThan(0)
  })
})
