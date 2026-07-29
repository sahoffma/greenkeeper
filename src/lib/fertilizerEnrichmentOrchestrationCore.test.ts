import { describe, expect, it, vi } from 'vitest'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerDeclarationNormalization'
import type {
  FertilizerDeclarationConflict,
  RawFertilizerDeclarationInput,
  RawFertilizerDeclarationValue,
} from '../types/fertilizerDeclarationNormalization'
import type {
  FertilizerEnrichmentFastPathAssessment,
  FertilizerEnrichmentOrchestrationInput,
  FertilizerSourceAdapterResult,
  FertilizerSourceAdapterType,
} from '../types/fertilizerEnrichmentOrchestration'
import {
  FERTILIZER_SOURCE_ADAPTER_EXECUTION_ORDER,
  FertilizerEnrichmentOrchestrationContractError,
  evaluateFertilizerAdapterRetryState,
  mapFertilizerPipelineResultToOrchestrationResult,
  orchestrateFertilizerEnrichment,
  selectFertilizerSourceAdapters,
  type FertilizerSourceAdapter,
} from './fertilizerEnrichmentOrchestrationCore'
import { evaluateRawFertilizerDeclaration } from './fertilizerNormalizationReadinessPipelineCore'
import { buildRawFertilizerDeclarationInput } from './fertilizerSourceAdapterMergeCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const FIXED_RUN_ID = 'orch-test-run'
const FIXED_NORM_ID = 'orch-test-norm'
const FIXED_EVAL = '2026-07-29T10:00:05.000Z'

function buildOrchestrationInput(
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
    ...overrides,
  }
}

function eligibleFastPathAssessment(
  overrides: Partial<FertilizerEnrichmentFastPathAssessment> = {},
): FertilizerEnrichmentFastPathAssessment {
  return {
    decision: 'eligible',
    profilePresent: true,
    identityMatch: true,
    variantMatch: true,
    enrichmentVersionCompatible: true,
    normalizationVersionCompatible: true,
    readinessVersionCompatible: true,
    matrixComplete: true,
    provenanceComplete: true,
    hasBlockingConflicts: false,
    staleness: 'current',
    ...overrides,
  }
}

function rawDeclared(value: number, overrides: Partial<RawFertilizerDeclarationValue> = {}): RawFertilizerDeclarationValue {
  return {
    status: 'declared',
    value,
    declarationBasis: overrides.declarationBasis,
    provenanceIds: overrides.provenanceIds ?? ['prov-decl'],
    ...overrides,
  }
}

function defaultBasisForKey(key: (typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number]): string {
  switch (key) {
    case 'phosphate':
      return 'P2O5'
    case 'potash':
      return 'K2O'
    case 'magnesium':
      return 'MgO'
    case 'calcium':
      return 'CaO'
    case 'sulfur':
      return 'SO3'
    case 'iron':
      return 'Fe'
    case 'manganese':
      return 'Mn'
    case 'copper':
      return 'Cu'
    case 'zinc':
      return 'Zn'
    case 'boron':
      return 'B'
    case 'molybdenum':
      return 'Mo'
    default:
      return 'N'
  }
}

function defaultValueForKey(key: (typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number]): number {
  if (key === 'nitrogen') return 15
  if (key === 'potash') return 26
  if (key === 'magnesium') return 2
  if (key === 'nitrateNitrogen') return 5
  if (key === 'ammoniumNitrogen') return 5
  if (key === 'ureaNitrogen') return 5
  return 0
}

function buildPipelineReadyRawInput(
  overrides: Partial<RawFertilizerDeclarationInput> = {},
): RawFertilizerDeclarationInput {
  const nutrientMatrix = Object.fromEntries(
    FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [
      key,
      rawDeclared(defaultValueForKey(key), {
        declarationBasis: defaultBasisForKey(key),
      }),
    ]),
  ) as RawFertilizerDeclarationInput['nutrientMatrix']

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
    productForm: { value: 'granular' },
    npk: {
      nitrogen: rawDeclared(15, { declarationBasis: 'N' }),
      phosphate: rawDeclared(0, { declarationBasis: 'P2O5' }),
      potash: rawDeclared(26, { declarationBasis: 'K2O' }),
      declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
    },
    nutrientMatrix,
    coverageMetadata: {
      sourceEvaluationStatus: 'source_fully_evaluated',
      evaluatedSourceIds: ['prov-decl'],
      productScopeConfirmed: true,
      variantMatched: true,
      nutrientSectionLocated: true,
      nutrientSectionFullyCaptured: true,
      declarationBasisResolved: true,
      hasBlockingDeclarationConflict: false,
    },
    provenanceRecords: {
      'prov-decl': {
        provenanceId: 'prov-decl',
        fieldPath: 'nutrientMatrix.nitrogen',
        sourceType: 'product_document',
        sourceCategory: 'official_document',
        sourceUrl: 'https://example.com/sheet.pdf',
        sourceTitle: 'Datasheet',
        evidence: 'N 15%',
        retrievedAt: FIXED_NOW,
        confidence: 0.95,
        isPrimary: true,
      },
    },
    sourceConflicts: [],
    enrichmentRunId: FIXED_RUN_ID,
    extractedAt: FIXED_NOW,
    ...overrides,
  }
}

function adapterResultBase(
  adapterType: FertilizerSourceAdapterType,
  overrides: Partial<Extract<FertilizerSourceAdapterResult, { status: 'success' }>> = {},
): Extract<FertilizerSourceAdapterResult, { status: 'success' }> {
  return {
    adapterType,
    status: 'success',
    sourceId: `${adapterType}-source`,
    sourceType:
      adapterType === 'manufacturer_product_document'
        ? 'pdf_document'
        : adapterType === 'supplementary_web'
          ? 'web_search'
          : adapterType === 'existing_product_profile'
            ? 'product_profile'
            : 'web_page',
    sourceCategory:
      adapterType === 'supplementary_web'
        ? 'supplementary'
        : adapterType === 'packaging'
          ? 'packaging_evidence'
          : 'official_document',
    retrievedAt: FIXED_NOW,
    extraction: {},
    ...overrides,
  }
}

function fullDocumentExtraction(): Extract<FertilizerSourceAdapterResult, { status: 'success' }>['extraction'] {
  return {
    extractedProductForm: 'granular',
    extractedNpk: {
      nitrogen: 15,
      phosphate: 0,
      potash: 26,
      declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
    },
    extractedNutrients: FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => ({
      key,
      value: defaultValueForKey(key),
      declarationBasis: defaultBasisForKey(key),
      unit: '%' as const,
    })),
    coverageMetadata: {
      fieldsCovered: ['npk', 'nutrientMatrix'],
      nutrientSectionLocated: true,
      nutrientSectionFullyCaptured: true,
      variantMatched: true,
      productScopeConfirmed: true,
    },
  }
}

function fakeAdapter(
  adapterType: FertilizerSourceAdapterType,
  result:
    | FertilizerSourceAdapterResult
    | ((
        context: { input: FertilizerEnrichmentOrchestrationInput },
      ) => FertilizerSourceAdapterResult | Promise<FertilizerSourceAdapterResult>),
): FertilizerSourceAdapter {
  return {
    adapterType,
    run: async (context) =>
      typeof result === 'function' ? result(context) : result,
  }
}

function defaultDependencies(
  overrides: Partial<Parameters<typeof orchestrateFertilizerEnrichment>[1]> = {},
): Parameters<typeof orchestrateFertilizerEnrichment>[1] {
  return {
    adapters: [],
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
    createOrchestrationRunId: () => FIXED_RUN_ID,
    createNormalizationRunId: () => FIXED_NORM_ID,
    ...overrides,
  }
}

describe('fertilizerEnrichmentOrchestrationCore', () => {
  it('O-1: fast path eligible runs pipeline only without adapter calls', async () => {
    const documentAdapter = vi.fn(async (): Promise<FertilizerSourceAdapterResult> =>
      adapterResultBase('manufacturer_product_document', { extraction: fullDocumentExtraction() }),
    )

    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        assessFastPath: () => eligibleFastPathAssessment(),
        resolveFastPathRawDeclaration: () => buildPipelineReadyRawInput(),
        adapters: [fakeAdapter('manufacturer_product_document', documentAdapter)],
      }),
      { normalizedAt: FIXED_NOW, evaluatedAt: FIXED_EVAL, normalizationRunId: FIXED_NORM_ID },
    )

    expect(documentAdapter).not.toHaveBeenCalled()
    expect(result.status).toBe('intake_ready')
    if (result.status === 'intake_ready') {
      expect(result.pipelineResult.readinessResult.status).toBe('ready')
    }
  })

  it('O-2: ineligible fast path starts normal adapter strategy', async () => {
    const calls: FertilizerSourceAdapterType[] = []
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        adapters: [
          fakeAdapter('manufacturer_product_document', () => {
            calls.push('manufacturer_product_document')
            return adapterResultBase('manufacturer_product_document', {
              extraction: fullDocumentExtraction(),
            })
          }),
        ],
      }),
      { normalizedAt: FIXED_NOW, evaluatedAt: FIXED_EVAL, normalizationRunId: FIXED_NORM_ID },
    )

    expect(calls).toEqual(['manufacturer_product_document'])
    expect(result.status).not.toBe('recognized')
  })

  it('O-3: official document source yields intake_ready', async () => {
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        adapters: [
          fakeAdapter(
            'manufacturer_product_document',
            adapterResultBase('manufacturer_product_document', {
              extraction: fullDocumentExtraction(),
            }),
          ),
        ],
      }),
      { normalizedAt: FIXED_NOW, evaluatedAt: FIXED_EVAL, normalizationRunId: FIXED_NORM_ID },
    )

    expect(result.status).toBe('intake_ready')
  })

  it('O-4: partial source yields needs_input with recommended action', async () => {
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        adapters: [
          fakeAdapter('manufacturer_product_document', {
            ...adapterResultBase('manufacturer_product_document'),
            status: 'partial',
            extraction: {
              extractedProductForm: 'unknown',
              extractedNpk: {
                nitrogen: 15,
                phosphate: 0,
                potash: 26,
                declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
              },
              coverageMetadata: {
                fieldsCovered: ['npk'],
                nutrientSectionLocated: true,
                nutrientSectionFullyCaptured: false,
                variantMatched: true,
                productScopeConfirmed: true,
              },
            },
          }),
        ],
      }),
      { normalizedAt: FIXED_NOW, evaluatedAt: FIXED_EVAL, normalizationRunId: FIXED_NORM_ID },
    )

    expect(result.status).toBe('needs_input')
    if (result.status === 'needs_input') {
      expect(result.recommendedNextAction).toBeDefined()
      expect(result.pipelineResult?.readinessResult.status).toBe('needs_input')
    }
  })

  it('O-5: one adapter technical failure does not stop subsequent adapters', async () => {
    const calls: FertilizerSourceAdapterType[] = []

    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        adapters: [
          fakeAdapter('manufacturer_product_document', {
            ...adapterResultBase('manufacturer_product_document'),
            status: 'failed',
            technicalError: {
              code: 'network_error',
              message: 'Network down',
              retryable: true,
              adapterType: 'manufacturer_product_document',
            },
            retryable: true,
          }),
          fakeAdapter('manufacturer_product_page', () => {
            calls.push('manufacturer_product_page')
            return adapterResultBase('manufacturer_product_page', {
              extraction: fullDocumentExtraction(),
            })
          }),
        ],
      }),
      { normalizedAt: FIXED_NOW, evaluatedAt: FIXED_EVAL, normalizationRunId: FIXED_NORM_ID },
    )

    expect(calls).toEqual(['manufacturer_product_page'])
    expect(result.technicalErrors).toHaveLength(1)
    expect(result.status).toBe('intake_ready')
  })

  it('O-6: all adapters technical failures yield technical_failure', async () => {
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        adapters: [
          fakeAdapter('manufacturer_product_document', {
            ...adapterResultBase('manufacturer_product_document'),
            status: 'failed',
            technicalError: {
              code: 'network_error',
              message: 'Network down',
              retryable: true,
              adapterType: 'manufacturer_product_document',
            },
            retryable: true,
          }),
        ],
      }),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.failureReason).toBe('technical_failure')
    }
  })

  it('O-7: no registered adapters yields no_viable_source', async () => {
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({ adapters: [] }),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.failureReason).toBe('no_viable_source')
    }
  })

  it('O-8: identical official values merge without conflict', () => {
    const input = buildOrchestrationInput()
    const results: FertilizerSourceAdapterResult[] = [
      adapterResultBase('manufacturer_product_document', {
        sourceId: 'doc-a',
        extraction: {
          extractedNpk: { nitrogen: 15, phosphate: 0, potash: 26, declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' } },
        },
      }),
      adapterResultBase('manufacturer_product_page', {
        sourceId: 'page-b',
        extraction: {
          extractedNpk: { nitrogen: 15, phosphate: 0, potash: 26, declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' } },
        },
      }),
    ]

    const raw = buildRawFertilizerDeclarationInput(input, results, {
      enrichmentRunId: FIXED_RUN_ID,
      extractedAt: FIXED_NOW,
    })

    expect(raw.sourceConflicts).toHaveLength(0)
    expect(raw.npk.nitrogen?.provenanceIds).toEqual(expect.arrayContaining(['doc-a', 'page-b']))
  })

  it('O-9: diverging official values create structured conflict', () => {
    const input = buildOrchestrationInput()
    const raw = buildRawFertilizerDeclarationInput(
      input,
      [
        adapterResultBase('manufacturer_product_document', {
          sourceId: 'doc-a',
          extraction: { extractedNpk: { nitrogen: 15, phosphate: 0, potash: 26 } },
        }),
        adapterResultBase('manufacturer_product_page', {
          sourceId: 'page-b',
          extraction: { extractedNpk: { nitrogen: 16, phosphate: 0, potash: 26 } },
        }),
      ],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    expect(raw.sourceConflicts.some((conflict: FertilizerDeclarationConflict) => conflict.type === 'npk_conflict')).toBe(true)
  })

  it('O-10: supplementary web value does not overwrite manufacturer value', () => {
    const raw = buildRawFertilizerDeclarationInput(
      buildOrchestrationInput(),
      [
        adapterResultBase('manufacturer_product_document', {
          sourceId: 'doc-a',
          sourceCategory: 'official_document',
          extraction: { extractedNpk: { nitrogen: 15, phosphate: 0, potash: 26 } },
        }),
        adapterResultBase('supplementary_web', {
          sourceId: 'web-b',
          sourceCategory: 'supplementary',
          extraction: { extractedNpk: { nitrogen: 20, phosphate: 0, potash: 26 } },
        }),
      ],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    expect(raw.npk.nitrogen?.value).toBe(15)
    expect(raw.sourceConflicts.length).toBeGreaterThan(0)
  })

  it('O-11: variant mismatch creates variant conflict', () => {
    const raw = buildRawFertilizerDeclarationInput(
      buildOrchestrationInput(),
      [
        adapterResultBase('manufacturer_product_document', {
          productVariantReference: '20-0-30',
          extraction: fullDocumentExtraction(),
        }),
      ],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    expect(raw.sourceConflicts.some((conflict) => conflict.type === 'variant_conflict')).toBe(true)
  })

  it('O-12: different declaration bases remain unresolved without conversion', async () => {
    const raw = buildRawFertilizerDeclarationInput(
      buildOrchestrationInput(),
      [
        adapterResultBase('manufacturer_product_document', {
          sourceId: 'doc-a',
          extraction: {
            extractedNutrients: [{ key: 'iron', value: 1, declarationBasis: 'Fe', unit: '%' }],
            coverageMetadata: {
              fieldsCovered: ['nutrientMatrix.iron'],
              nutrientSectionLocated: true,
              nutrientSectionFullyCaptured: true,
              variantMatched: true,
              productScopeConfirmed: true,
            },
          },
        }),
        adapterResultBase('manufacturer_product_page', {
          sourceId: 'page-b',
          extraction: {
            extractedNutrients: [{ key: 'iron', value: 1, declarationBasis: 'Fe2O3', unit: '%' }],
          },
        }),
      ],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    const result = evaluateRawFertilizerDeclaration(raw, {
      normalizedAt: FIXED_NOW,
      normalizationRunId: FIXED_NORM_ID,
      evaluatedAt: FIXED_EVAL,
    })

    expect(result.readinessResult.status).not.toBe('ready')
    expect(raw.nutrientMatrix.iron?.declarationBasis).toBe('Fe')
  })

  it('O-13: orchestration merge does not invent zero values; normalizer applies DL-014 zero', () => {
    const rawFromMerge = buildRawFertilizerDeclarationInput(
      buildOrchestrationInput(),
      [
        adapterResultBase('manufacturer_product_document', {
          extraction: {
            extractedNpk: { nitrogen: 15, phosphate: 0, potash: 26 },
            coverageMetadata: {
              fieldsCovered: ['npk'],
              nutrientSectionLocated: true,
              nutrientSectionFullyCaptured: false,
              variantMatched: true,
              productScopeConfirmed: true,
            },
          },
        }),
      ],
      { enrichmentRunId: FIXED_RUN_ID, extractedAt: FIXED_NOW },
    )

    expect(rawFromMerge.nutrientMatrix.iron?.status).toBe('not_extracted')
    expect(rawFromMerge.nutrientMatrix.iron?.value).toBeUndefined()

    const allNotDeclaredMatrix = Object.fromEntries(
      FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [
        key,
        { status: 'not_declared' as const, provenanceIds: ['doc-a'], declarationBasis: defaultBasisForKey(key) },
      ]),
    ) as RawFertilizerDeclarationInput['nutrientMatrix']

    const pipelineResult = evaluateRawFertilizerDeclaration(
      buildPipelineReadyRawInput({ nutrientMatrix: allNotDeclaredMatrix }),
      {
        normalizedAt: FIXED_NOW,
        normalizationRunId: FIXED_NORM_ID,
        evaluatedAt: FIXED_EVAL,
      },
    )

    expect(pipelineResult.normalizationResult.enrichmentResult.nutrientMatrix.iron?.normalization).toBe(
      'dl014_zero',
    )
  })

  it('O-14: readiness not_ready maps to failed domain_not_ready', () => {
    const pipelineResult = evaluateRawFertilizerDeclaration(
      buildPipelineReadyRawInput({
        identity: {
          ...buildPipelineReadyRawInput().identity,
          identityNotActionable: true,
        },
      }),
      {
        normalizedAt: FIXED_NOW,
        normalizationRunId: FIXED_NORM_ID,
        evaluatedAt: FIXED_EVAL,
      },
    )

    const mapped = mapFertilizerPipelineResultToOrchestrationResult(
      {
        orchestrationRunId: FIXED_RUN_ID,
        startedAt: FIXED_NOW,
        attemptedAdapters: [],
        successfulAdapters: [],
        failedAdapters: [],
        timeoutState: {
          kind: 'none',
          startedAt: FIXED_NOW,
          timedOut: false,
          timedOutAdapters: [],
          completedAdapters: [],
          cancelledAdapters: [],
        },
        technicalErrors: [],
      },
      pipelineResult,
      buildPipelineReadyRawInput(),
    )

    expect(mapped.status).toBe('failed')
    if (mapped.status === 'failed' && mapped.failureReason === 'domain_not_ready') {
      expect(mapped.readinessResult.status).toBe('not_ready')
    }
  })

  it('O-15: pipeline failure maps to pipeline_failure', async () => {
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        adapters: [
          fakeAdapter(
            'manufacturer_product_document',
            adapterResultBase('manufacturer_product_document', {
              extraction: fullDocumentExtraction(),
            }),
          ),
        ],
        evaluatePipeline: () => {
          throw new Error('Pipeline exploded')
        },
      }),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.failureReason).toBe('pipeline_failure')
    }
  })

  it('O-16: wrong object category throws contract error before adapters', async () => {
    await expect(
      orchestrateFertilizerEnrichment(
        buildOrchestrationInput({ objectCategory: 'tool' as 'fertilizer' }),
        defaultDependencies({
          adapters: [
            fakeAdapter('manufacturer_product_document', adapterResultBase('manufacturer_product_document')),
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(FertilizerEnrichmentOrchestrationContractError)
  })

  it('O-17: timeout with sufficient partial data evaluates pipeline outcome', async () => {
    let timeoutChecks = 0
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        shouldTimeout: () => {
          timeoutChecks += 1
          return timeoutChecks > 1
        },
        adapters: [
          fakeAdapter(
            'manufacturer_product_document',
            adapterResultBase('manufacturer_product_document', {
              extraction: fullDocumentExtraction(),
            }),
          ),
          fakeAdapter(
            'manufacturer_product_page',
            adapterResultBase('manufacturer_product_page', { extraction: fullDocumentExtraction() }),
          ),
        ],
      }),
      { normalizedAt: FIXED_NOW, evaluatedAt: FIXED_EVAL, normalizationRunId: FIXED_NORM_ID },
    )

    expect(result.timeoutState.timedOut).toBe(true)
    expect(['intake_ready', 'needs_input', 'failed']).toContain(result.status)
  })

  it('O-18: timeout without sufficient data yields timed_out', async () => {
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        shouldTimeout: () => true,
        adapters: [
          fakeAdapter('manufacturer_product_document', {
            ...adapterResultBase('manufacturer_product_document'),
            status: 'no_match',
          }),
        ],
      }),
    )

    expect(result.status).toBe('timed_out')
    if (result.status === 'timed_out') {
      expect(result.timeoutState.timedOut).toBe(true)
      expect(result.pipelineResult).toBeUndefined()
    }
  })

  it('O-19: retryable adapter errors set retryable retry state without executing retry', async () => {
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        retryAttempt: 1,
        maxRetryAttempts: 3,
        adapters: [
          fakeAdapter('manufacturer_product_document', {
            ...adapterResultBase('manufacturer_product_document'),
            status: 'failed',
            technicalError: {
              code: 'network_error',
              message: 'Temporary',
              retryable: true,
              adapterType: 'manufacturer_product_document',
            },
            retryable: true,
          }),
        ],
      }),
    )

    expect(result.retryState?.retryable).toBe(true)
    expect(result.attemptedAdapters).toEqual(['manufacturer_product_document'])
  })

  it('O-20: exhausted retry marks retryExhausted', () => {
    const retryState = evaluateFertilizerAdapterRetryState(
      [
        {
          code: 'network_error',
          message: 'Temporary',
          retryable: true,
          adapterType: 'manufacturer_product_document',
        },
      ],
      { attempt: 3, maxAttempts: 3 },
    )

    expect(retryState.retryExhausted).toBe(true)
    expect(retryState.retryable).toBe(false)
  })

  it('O-21: no_match is not retryable', () => {
    const retryState = evaluateFertilizerAdapterRetryState([], { attempt: 1, maxAttempts: 3 })
    expect(retryState.retryable).toBe(false)
  })

  it('O-22: cancellation stops before adapters and returns cancelled', async () => {
    const adapterSpy = vi.fn()
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        isCancelled: () => true,
        adapters: [fakeAdapter('manufacturer_product_document', adapterSpy)],
      }),
    )

    expect(adapterSpy).not.toHaveBeenCalled()
    expect(result.status).toBe('cancelled')
  })

  it('O-23: adapter execution follows documented order regardless of registry order', async () => {
    const calls: FertilizerSourceAdapterType[] = []
    await orchestrateFertilizerEnrichment(
      buildOrchestrationInput({
        userProvidedSources: [{ kind: 'product_document', referenceId: 'upload-1' }],
      }),
      defaultDependencies({
        adapters: [
          fakeAdapter('supplementary_web', () => {
            calls.push('supplementary_web')
            return adapterResultBase('supplementary_web')
          }),
          fakeAdapter('manufacturer_product_page', () => {
            calls.push('manufacturer_product_page')
            return adapterResultBase('manufacturer_product_page')
          }),
          fakeAdapter('user_document', () => {
            calls.push('user_document')
            return adapterResultBase('user_document')
          }),
          fakeAdapter('manufacturer_product_document', () => {
            calls.push('manufacturer_product_document')
            return adapterResultBase('manufacturer_product_document', {
              extraction: fullDocumentExtraction(),
            })
          }),
        ],
      }),
      { normalizedAt: FIXED_NOW, evaluatedAt: FIXED_EVAL, normalizationRunId: FIXED_NORM_ID },
    )

    expect(calls).toEqual([
      'manufacturer_product_document',
      'manufacturer_product_page',
      'user_document',
      'supplementary_web',
    ])
  })

  it('O-24: orchestration input remains immutable', async () => {
    const input = buildOrchestrationInput()
    const snapshot = structuredClone(input)

    await orchestrateFertilizerEnrichment(
      input,
      defaultDependencies({
        adapters: [
          fakeAdapter(
            'manufacturer_product_document',
            adapterResultBase('manufacturer_product_document', {
              extraction: fullDocumentExtraction(),
            }),
          ),
        ],
      }),
      { normalizedAt: FIXED_NOW, evaluatedAt: FIXED_EVAL, normalizationRunId: FIXED_NORM_ID },
    )

    expect(input).toEqual(snapshot)
  })

  it('O-25: orchestration uses injected pipeline without side effects', async () => {
    const evaluatePipeline = vi.fn(() =>
      evaluateRawFertilizerDeclaration(buildPipelineReadyRawInput(), {
        normalizedAt: FIXED_NOW,
        normalizationRunId: FIXED_NORM_ID,
        evaluatedAt: FIXED_EVAL,
      }),
    )

    await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        evaluatePipeline,
        adapters: [
          fakeAdapter(
            'manufacturer_product_document',
            adapterResultBase('manufacturer_product_document', {
              extraction: fullDocumentExtraction(),
            }),
          ),
        ],
      }),
    )

    expect(evaluatePipeline).toHaveBeenCalledTimes(1)
  })

  it('selectFertilizerSourceAdapters respects user source requirements', () => {
    const selected = selectFertilizerSourceAdapters(buildOrchestrationInput(), [
      'packaging',
      'manufacturer_product_document',
    ])

    expect(selected).toEqual(['manufacturer_product_document'])
    expect(FERTILIZER_SOURCE_ADAPTER_EXECUTION_ORDER).toEqual([
      'existing_product_profile',
      'manufacturer_product_document',
      'manufacturer_product_page',
      'manufacturer_catalog',
      'packaging',
      'user_document',
      'supplementary_web',
    ])
  })

  it('E-1: synchronous adapter throw is captured and later adapter can still yield intake_ready', async () => {
    const documentAdapter = vi.fn(() => {
      throw new Error('sync adapter failure')
    })

    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        adapters: [
          fakeAdapter('manufacturer_product_document', documentAdapter),
          fakeAdapter(
            'manufacturer_product_page',
            adapterResultBase('manufacturer_product_page', {
              extraction: fullDocumentExtraction(),
            }),
          ),
        ],
      }),
      { normalizedAt: FIXED_NOW, evaluatedAt: FIXED_EVAL, normalizationRunId: FIXED_NORM_ID },
    )

    expect(documentAdapter).toHaveBeenCalledTimes(1)
    expect(result.status).toBe('intake_ready')
    expect(result.technicalErrors).toHaveLength(1)
    expect(result.technicalErrors[0]?.code).toBe('unknown_adapter_error')
    expect(result.technicalErrors[0]?.adapterType).toBe('manufacturer_product_document')
    expect(result.failedAdapters).toContain('manufacturer_product_document')
    expect(result.successfulAdapters).toContain('manufacturer_product_page')
  })

  it('E-2: rejected adapter promise is captured and next adapter continues', async () => {
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        adapters: [
          fakeAdapter('manufacturer_product_document', async () => {
            throw new Error('rejected adapter')
          }),
          fakeAdapter('manufacturer_product_page', {
            ...adapterResultBase('manufacturer_product_page'),
            status: 'partial',
            extraction: {
              extractedNpk: {
                nitrogen: 15,
                phosphate: 0,
                potash: 26,
                declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
              },
            },
          }),
        ],
      }),
      { normalizedAt: FIXED_NOW, evaluatedAt: FIXED_EVAL, normalizationRunId: FIXED_NORM_ID },
    )

    expect(result.technicalErrors).toHaveLength(1)
    expect(result.technicalErrors[0]?.code).toBe('unknown_adapter_error')
    expect(result.attemptedAdapters).toEqual([
      'manufacturer_product_document',
      'manufacturer_product_page',
    ])
    expect(['needs_input', 'intake_ready', 'failed']).toContain(result.status)
    if (result.status === 'needs_input') {
      expect(result.recommendedNextAction).toBeDefined()
    }
  })

  it('E-3: all adapters throwing yields technical_failure without not_ready', async () => {
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        adapters: [
          fakeAdapter('manufacturer_product_document', () => {
            throw new Error('first failure')
          }),
          fakeAdapter('manufacturer_product_page', () => {
            throw new Error('second failure')
          }),
        ],
      }),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.failureReason).toBe('technical_failure')
      if (result.failureReason === 'technical_failure') {
        expect('readinessResult' in result).toBe(false)
        expect('pipelineResult' in result).toBe(false)
      }
    }
    expect(result.attemptedAdapters).toEqual([
      'manufacturer_product_document',
      'manufacturer_product_page',
    ])
    expect(result.technicalErrors).toHaveLength(2)
  })

  it('E-4: sensitive adapter throw details are not exposed in orchestration result', async () => {
    const sensitiveError = new Error('password=secret-token api_key=abc123')
    Object.assign(sensitiveError, {
      stack: 'Error: password=secret-token\n    at sensitive.js:99:1',
      response: { body: 'confidential document excerpt' },
    })

    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        adapters: [
          fakeAdapter('manufacturer_product_document', () => {
            throw sensitiveError
          }),
        ],
      }),
    )

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('password=secret-token')
    expect(serialized).not.toContain('api_key=abc123')
    expect(serialized).not.toContain('confidential document excerpt')
    expect(serialized).not.toContain('sensitive.js')
    expect(result.technicalErrors[0]?.message).toBe(
      'Injected fertilizer source adapter failed unexpectedly.',
    )
  })

  it('E-5: assessFastPath throw yields technical_failure at fast_path_assessment', async () => {
    const adapterSpy = vi.fn(async () =>
      adapterResultBase('manufacturer_product_document', { extraction: fullDocumentExtraction() }),
    )

    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        assessFastPath: () => {
          throw new Error('assessment exploded')
        },
        adapters: [fakeAdapter('manufacturer_product_document', adapterSpy)],
      }),
    )

    expect(adapterSpy).not.toHaveBeenCalled()
    expect(result.status).toBe('failed')
    if (result.status === 'failed' && result.failureReason === 'technical_failure') {
      expect(result.affectedStep).toBe('fast_path_assessment')
      expect(result.technicalError.code).toBe('unknown_adapter_error')
      expect(result.technicalError.message).toBe(
        'Injected fertilizer enrichment orchestration dependency failed unexpectedly.',
      )
      expect('readinessResult' in result).toBe(false)
      expect('pipelineResult' in result).toBe(false)
    }
  })

  it('E-6: resolveFastPathRawDeclaration throw yields technical_failure at fast_path_resolution', async () => {
    const adapterSpy = vi.fn(async () =>
      adapterResultBase('manufacturer_product_document', { extraction: fullDocumentExtraction() }),
    )

    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        assessFastPath: () => eligibleFastPathAssessment(),
        resolveFastPathRawDeclaration: () => {
          throw new Error('resolver exploded')
        },
        adapters: [fakeAdapter('manufacturer_product_document', adapterSpy)],
      }),
    )

    expect(adapterSpy).not.toHaveBeenCalled()
    expect(result.status).toBe('failed')
    if (result.status === 'failed' && result.failureReason === 'technical_failure') {
      expect(result.affectedStep).toBe('fast_path_resolution')
      expect('pipelineResult' in result).toBe(false)
    }
  })

  it('E-7: pipeline throw remains pipeline_failure and is not reclassified as technical_failure', async () => {
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        adapters: [
          fakeAdapter(
            'manufacturer_product_document',
            adapterResultBase('manufacturer_product_document', {
              extraction: fullDocumentExtraction(),
            }),
          ),
        ],
        evaluatePipeline: () => {
          throw new Error('Pipeline exploded')
        },
      }),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.failureReason).toBe('pipeline_failure')
      if (result.failureReason === 'pipeline_failure') {
        expect('affectedStep' in result).toBe(false)
      }
    }
  })

  it('E-8: contract error from assessFastPath is rethrown unchanged', async () => {
    await expect(
      orchestrateFertilizerEnrichment(
        buildOrchestrationInput(),
        defaultDependencies({
          assessFastPath: () => {
            throw new FertilizerEnrichmentOrchestrationContractError('machine')
          },
          adapters: [
            fakeAdapter('manufacturer_product_document', adapterResultBase('manufacturer_product_document')),
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(FertilizerEnrichmentOrchestrationContractError)
  })

  it('E-9: unknown_adapter_error uses retryable false and does not execute retry', async () => {
    const result = await orchestrateFertilizerEnrichment(
      buildOrchestrationInput(),
      defaultDependencies({
        retryAttempt: 1,
        maxRetryAttempts: 3,
        adapters: [
          fakeAdapter('manufacturer_product_document', () => {
            throw new Error('unexpected')
          }),
        ],
      }),
    )

    expect(result.retryState?.retryable).toBe(false)
    expect(result.retryState?.retryExhausted).toBe(false)
    expect(result.technicalErrors[0]?.retryable).toBe(false)
    expect(result.attemptedAdapters).toEqual(['manufacturer_product_document'])
  })

  it('E-10: input and prior adapter results remain immutable when adapter throws', async () => {
    const input = buildOrchestrationInput()
    const inputSnapshot = structuredClone(input)
    const stablePartial: Extract<FertilizerSourceAdapterResult, { status: 'partial' }> = {
      ...adapterResultBase('manufacturer_product_page'),
      status: 'partial',
      extraction: {
        extractedNpk: {
          nitrogen: 15,
          phosphate: 0,
          potash: 26,
          declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
        },
      },
    }
    const partialSnapshot = structuredClone(stablePartial)

    await orchestrateFertilizerEnrichment(
      input,
      defaultDependencies({
        adapters: [
          fakeAdapter('manufacturer_product_document', () => {
            throw new Error('boom')
          }),
          fakeAdapter('manufacturer_product_page', stablePartial),
        ],
      }),
      { normalizedAt: FIXED_NOW, evaluatedAt: FIXED_EVAL, normalizationRunId: FIXED_NORM_ID },
    )

    expect(input).toEqual(inputSnapshot)
    expect(stablePartial).toEqual(partialSnapshot)
  })
})
