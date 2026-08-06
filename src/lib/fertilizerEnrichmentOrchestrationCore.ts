import type { RawFertilizerDeclarationInput } from '../types/fertilizerDeclarationNormalization'
import type {
  FertilizerEnrichmentSourceCategory,
} from '../types/fertilizerEnrichment'
import {
  FERTILIZER_READINESS_CONTRACT_ERROR_CODE,
  type FertilizerSuggestedInputAction,
} from '../types/fertilizerReadiness'
import type {
  FertilizerEnrichmentCancellationReason,
  FertilizerEnrichmentFastPathAssessment,
  FertilizerEnrichmentOrchestrationInput,
  FertilizerEnrichmentOrchestrationResult,
  FertilizerEnrichmentOrchestrationResultBase,
  FertilizerEnrichmentPipelineResult,
  FertilizerEnrichmentRetryState,
  FertilizerEnrichmentTimeoutState,
  FertilizerSourceAdapterResult,
  FertilizerSourceAdapterSourceType,
  FertilizerSourceAdapterTechnicalError,
  FertilizerSourceAdapterType,
} from '../types/fertilizerEnrichmentOrchestration'
import {
  FertilizerDeclarationNormalizationContractError,
} from './fertilizerDeclarationNormalizerCore'
import {
  FertilizerReadinessContractError,
} from './fertilizerReadinessCore'
import {
  evaluateRawFertilizerDeclaration,
  type EvaluateRawFertilizerDeclarationOptions,
  type FertilizerNormalizationReadinessPipelineResult,
} from './fertilizerNormalizationReadinessPipelineCore'
import {
  buildRawFertilizerDeclarationInput,
  hasSufficientStructuredDataForPipeline,
  isFastPathEligible,
} from './fertilizerSourceAdapterMergeCore'
import { CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID } from './fertilizerCaptureRecognitionPackagingCore'
import { buildFertilizerCaptureNutrientPipelineDiagnostics } from './fertilizerCaptureNutrientPipelineDiagnosticsCore'
import { readManufacturerResearchDiagnostics } from './fertilizerManufacturerResearchDiagnosticsCore'

export const FERTILIZER_SOURCE_ADAPTER_EXECUTION_ORDER: readonly FertilizerSourceAdapterType[] = [
  'existing_product_profile',
  'manufacturer_product_document',
  'manufacturer_product_page',
  'manufacturer_catalog',
  'packaging',
  'user_document',
  'supplementary_web',
]

export class FertilizerEnrichmentOrchestrationContractError extends Error {
  readonly code = FERTILIZER_READINESS_CONTRACT_ERROR_CODE

  readonly receivedObjectCategory: string

  constructor(receivedObjectCategory: string) {
    super(
      `Fertilizer enrichment orchestration does not support object category "${receivedObjectCategory}".`,
    )
    this.name = 'FertilizerEnrichmentOrchestrationContractError'
    this.receivedObjectCategory = receivedObjectCategory
  }
}

export interface FertilizerSourceAdapterContext {
  input: FertilizerEnrichmentOrchestrationInput
  adapterType: FertilizerSourceAdapterType
  orchestrationRunId: string
  attempt: number
  successfulResults: FertilizerSourceAdapterResult[]
  partialResults: FertilizerSourceAdapterResult[]
  isCancelled: () => boolean
  shouldTimeout: () => boolean
}

export interface FertilizerSourceAdapter {
  adapterType: FertilizerSourceAdapterType
  run: (context: FertilizerSourceAdapterContext) => Promise<FertilizerSourceAdapterResult>
}

export interface OrchestrateFertilizerEnrichmentDependencies {
  adapters: FertilizerSourceAdapter[]
  assessFastPath: (
    input: FertilizerEnrichmentOrchestrationInput,
  ) => FertilizerEnrichmentFastPathAssessment
  resolveFastPathRawDeclaration?: (
    input: FertilizerEnrichmentOrchestrationInput,
    assessment: FertilizerEnrichmentFastPathAssessment,
  ) => RawFertilizerDeclarationInput | null
  evaluatePipeline?: (
    input: RawFertilizerDeclarationInput,
    options?: EvaluateRawFertilizerDeclarationOptions,
  ) => FertilizerNormalizationReadinessPipelineResult
  now?: () => string
  createOrchestrationRunId?: () => string
  createNormalizationRunId?: () => string
  isCancelled?: () => boolean
  shouldTimeout?: () => boolean
  maxRetryAttempts?: number
  retryAttempt?: number
  cancellationReason?: FertilizerEnrichmentCancellationReason
}

export interface OrchestrateFertilizerEnrichmentOptions {
  orchestrationRunId?: string
  normalizedAt?: string
  evaluatedAt?: string
  normalizationRunId?: string
  enrichmentRunId?: string
}

const USER_SOURCE_ADAPTER_TYPES = new Set<FertilizerSourceAdapterType>(['packaging', 'user_document'])

export const UNEXPECTED_ADAPTER_FAILURE_MESSAGE =
  'Injected fertilizer source adapter failed unexpectedly.'

export const UNEXPECTED_ORCHESTRATION_DEPENDENCY_FAILURE_MESSAGE =
  'Injected fertilizer enrichment orchestration dependency failed unexpectedly.'

export function isFertilizerContractError(
  error: unknown,
): error is
  | FertilizerEnrichmentOrchestrationContractError
  | FertilizerReadinessContractError
  | FertilizerDeclarationNormalizationContractError {
  return (
    error instanceof FertilizerEnrichmentOrchestrationContractError ||
    error instanceof FertilizerReadinessContractError ||
    error instanceof FertilizerDeclarationNormalizationContractError
  )
}

export function rethrowIfContractError(error: unknown): void {
  if (isFertilizerContractError(error)) {
    throw error
  }
}

export function createUnexpectedAdapterTechnicalError(
  adapterType: FertilizerSourceAdapterType,
): FertilizerSourceAdapterTechnicalError {
  return {
    code: 'unknown_adapter_error',
    message: UNEXPECTED_ADAPTER_FAILURE_MESSAGE,
    retryable: false,
    adapterType,
  }
}

export function createUnexpectedOrchestrationTechnicalError(
  adapterType: FertilizerSourceAdapterType = 'existing_product_profile',
): FertilizerSourceAdapterTechnicalError {
  return {
    code: 'unknown_adapter_error',
    message: UNEXPECTED_ORCHESTRATION_DEPENDENCY_FAILURE_MESSAGE,
    retryable: false,
    adapterType,
  }
}

function defaultAdapterSourceMetadata(adapterType: FertilizerSourceAdapterType): {
  sourceType: FertilizerSourceAdapterSourceType
  sourceCategory: FertilizerEnrichmentSourceCategory
} {
  switch (adapterType) {
    case 'existing_product_profile':
      return { sourceType: 'product_profile', sourceCategory: 'official_manufacturer' }
    case 'manufacturer_product_document':
      return { sourceType: 'pdf_document', sourceCategory: 'official_document' }
    case 'manufacturer_product_page':
      return { sourceType: 'web_page', sourceCategory: 'official_document' }
    case 'manufacturer_catalog':
      return { sourceType: 'catalog_entry', sourceCategory: 'official_catalog' }
    case 'packaging':
      return { sourceType: 'packaging_image', sourceCategory: 'packaging_evidence' }
    case 'user_document':
      return { sourceType: 'user_upload', sourceCategory: 'user_provided' }
    case 'supplementary_web':
      return { sourceType: 'web_search', sourceCategory: 'supplementary' }
  }
}

function createUnexpectedAdapterFailureResult(
  adapterType: FertilizerSourceAdapterType,
  retrievedAt: string,
): Extract<FertilizerSourceAdapterResult, { status: 'failed' }> {
  const { sourceType, sourceCategory } = defaultAdapterSourceMetadata(adapterType)

  return {
    adapterType,
    status: 'failed',
    sourceId: `${adapterType}-unexpected-failure`,
    sourceType,
    sourceCategory,
    retrievedAt,
    technicalError: createUnexpectedAdapterTechnicalError(adapterType),
    retryable: false,
  }
}

async function runAdapterSafely(
  adapter: FertilizerSourceAdapter,
  context: FertilizerSourceAdapterContext,
  now: () => string,
): Promise<FertilizerSourceAdapterResult> {
  try {
    return await adapter.run(context)
  } catch (error) {
    rethrowIfContractError(error)
    return createUnexpectedAdapterFailureResult(context.adapterType, now())
  }
}

function defaultNow(): string {
  return new Date().toISOString()
}

function createEmptyTimeoutState(startedAt: string): FertilizerEnrichmentTimeoutState {
  return {
    kind: 'none',
    startedAt,
    timedOut: false,
    timedOutAdapters: [],
    completedAdapters: [],
    cancelledAdapters: [],
  }
}

function isUserSourceAdapterAllowed(
  input: FertilizerEnrichmentOrchestrationInput,
  adapterType: FertilizerSourceAdapterType,
): boolean {
  if (!USER_SOURCE_ADAPTER_TYPES.has(adapterType)) {
    return true
  }

  const sources = input.userProvidedSources ?? []
  if (adapterType === 'packaging') {
    return sources.some(
      (source) =>
        source.kind === 'packaging_back_photo' ||
        source.kind === 'additional_packaging_photo',
    )
  }

  return sources.some((source) => source.kind === 'product_document' || source.kind === 'other_user_source')
}

export function selectFertilizerSourceAdapters(
  input: FertilizerEnrichmentOrchestrationInput,
  registeredAdapterTypes: FertilizerSourceAdapterType[],
): FertilizerSourceAdapterType[] {
  const registered = new Set(registeredAdapterTypes)

  return FERTILIZER_SOURCE_ADAPTER_EXECUTION_ORDER.filter((adapterType) => {
    if (!registered.has(adapterType)) {
      return false
    }
    return isUserSourceAdapterAllowed(input, adapterType)
  })
}

export function evaluateFertilizerAdapterRetryState(
  technicalErrors: FertilizerSourceAdapterTechnicalError[],
  options: { attempt: number; maxAttempts: number },
): FertilizerEnrichmentRetryState {
  const retryableErrors = technicalErrors.filter((error) => error.retryable)
  const retryable = retryableErrors.length > 0 && options.attempt < options.maxAttempts

  return {
    attempt: options.attempt,
    maxAttempts: options.maxAttempts,
    retryable,
    lastErrorCode: retryableErrors[retryableErrors.length - 1]?.code ?? null,
    nextRetryAt: null,
    retryExhausted: !retryable && retryableErrors.length > 0,
  }
}

function collectTechnicalError(result: FertilizerSourceAdapterResult): FertilizerSourceAdapterTechnicalError | null {
  if (result.status === 'failed' || result.status === 'unavailable') {
    return result.technicalError
  }
  return null
}

function isSuccessfulAdapterResult(result: FertilizerSourceAdapterResult): boolean {
  return result.status === 'success' || result.status === 'partial'
}

function isFailedAdapterResult(result: FertilizerSourceAdapterResult): boolean {
  return result.status === 'failed' || result.status === 'unavailable' || result.status === 'invalid_source'
}

function attachResearchDiagnostics(
  base: FertilizerEnrichmentOrchestrationResultBase,
  input: FertilizerEnrichmentOrchestrationInput,
): FertilizerEnrichmentOrchestrationResultBase {
  return {
    ...base,
    manufacturerResearchDiagnostics:
      readManufacturerResearchDiagnostics(input) ?? base.manufacturerResearchDiagnostics ?? null,
  }
}

function resolveRecommendedNextAction(
  suggestedActions: FertilizerSuggestedInputAction[],
  researchDiagnostics: ReturnType<typeof readManufacturerResearchDiagnostics>,
): FertilizerSuggestedInputAction {
  const filtered = suggestedActions.filter((action) => action !== 'upload_back_photo')
  if (filtered.length > 0) {
    return filtered[0]
  }

  if (researchDiagnostics?.fallbackRecommendation === 'provide_document') {
    return 'provide_product_document'
  }

  if (researchDiagnostics?.fallbackRecommendation === 'optional_back_photo') {
    return 'optionally_upload_back_photo'
  }

  return suggestedActions[0] ?? 'provide_product_document'
}

function attachNutrientPipelineDiagnostics(
  base: FertilizerEnrichmentOrchestrationResultBase,
  context: {
    input: FertilizerEnrichmentOrchestrationInput
    adapterResults: FertilizerSourceAdapterResult[]
    rawDeclarationInput?: RawFertilizerDeclarationInput | null
    pipelineResult?: FertilizerEnrichmentPipelineResult | null
  },
): FertilizerEnrichmentOrchestrationResultBase {
  return {
    ...base,
    nutrientPipelineDiagnostics: buildFertilizerCaptureNutrientPipelineDiagnostics({
      visionAnalysis: context.input.captureRecognitionPackagingBasis?.npk
        ? {
            nitrogen: context.input.captureRecognitionPackagingBasis.npk.nitrogen,
            phosphate: context.input.captureRecognitionPackagingBasis.npk.phosphate,
            potash: context.input.captureRecognitionPackagingBasis.npk.potash,
          }
        : null,
      packagingDeclarationText:
        context.input.captureInlineSourceTexts?.[CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID] ??
        null,
      adapterResults: context.adapterResults,
      rawDeclarationInput: context.rawDeclarationInput ?? null,
      normalizedNutrientMatrix:
        context.pipelineResult?.normalizationResult.enrichmentResult.nutrientMatrix ?? null,
    }),
  }
}

export function mapFertilizerPipelineResultToOrchestrationResult(
  base: FertilizerEnrichmentOrchestrationResultBase,
  pipelineResult: FertilizerEnrichmentPipelineResult,
  rawDeclarationInput: RawFertilizerDeclarationInput,
): FertilizerEnrichmentOrchestrationResult {
  if (pipelineResult.readinessResult.status === 'ready') {
    return {
      ...base,
      status: 'intake_ready',
      pipelineResult: {
        ...pipelineResult,
        readinessResult: {
          ...pipelineResult.readinessResult,
          status: 'ready',
        },
      },
      rawDeclarationInput,
    }
  }

  if (pipelineResult.readinessResult.status === 'needs_input') {
    const suggestedActions = pipelineResult.readinessResult.suggestedInputActions
    const recommendedNextAction = resolveRecommendedNextAction(
      suggestedActions,
      base.manufacturerResearchDiagnostics ?? null,
    )
    const alternativeNextActions = suggestedActions.filter(
      (action) => action !== recommendedNextAction,
    )

    return {
      ...base,
      status: 'needs_input',
      recommendedNextAction,
      alternativeNextActions,
      pipelineResult,
      rawDeclarationInput,
    }
  }

  return {
    ...base,
    status: 'failed',
    failureReason: 'domain_not_ready',
    readinessResult: {
      ...pipelineResult.readinessResult,
      status: 'not_ready',
    },
    normalizationResult: pipelineResult.normalizationResult,
    readinessInput: pipelineResult.readinessInput,
    rawDeclarationInput,
  }
}

function buildPipelineFailureResult(
  base: FertilizerEnrichmentOrchestrationResultBase,
  error: unknown,
  rawDeclarationInput: RawFertilizerDeclarationInput | null,
  partialAdapterResults: FertilizerSourceAdapterResult[],
): FertilizerEnrichmentOrchestrationResult {
  rethrowIfContractError(error)

  return {
    ...base,
    status: 'failed',
    failureReason: 'pipeline_failure',
    technicalError: {
      code: 'unknown_adapter_error',
      message: error instanceof Error ? error.message : 'Pipeline execution failed',
      retryable: false,
      adapterType: 'existing_product_profile',
      metadata: { scope: 'pipeline' },
    },
    pipelineStep: 'unknown',
    rawDeclarationInput,
    partialAdapterResults,
  }
}

function buildTechnicalFailureResult(
  base: FertilizerEnrichmentOrchestrationResultBase,
  technicalError: FertilizerSourceAdapterTechnicalError,
  partialAdapterResults: FertilizerSourceAdapterResult[],
  rawDeclarationInput: RawFertilizerDeclarationInput | null,
  affectedStep = 'adapter_execution',
): FertilizerEnrichmentOrchestrationResult {
  return {
    ...base,
    status: 'failed',
    failureReason: 'technical_failure',
    technicalError,
    affectedStep,
    affectedAdapter: technicalError.adapterType,
    partialAdapterResults,
    partialRawDeclarationInput: rawDeclarationInput,
  }
}

function buildNoViableSourceResult(
  base: FertilizerEnrichmentOrchestrationResultBase,
  attemptedResults: FertilizerSourceAdapterResult[],
): FertilizerEnrichmentOrchestrationResult {
  const attemptSummaries = attemptedResults.map((result) => ({
    adapterType: result.adapterType,
    sourceId: result.sourceId,
    status: result.status,
    unavailabilityReason:
      result.status === 'no_match'
        ? ('no_match' as const)
        : result.status === 'invalid_source'
          ? ('invalid_source' as const)
          : result.status === 'failed' || result.status === 'unavailable'
            ? ('adapter_failed' as const)
            : ('not_applicable' as const),
  }))

  return {
    ...base,
    status: 'failed',
    failureReason: 'no_viable_source',
    attemptedAdapters: attemptSummaries,
    recommendedNextAction: 'provide_product_document',
  } as FertilizerEnrichmentOrchestrationResult
}

function buildTimedOutResult(
  base: FertilizerEnrichmentOrchestrationResultBase,
  timeoutState: FertilizerEnrichmentTimeoutState,
  rawDeclarationInput: RawFertilizerDeclarationInput | null,
  partialAdapterResults: FertilizerSourceAdapterResult[],
  pipelineResult?: FertilizerEnrichmentPipelineResult | null,
): FertilizerEnrichmentOrchestrationResult {
  if (pipelineResult) {
    const mapped = mapFertilizerPipelineResultToOrchestrationResult(
      {
        ...base,
        timeoutState: {
          ...timeoutState,
          timedOut: true,
        },
      },
      pipelineResult,
      rawDeclarationInput as RawFertilizerDeclarationInput,
    )

    return {
      ...mapped,
      timeoutState: {
        ...timeoutState,
        timedOut: true,
      },
    }
  }

  return {
    ...base,
    status: 'timed_out',
    timeoutState: {
      ...timeoutState,
      timedOut: true,
    },
    rawDeclarationInput,
    partialAdapterResults,
  }
}

function buildCancelledResult(
  base: FertilizerEnrichmentOrchestrationResultBase,
  cancelledAt: string,
  reason: FertilizerEnrichmentCancellationReason = 'user_cancelled',
): FertilizerEnrichmentOrchestrationResult {
  return {
    ...base,
    status: 'cancelled',
    cancellation: {
      reason,
      cancelledAt,
      cancelledBy: 'user',
    },
  }
}

function createResultBase(
  orchestrationRunId: string,
  startedAt: string,
  completedAt: string,
): FertilizerEnrichmentOrchestrationResultBase {
  return {
    orchestrationRunId,
    startedAt,
    completedAt,
    attemptedAdapters: [],
    successfulAdapters: [],
    failedAdapters: [],
    timeoutState: createEmptyTimeoutState(startedAt),
    technicalErrors: [],
  }
}

function runPipelineSafely(
  evaluatePipeline: NonNullable<OrchestrateFertilizerEnrichmentDependencies['evaluatePipeline']>,
  rawDeclarationInput: RawFertilizerDeclarationInput,
  options: EvaluateRawFertilizerDeclarationOptions,
): FertilizerNormalizationReadinessPipelineResult {
  return evaluatePipeline(rawDeclarationInput, options)
}

export async function orchestrateFertilizerEnrichment(
  input: FertilizerEnrichmentOrchestrationInput,
  dependencies: OrchestrateFertilizerEnrichmentDependencies,
  options: OrchestrateFertilizerEnrichmentOptions = {},
): Promise<FertilizerEnrichmentOrchestrationResult> {
  if (input.objectCategory !== 'fertilizer') {
    throw new FertilizerEnrichmentOrchestrationContractError(String(input.objectCategory))
  }

  const now = dependencies.now ?? defaultNow
  const startedAt = now()
  const orchestrationRunId =
    options.orchestrationRunId ??
    input.orchestrationRunId ??
    dependencies.createOrchestrationRunId?.() ??
    `orch-${startedAt}`
  const enrichmentRunId = options.enrichmentRunId ?? orchestrationRunId
  const normalizationRunId =
    options.normalizationRunId ?? dependencies.createNormalizationRunId?.() ?? `${orchestrationRunId}-norm`
  const normalizedAt = options.normalizedAt ?? startedAt
  const evaluatedAt = options.evaluatedAt ?? startedAt

  const base = createResultBase(orchestrationRunId, startedAt, startedAt)
  const evaluatePipeline = dependencies.evaluatePipeline ?? evaluateRawFertilizerDeclaration
  const isCancelled = dependencies.isCancelled ?? (() => false)
  const shouldTimeout = dependencies.shouldTimeout ?? (() => false)
  const maxRetryAttempts = dependencies.maxRetryAttempts ?? 3
  const retryAttempt = dependencies.retryAttempt ?? 1

  if (isCancelled()) {
    return buildCancelledResult(base, now(), dependencies.cancellationReason)
  }

  let resolvedFastPathAssessment: FertilizerEnrichmentFastPathAssessment

  try {
    resolvedFastPathAssessment = dependencies.assessFastPath(input)
  } catch (error) {
    rethrowIfContractError(error)
    return buildTechnicalFailureResult(
      { ...base, completedAt: now() },
      createUnexpectedOrchestrationTechnicalError(),
      [],
      null,
      'fast_path_assessment',
    )
  }

  if (isFastPathEligible(resolvedFastPathAssessment)) {
    let fastPathRaw: RawFertilizerDeclarationInput | null = null

    try {
      fastPathRaw =
        dependencies.resolveFastPathRawDeclaration?.(input, resolvedFastPathAssessment) ?? null
    } catch (error) {
      rethrowIfContractError(error)
      return buildTechnicalFailureResult(
        { ...base, completedAt: now() },
        createUnexpectedOrchestrationTechnicalError(),
        [],
        null,
        'fast_path_resolution',
      )
    }

    if (fastPathRaw) {
      try {
        const pipelineResult = runPipelineSafely(evaluatePipeline, fastPathRaw, {
          normalizedAt,
          normalizationRunId,
          evaluatedAt,
        })

        return mapFertilizerPipelineResultToOrchestrationResult(
          {
            ...base,
            completedAt: now(),
            attemptedAdapters: ['existing_product_profile'],
            successfulAdapters: ['existing_product_profile'],
            retryState: evaluateFertilizerAdapterRetryState([], {
              attempt: retryAttempt,
              maxAttempts: maxRetryAttempts,
            }),
          },
          pipelineResult,
          fastPathRaw,
        )
      } catch (error) {
        return buildPipelineFailureResult(
          {
            ...base,
            completedAt: now(),
            attemptedAdapters: ['existing_product_profile'],
            successfulAdapters: ['existing_product_profile'],
          },
          error,
          fastPathRaw,
          [],
        )
      }
    }
  }

  const adapterMap = new Map(dependencies.adapters.map((adapter) => [adapter.adapterType, adapter]))
  const selectedAdapterTypes = selectFertilizerSourceAdapters(
    input,
    dependencies.adapters.map((adapter) => adapter.adapterType),
  )

  if (selectedAdapterTypes.length === 0) {
    return buildNoViableSourceResult(base, [])
  }

  const adapterResults: FertilizerSourceAdapterResult[] = []
  const successfulResults: FertilizerSourceAdapterResult[] = []
  const partialResults: FertilizerSourceAdapterResult[] = []
  const technicalErrors: FertilizerSourceAdapterTechnicalError[] = []
  let timeoutState = createEmptyTimeoutState(startedAt)
  let timedOutDuringRun = false

  for (const adapterType of selectedAdapterTypes) {
    if (isCancelled()) {
      return buildCancelledResult(
        {
          ...base,
          attemptedAdapters: adapterResults.map((result) => result.adapterType),
          successfulAdapters: successfulResults.map((result) => result.adapterType),
          failedAdapters: adapterResults
            .filter(isFailedAdapterResult)
            .map((result) => result.adapterType),
          technicalErrors,
          partialAdapterResults: adapterResults,
          retryState: evaluateFertilizerAdapterRetryState(technicalErrors, {
            attempt: retryAttempt,
            maxAttempts: maxRetryAttempts,
          }),
          completedAt: now(),
        },
        now(),
        dependencies.cancellationReason,
      )
    }

    if (shouldTimeout()) {
      timedOutDuringRun = true
      timeoutState = {
        ...timeoutState,
        kind: 'global_timeout',
        timedOut: true,
        timedOutAdapters: [adapterType],
        cancelledAdapters: selectedAdapterTypes.slice(selectedAdapterTypes.indexOf(adapterType)),
      }
      break
    }

    const adapter = adapterMap.get(adapterType)
    if (!adapter) {
      continue
    }

    const result = await runAdapterSafely(
      adapter,
      {
        input,
        adapterType,
        orchestrationRunId,
        attempt: retryAttempt,
        successfulResults: [...successfulResults],
        partialResults: [...partialResults],
        isCancelled,
        shouldTimeout,
      },
      now,
    )

    adapterResults.push(result)

    const technicalError = collectTechnicalError(result)
    if (technicalError) {
      technicalErrors.push(technicalError)
    }

    if (isSuccessfulAdapterResult(result)) {
      if (result.status === 'success') {
        successfulResults.push(result)
      } else {
        partialResults.push(result)
      }
      timeoutState = {
        ...timeoutState,
        completedAdapters: [...timeoutState.completedAdapters, adapterType],
      }
    } else if (isFailedAdapterResult(result)) {
      timeoutState = {
        ...timeoutState,
        completedAdapters: [...timeoutState.completedAdapters, adapterType],
      }
    }
  }

  const resultBase: FertilizerEnrichmentOrchestrationResultBase = {
    ...base,
    completedAt: now(),
    attemptedAdapters: adapterResults.map((result) => result.adapterType),
    successfulAdapters: successfulResults.map((result) => result.adapterType),
    failedAdapters: adapterResults.filter(isFailedAdapterResult).map((result) => result.adapterType),
    technicalErrors,
    partialAdapterResults: adapterResults,
    retryState: evaluateFertilizerAdapterRetryState(technicalErrors, {
      attempt: retryAttempt,
      maxAttempts: maxRetryAttempts,
    }),
    timeoutState,
  }

  const hasMergeableExtraction = adapterResults.some(isSuccessfulAdapterResult)
  if (!hasMergeableExtraction) {
    const onlyTechnicalFailures =
      adapterResults.length > 0 &&
      adapterResults.every(
        (result) => result.status === 'failed' || result.status === 'unavailable',
      )

    if (onlyTechnicalFailures) {
      const primaryError = technicalErrors[0] ?? {
        code: 'unknown_adapter_error' as const,
        message: 'All adapters failed technically',
        retryable: false,
        adapterType: adapterResults[0]?.adapterType ?? 'existing_product_profile',
      }

      return buildTechnicalFailureResult(resultBase, primaryError, adapterResults, null)
    }

    if (timedOutDuringRun) {
      return buildTimedOutResult(resultBase, timeoutState, null, adapterResults)
    }

    return buildNoViableSourceResult(resultBase, adapterResults)
  }

  const rawDeclarationInput = buildRawFertilizerDeclarationInput(input, adapterResults, {
    enrichmentRunId,
    extractedAt: now(),
  })

  if (timedOutDuringRun && !hasSufficientStructuredDataForPipeline(rawDeclarationInput)) {
    return buildTimedOutResult(resultBase, timeoutState, rawDeclarationInput, adapterResults)
  }

  const researchDiagnostics = readManufacturerResearchDiagnostics(input)
  const enrichedResultBase = attachResearchDiagnostics(resultBase, input)

  try {
    const pipelineResult = runPipelineSafely(evaluatePipeline, rawDeclarationInput, {
      normalizedAt,
      normalizationRunId,
      evaluatedAt,
      automaticResearchAttempted: researchDiagnostics?.automaticResearchAttempted === true,
      researchDiagnostics,
    })

    if (timedOutDuringRun) {
      return buildTimedOutResult(
        enrichedResultBase,
        timeoutState,
        rawDeclarationInput,
        adapterResults,
        pipelineResult,
      )
    }

    return mapFertilizerPipelineResultToOrchestrationResult(
      attachNutrientPipelineDiagnostics(enrichedResultBase, {
        input,
        adapterResults,
        rawDeclarationInput,
        pipelineResult,
      }),
      pipelineResult,
      rawDeclarationInput,
    )
  } catch (error) {
    return buildPipelineFailureResult(enrichedResultBase, error, rawDeclarationInput, adapterResults)
  }
}

export function assessFertilizerEnrichmentFastPath(
  assessment: FertilizerEnrichmentFastPathAssessment,
): boolean {
  return isFastPathEligible(assessment)
}
