import { FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION } from '../types/fertilizerEnrichment'
import {
  FERTILIZER_NUTRIENT_MATRIX_KEYS,
  type RawFertilizerDeclarationInput,
  type RawFertilizerDeclarationValue,
} from '../types/fertilizerDeclarationNormalization'
import type {
  FertilizerEnrichmentIntakeReadyResult,
  FertilizerEnrichmentPipelineReadyResult,
  FertilizerReadinessReadyResult,
} from '../types/fertilizerEnrichmentOrchestration'
import { evaluateRawFertilizerDeclaration } from './fertilizerNormalizationReadinessPipelineCore'

export const PHASE5_FIXED_NOW = '2026-07-31T10:00:00.000Z'
export const PHASE5_SESSION_ID = 'session-phase5-test'
export const PHASE5_SESSION_HASH = '0123456789abcdef'.repeat(4)

export function rawDeclared(
  value: number,
  overrides: Partial<RawFertilizerDeclarationValue> = {},
): RawFertilizerDeclarationValue {
  return {
    status: 'declared',
    value,
    declarationBasis: overrides.declarationBasis,
    provenanceIds: overrides.provenanceIds ?? ['prov-decl'],
    ...overrides,
  }
}

export function rawNotDeclared(
  overrides: Partial<RawFertilizerDeclarationValue> = {},
): RawFertilizerDeclarationValue {
  return {
    status: 'not_declared',
    provenanceIds: overrides.provenanceIds ?? ['prov-decl'],
    declarationBasis: overrides.declarationBasis,
    ...overrides,
  }
}

export function defaultBasisForKey(key: (typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number]): string {
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

export function defaultValueForKey(key: (typeof FERTILIZER_NUTRIENT_MATRIX_KEYS)[number]): number {
  if (key === 'nitrogen') return 15
  if (key === 'potash') return 26
  if (key === 'magnesium') return 2
  if (key === 'nitrateNitrogen') return 5
  if (key === 'ammoniumNitrogen') return 5
  if (key === 'ureaNitrogen') return 5
  return 0
}

export function buildPhase5RawInput(
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
        retrievedAt: '2026-07-29T10:00:00.000Z',
        confidence: 0.95,
        isPrimary: true,
      },
    },
    sourceConflicts: [],
    enrichmentRunId: 'enrich-run-1',
    extractedAt: '2026-07-29T11:00:00.000Z',
    ...overrides,
  }
}

export function buildPhase5PipelineReadyResult(
  overrides: Partial<RawFertilizerDeclarationInput> = {},
): FertilizerEnrichmentPipelineReadyResult {
  const pipeline = evaluateRawFertilizerDeclaration(buildPhase5RawInput(overrides))

  if (pipeline.readinessResult.status !== 'ready') {
    throw new Error(`Expected ready pipeline, got ${pipeline.readinessResult.status}`)
  }

  return {
    normalizationResult: pipeline.normalizationResult,
    readinessInput: pipeline.readinessInput,
    readinessResult: pipeline.readinessResult as FertilizerReadinessReadyResult,
  }
}

export function buildPhase5IntakeReadyResult(
  overrides: Partial<RawFertilizerDeclarationInput> = {},
): FertilizerEnrichmentIntakeReadyResult {
  const pipelineResult = buildPhase5PipelineReadyResult(overrides)

  return {
    status: 'intake_ready',
    orchestrationRunId: 'orch-run-phase5',
    startedAt: PHASE5_FIXED_NOW,
    completedAt: PHASE5_FIXED_NOW,
    attemptedAdapters: ['manufacturer_product_document'],
    successfulAdapters: ['manufacturer_product_document'],
    failedAdapters: [],
    timeoutState: {
      kind: 'none',
      startedAt: PHASE5_FIXED_NOW,
      deadlineAt: PHASE5_FIXED_NOW,
      timedOut: false,
      timedOutAdapters: [],
      completedAdapters: ['manufacturer_product_document'],
      cancelledAdapters: [],
    },
    technicalErrors: [],
    pipelineResult,
  }
}

export function deriveTestSessionAccessHash(sessionId: string): string {
  if (sessionId === PHASE5_SESSION_ID) {
    return PHASE5_SESSION_HASH
  }

  return 'fedcba9876543210'.repeat(4)
}

export function withNpk(
  nitrogen: number,
  phosphate: number,
  potash: number,
): Partial<RawFertilizerDeclarationInput> {
  const nutrientMatrix = Object.fromEntries(
    FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => {
      if (key === 'nitrogen') {
        return [key, rawDeclared(nitrogen, { declarationBasis: 'N' })]
      }
      if (key === 'phosphate') {
        return [key, rawDeclared(phosphate, { declarationBasis: 'P2O5' })]
      }
      if (key === 'potash') {
        return [key, rawDeclared(potash, { declarationBasis: 'K2O' })]
      }

      return [key, rawDeclared(defaultValueForKey(key), { declarationBasis: defaultBasisForKey(key) })]
    }),
  ) as RawFertilizerDeclarationInput['nutrientMatrix']

  return {
    npk: {
      nitrogen: rawDeclared(nitrogen, { declarationBasis: 'N' }),
      phosphate: rawDeclared(phosphate, { declarationBasis: 'P2O5' }),
      potash: rawDeclared(potash, { declarationBasis: 'K2O' }),
      declarationBasis: { nitrogen: 'N', phosphate: 'P2O5', potash: 'K2O' },
    },
    nutrientMatrix,
  }
}

export function assertNoSensitiveLeakage(value: string): void {
  const forbidden = [
    PHASE5_SESSION_ID,
    PHASE5_SESSION_HASH,
    'Authorization',
    'service_role',
    'gk-storage:v1/',
    'canonical',
    'stack',
    '23505',
    'SAVED_PRODUCT_PROFILE',
  ]

  for (const token of forbidden) {
    if (value.includes(token)) {
      throw new Error(`Sensitive leakage detected: ${token}`)
    }
  }
}

export { FERTILIZER_ENRICHMENT_SPECIFICATION_VERSION }
