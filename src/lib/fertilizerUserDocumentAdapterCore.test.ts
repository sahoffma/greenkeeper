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
  createFertilizerUserDocumentAdapter,
  FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
  runFertilizerUserDocumentAdapter,
  selectUserDocumentSourceHint,
  type FertilizerUserDocumentAdapterDependencies,
} from './fertilizerUserDocumentAdapterCore'
import { FertilizerDeclarationTextParserError } from './fertilizerDeclarationTextParserCore'
import {
  FERTILIZER_USER_PROVIDED_SOURCE_UNEXPECTED_FAILURE_MESSAGE,
  type FertilizerUserProvidedSourceResolveResult,
} from './fertilizerUserProvidedSourceAdapterCore'
import type { FertilizerSourceAdapterContext } from './fertilizerEnrichmentOrchestrationCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const REFERENCE_ID = 'upload-doc-001'

function userDocumentHint(
  referenceId: string,
  overrides: Partial<FertilizerEnrichmentSourceHint> = {},
): FertilizerEnrichmentSourceHint {
  return {
    referenceId,
    adapterType: 'user_document',
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
    userProvidedSources: [{ kind: 'product_document', referenceId: REFERENCE_ID }],
    sourceHints: [userDocumentHint(REFERENCE_ID)],
    ...overrides,
  }
}

function buildFullDocumentText(options: {
  product?: string
  manufacturer?: string
  variant?: string
  npk?: string
  nitrogen?: number
  phosphate?: number
  potash?: number
  magnesium?: number
  complete?: boolean
  truncated?: boolean
  includeNpk?: boolean
  includeBasis?: boolean
  fullMatrix?: boolean
  omitBoron?: boolean
} = {}): string {
  const product = options.product ?? 'Spring Start'
  const manufacturer = options.manufacturer ?? 'ICL'
  const variant = options.variant ?? '15-0-26'
  const npk = options.npk ?? variant
  const nitrogen = options.nitrogen ?? 15
  const phosphate = options.phosphate ?? 0
  const potash = options.potash ?? 26
  const magnesium = options.magnesium ?? 2
  const includeNpk = options.includeNpk ?? true
  const includeBasis = options.includeBasis ?? true

  const lines = [
    `Manufacturer: ${manufacturer}`,
    `Product: ${product}`,
    ...(variant ? [`Product variant: ${variant}`] : []),
    'Form: Granular',
    '',
    ...(includeNpk ? [`NPK ${npk}`, ...(includeBasis ? ['Declaration basis (N / P2O5 / K2O)'] : []), ''] : []),
    'Nutrient declaration (% by weight):',
    `Nitrogen (N): ${nitrogen}%`,
    `Phosphate (P2O5): ${phosphate}%`,
    `Potash (K2O): ${potash}%`,
    `Magnesium (MgO): ${magnesium}%`,
    'Nitrate nitrogen: 5%',
    'Ammonium nitrogen: 5%',
    'Urea nitrogen: 5%',
    'Organic nitrogen: 0%',
  ]

  if (options.fullMatrix) {
    lines.push(
      'Calcium (CaO): 0%',
      'Sulfur (SO3): 0%',
      'Iron (Fe): 0%',
      'Manganese (Mn): 0%',
      'Copper (Cu): 0%',
      'Zinc (Zn): 0%',
      ...(options.omitBoron ? [] : ['Boron (B): 0%']),
      'Molybdenum (Mo): 0%',
    )
  }

  lines.push(options.complete === false ? 'Declaration section incomplete' : 'Declaration section complete')
  if (options.truncated) {
    lines.push('Document truncated')
  }

  return lines.join('\n')
}

function successResolve(
  text: string,
  overrides: Partial<Extract<FertilizerUserProvidedSourceResolveResult, { ok: true }>> = {},
): Extract<FertilizerUserProvidedSourceResolveResult, { ok: true }> {
  return {
    ok: true,
    referenceId: REFERENCE_ID,
    contentType: 'text/plain',
    text,
    title: 'User product datasheet',
    providedAt: FIXED_NOW,
    contentHash: 'hash-1',
    mediaKind: 'text',
    ...overrides,
  }
}

function buildAdapterContext(
  input: FertilizerEnrichmentOrchestrationInput,
): FertilizerSourceAdapterContext {
  return {
    input,
    adapterType: FERTILIZER_USER_DOCUMENT_ADAPTER_TYPE,
    orchestrationRunId: 'orch-user-doc-test',
    attempt: 1,
    successfulResults: [],
    partialResults: [],
    isCancelled: () => false,
    shouldTimeout: () => false,
  }
}

function defaultDependencies(
  resolveUserDocumentSource: FertilizerUserDocumentAdapterDependencies['resolveUserDocumentSource'],
  overrides: Partial<FertilizerUserDocumentAdapterDependencies> = {},
): FertilizerUserDocumentAdapterDependencies {
  return {
    resolveUserDocumentSource,
    now: () => FIXED_NOW,
    ...overrides,
  }
}

describe('fertilizerUserDocumentAdapterCore', () => {
  it('U-1: no matching source yields no_match without resolver call', async () => {
    const resolveUserDocumentSource = vi.fn(async () => successResolve(buildFullDocumentText()))
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput({ sourceHints: [] })),
      defaultDependencies(resolveUserDocumentSource),
    )

    expect(resolveUserDocumentSource).not.toHaveBeenCalled()
    expect(result.status).toBe('no_match')
  })

  it('U-2: differently classified user source hint is ignored', async () => {
    const resolveUserDocumentSource = vi.fn(async () => successResolve(buildFullDocumentText()))
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(
        buildIdentityInput({
          sourceHints: [{ referenceId: REFERENCE_ID, adapterType: 'packaging', hintType: 'user' }],
        }),
      ),
      defaultDependencies(resolveUserDocumentSource),
    )

    expect(resolveUserDocumentSource).not.toHaveBeenCalled()
    expect(result.status).toBe('no_match')
  })

  it('U-3: PDF with extractable text via injected extractor', async () => {
    const extractDocumentText = vi.fn(async () => buildFullDocumentText({ complete: true }))
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve('', {
        contentType: 'application/pdf',
        text: null,
        mediaKind: 'pdf',
      }),
    )

    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource, { extractDocumentText }),
    )

    expect(extractDocumentText).toHaveBeenCalledOnce()
    expect(['success', 'partial']).toContain(result.status)
    if (result.status === 'success' || result.status === 'partial') {
      expect(result.sourceType).toBe('pdf_document')
    }
  })

  it('U-4: plain text document uses text_document source type', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve(buildFullDocumentText({ complete: true })),
    )
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )

    expect(result.sourceType).toBe('text_document')
    expect(['success', 'partial']).toContain(result.status)
  })

  it('U-5: unsupported document type yields invalid_source without parsing', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve(buildFullDocumentText(), {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        mediaKind: 'unsupported',
      }),
    )

    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )

    expect(result.status).toBe('invalid_source')
    if (result.status === 'invalid_source') {
      expect(result.retryable).toBe(false)
    }
  })

  it('U-6: complete declaration yields success with provenance and no invented zeros', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve(buildFullDocumentText({ complete: true, fullMatrix: true, omitBoron: true })),
    )
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )

    expect(result.status).toBe('success')
    if (result.status === 'success' || result.status === 'partial') {
      expect(result.sourceCategory).toBe('user_provided')
      expect(result.adapterType).toBe('user_document')
      expect(result.extraction?.extractedNpk?.nitrogen).toBe(15)
      expect(result.extraction?.extractedNutrients?.find((n) => n.key === 'boron')).toBeUndefined()
      expect(result.extraction?.evidence?.every((e) => e.evidenceId.startsWith(result.sourceId))).toBe(true)
    }
  })

  it('U-7: partial declaration yields partial with missing fields not extracted', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve(buildFullDocumentText({ complete: false, includeBasis: false })),
    )
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )

    expect(result.status).toBe('partial')
    if (result.status === 'partial') {
      expect(result.extraction?.coverageMetadata?.nutrientSectionFullyCaptured).toBe(false)
    }
  })

  it('U-8: NPK 0-0-30 preserves zero values', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve(
        buildFullDocumentText({
          variant: '0-0-30',
          npk: '0-0-30',
          nitrogen: 0,
          phosphate: 0,
          potash: 30,
          complete: true,
        }),
      ),
    )
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(
        buildIdentityInput({
          identity: {
            ...buildIdentityInput().identity,
            variant: '0-0-30',
          },
        }),
      ),
      defaultDependencies(resolveUserDocumentSource),
    )

    if (result.status === 'success' || result.status === 'partial') {
      expect(result.extraction?.extractedNpk).toEqual(
        expect.objectContaining({ nitrogen: 0, phosphate: 0, potash: 30 }),
      )
    }
  })

  it('U-9: clearly different product yields no_match', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve(buildFullDocumentText({ product: 'Winter Feed' })),
    )
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )

    expect(result.status).toBe('no_match')
  })

  it('U-10: clearly different variant yields no_match', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve(buildFullDocumentText({ variant: '20-5-10', npk: '20-5-10' })),
    )
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )

    expect(result.status).toBe('no_match')
  })

  it('U-11: missing variant yields partial', async () => {
    const text = buildFullDocumentText({
      variant: '',
      includeNpk: false,
      complete: false,
    }).replace('Product variant: ', '')
    const resolveUserDocumentSource = vi.fn(async () => successResolve(text))
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )

    expect(result.status).toBe('partial')
  })

  it('U-12: missing basis yields partial without conversion', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve(buildFullDocumentText({ complete: true, includeBasis: false })),
    )
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )

    expect(result.status).toBe('partial')
    if (result.status === 'partial') {
      expect(result.extraction?.extractedNpk?.declarationBasis).toBeNull()
    }
  })

  it('U-13: extractor throw yields controlled failed result', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve('', { contentType: 'application/pdf', text: null, mediaKind: 'pdf' }),
    )
    const extractDocumentText = vi.fn(async () => {
      throw new Error('Sensitive PDF extraction failure')
    })

    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource, { extractDocumentText }),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.technicalError.message).toBe(FERTILIZER_USER_PROVIDED_SOURCE_UNEXPECTED_FAILURE_MESSAGE)
      expect(result.technicalError.message).not.toContain('Sensitive')
    }
  })

  it('U-14: parser throw yields parser_error', async () => {
    const resolveUserDocumentSource = vi.fn(async () => successResolve('   '))
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.technicalError.code).toBe('parser_error')
    }
  })

  it('U-15: provenance includes source and evidence references for extracted fields', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve(buildFullDocumentText({ complete: true })),
    )
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )

    if (result.status === 'success' || result.status === 'partial') {
      expect(result.sourceRef).toBe(REFERENCE_ID)
      expect(result.extraction?.evidence?.length).toBeGreaterThan(0)
      expect(result.extraction?.evidence?.[0]?.excerpt.length).toBeLessThanOrEqual(120)
    }
  })

  it('U-16: adapter does not emit numeric zero for missing nutrients; phase 2 may normalize', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve(buildFullDocumentText({ complete: true, fullMatrix: true, omitBoron: true })),
    )
    const adapterResult = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )

    if (adapterResult.status === 'success' || adapterResult.status === 'partial') {
      const boron = adapterResult.extraction?.extractedNutrients?.find((n) => n.key === 'boron')
      expect(boron).toBeUndefined()

      const raw = buildRawFertilizerDeclarationInput(buildIdentityInput(), [adapterResult], {
        enrichmentRunId: 'enr-u16',
        extractedAt: FIXED_NOW,
      })
      const boronField = raw.nutrientMatrix?.boron
      if (boronField) {
        expect(boronField.value).not.toBe(0)
      }
    }
  })

  it('U-17: input and source hints remain immutable', async () => {
    const hints = [userDocumentHint(REFERENCE_ID)]
    const input = buildIdentityInput({ sourceHints: hints })
    const snapshot = structuredClone(input)

    await runFertilizerUserDocumentAdapter(
      buildAdapterContext(input),
      defaultDependencies(async () => successResolve(buildFullDocumentText({ complete: true }))),
    )

    expect(input).toEqual(snapshot)
    expect(selectUserDocumentSourceHint(input)?.referenceId).toBe(REFERENCE_ID)
  })

  it('U-18: orchestration compatibility with complete user document can yield intake_ready', async () => {
    const adapter = createFertilizerUserDocumentAdapter(
      defaultDependencies(async () =>
        successResolve(buildFullDocumentText({ complete: true, fullMatrix: true })),
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
        createOrchestrationRunId: () => 'orch-user-doc',
        createNormalizationRunId: () => 'norm-user-doc',
      },
      {
        normalizedAt: FIXED_NOW,
        evaluatedAt: FIXED_NOW,
        normalizationRunId: 'norm-user-doc',
      },
    )

    expect(result.status).toBe('intake_ready')
  })

  it('rethrows contract errors from resolver', async () => {
    const resolveUserDocumentSource = vi.fn(async () => {
      throw new FertilizerEnrichmentOrchestrationContractError('contract violation')
    })

    await expect(
      runFertilizerUserDocumentAdapter(
        buildAdapterContext(buildIdentityInput()),
        defaultDependencies(resolveUserDocumentSource),
      ),
    ).rejects.toBeInstanceOf(FertilizerEnrichmentOrchestrationContractError)
  })

  it('factory exposes user_document adapter type', () => {
    const adapter = createFertilizerUserDocumentAdapter(
      defaultDependencies(async () => successResolve(buildFullDocumentText())),
    )
    expect(adapter.adapterType).toBe('user_document')
  })

  it('image-only user document is invalid_source', async () => {
    const resolveUserDocumentSource = vi.fn(async () =>
      successResolve('', { contentType: 'image/jpeg', mediaKind: 'image' }),
    )
    const result = await runFertilizerUserDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(resolveUserDocumentSource),
    )
    expect(result.status).toBe('invalid_source')
  })

  it('parser error class is recognized', () => {
    expect(new FertilizerDeclarationTextParserError()).toBeInstanceOf(Error)
  })

  it('matrix keys remain controlled', () => {
    expect(FERTILIZER_NUTRIENT_MATRIX_KEYS.length).toBeGreaterThan(0)
  })
})
