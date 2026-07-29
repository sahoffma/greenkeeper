import type { FertilizerDeclarationNormalizationResult } from '../types/fertilizerDeclarationNormalization'
import type { RawFertilizerDeclarationInput } from '../types/fertilizerDeclarationNormalization'
import type {
  EvaluateFertilizerReadinessOptions,
  FertilizerProductProfileReadinessInput,
  FertilizerReadinessResult,
} from '../types/fertilizerReadiness'
import {
  normalizeFertilizerDeclaration,
  type NormalizeFertilizerDeclarationOptions,
} from './fertilizerDeclarationNormalizerCore'
import { buildFertilizerReadinessInput } from './fertilizerReadinessInputBuilderCore'
import { evaluateFertilizerReadiness } from './fertilizerReadinessCore'

export interface FertilizerNormalizationReadinessPipelineResult {
  normalizationResult: FertilizerDeclarationNormalizationResult
  readinessInput: FertilizerProductProfileReadinessInput
  readinessResult: FertilizerReadinessResult
}

export interface EvaluateRawFertilizerDeclarationOptions
  extends NormalizeFertilizerDeclarationOptions,
    EvaluateFertilizerReadinessOptions {}

/**
 * Phase 2c: isolated chain — normalizer → builder → readiness evaluator.
 * No orchestration, persistence, or side effects beyond the three existing stages.
 */
export function evaluateRawFertilizerDeclaration(
  input: RawFertilizerDeclarationInput,
  options: EvaluateRawFertilizerDeclarationOptions = {},
): FertilizerNormalizationReadinessPipelineResult {
  const normalizationResult = normalizeFertilizerDeclaration(input, {
    normalizedAt: options.normalizedAt,
    normalizationRunId: options.normalizationRunId,
  })

  const readinessInput = buildFertilizerReadinessInput(normalizationResult.enrichmentResult)
  const readinessResult = evaluateFertilizerReadiness(readinessInput, {
    evaluatedAt: options.evaluatedAt,
  })

  return {
    normalizationResult,
    readinessInput,
    readinessResult,
  }
}
