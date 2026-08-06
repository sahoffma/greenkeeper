import type { HandlerEvent } from '@netlify/functions'
import { FertilizerEnrichmentServerConfigurationError } from './fertilizerEnrichmentServerEnvironmentCore'
import { FertilizerEnrichmentServerApiError } from './fertilizerEnrichmentServerServiceCore'
import type { FertilizerEnrichmentApiErrorCode } from '../types/fertilizerEnrichmentOrchestration'

export const FERTILIZER_ENRICHMENT_START_FUNCTION_NAME = 'fertilizer-enrichment-start'

export type FertilizerEnrichmentStartFailurePhase =
  | 'runtime_init'
  | 'request_validation'
  | 'job_creation'
  | 'source_selection'
  | 'source_fetch'
  | 'orchestration'
  | 'persistence'
  | 'unknown'

export interface FertilizerEnrichmentStartInputCounts {
  sourceHintCount: number
  userProvidedSourceCount: number
  captureInlineSourceTextCount: number
}

export interface FertilizerEnrichmentStartEnrichmentResultDiagnostic {
  status: string
  failureReason: string | null
  sourceHintCount: number
  userProvidedSourceCount: number
  captureInlineSourceTextCount: number
  selectedAdapterTypes: string[]
}

export interface FertilizerEnrichmentStartFailureDiagnostic {
  functionName: typeof FERTILIZER_ENRICHMENT_START_FUNCTION_NAME
  requestId: string | null
  phase: FertilizerEnrichmentStartFailurePhase
  errorName: string
  errorCode: string
  httpStatus: number
  enrichmentResult?: FertilizerEnrichmentStartEnrichmentResultDiagnostic
}

const REQUEST_ID_HEADER_NAMES = [
  'x-nf-request-id',
  'x-request-id',
  'X-Nf-Request-Id',
  'X-Request-Id',
] as const

export function resolveFertilizerEnrichmentStartRequestId(
  event: Pick<HandlerEvent, 'headers'>,
): string | null {
  const headers = event.headers ?? {}

  for (const headerName of REQUEST_ID_HEADER_NAMES) {
    const value = headers[headerName]?.trim()
    if (value) {
      return value
    }
  }

  return null
}

export function extractSafeFertilizerEnrichmentStartInputCounts(
  body: string | null | undefined,
): FertilizerEnrichmentStartInputCounts {
  const empty = {
    sourceHintCount: 0,
    userProvidedSourceCount: 0,
    captureInlineSourceTextCount: 0,
  }

  if (!body?.trim()) {
    return empty
  }

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const input = parsed.input
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return empty
    }

    const inputRecord = input as Record<string, unknown>
    const inlineTexts = inputRecord.captureInlineSourceTexts

    return {
      sourceHintCount: Array.isArray(inputRecord.sourceHints) ? inputRecord.sourceHints.length : 0,
      userProvidedSourceCount: Array.isArray(inputRecord.userProvidedSources)
        ? inputRecord.userProvidedSources.length
        : 0,
      captureInlineSourceTextCount:
        inlineTexts && typeof inlineTexts === 'object' && !Array.isArray(inlineTexts)
          ? Object.keys(inlineTexts).length
          : 0,
    }
  } catch {
    return empty
  }
}

function readApiErrorCode(payload: unknown): FertilizerEnrichmentApiErrorCode | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const error = (payload as Record<string, unknown>).error
  if (!error || typeof error !== 'object') {
    return null
  }

  const code = (error as Record<string, unknown>).code
  return typeof code === 'string' ? (code as FertilizerEnrichmentApiErrorCode) : null
}

function readJobResult(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const job = (payload as Record<string, unknown>).job
  if (!job || typeof job !== 'object') {
    return null
  }

  const result = (job as Record<string, unknown>).result
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return null
  }

  return result as Record<string, unknown>
}

export function resolveFertilizerEnrichmentStartFailurePhase(input: {
  httpStatus: number
  apiErrorCode?: string | null
  enrichmentStatus?: string | null
  failureReason?: string | null
  failedAdapters?: string[]
}): FertilizerEnrichmentStartFailurePhase {
  if (input.apiErrorCode === 'invalid_request' || input.apiErrorCode === 'unauthorized') {
    return 'request_validation'
  }

  if (input.apiErrorCode === 'idempotency_conflict') {
    return 'job_creation'
  }

  if (
    input.apiErrorCode === 'revision_conflict' ||
    input.apiErrorCode === 'temporarily_unavailable'
  ) {
    return 'persistence'
  }

  if (input.enrichmentStatus === 'failed') {
    if (input.failureReason === 'no_viable_source') {
      return 'source_selection'
    }

    if (input.failedAdapters?.includes('manufacturer_product_document')) {
      return 'source_fetch'
    }

    return 'orchestration'
  }

  if (input.enrichmentStatus === 'timed_out') {
    return 'orchestration'
  }

  if (input.httpStatus >= 500 && input.apiErrorCode === 'internal_server_error') {
    return 'unknown'
  }

  return 'unknown'
}

export function resolveFertilizerEnrichmentStartSafeErrorCode(input: {
  error?: unknown
  httpStatus: number
  apiErrorCode?: string | null
  enrichmentStatus?: string | null
  failureReason?: string | null
}): string {
  if (input.apiErrorCode) {
    return input.apiErrorCode
  }

  if (input.enrichmentStatus === 'failed' && input.failureReason) {
    return `enrichment_${input.failureReason}`
  }

  if (input.enrichmentStatus === 'timed_out') {
    return 'enrichment_timed_out'
  }

  if (input.error instanceof FertilizerEnrichmentServerConfigurationError) {
    return 'internal_server_error'
  }

  if (input.error instanceof FertilizerEnrichmentServerApiError) {
    return input.error.apiError.code
  }

  if (input.httpStatus >= 500) {
    return 'internal_server_error'
  }

  return 'request_failed'
}

export function resolveFertilizerEnrichmentStartErrorName(error?: unknown): string {
  if (error instanceof Error) {
    return error.name
  }

  if (error == null) {
    return 'EnrichmentStartFailure'
  }

  return 'UnknownError'
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === 'string')
}

export function buildFertilizerEnrichmentStartEnrichmentResultDiagnostic(
  result: Record<string, unknown>,
  inputCounts: FertilizerEnrichmentStartInputCounts,
): FertilizerEnrichmentStartEnrichmentResultDiagnostic {
  const attemptedAdapters = readStringArray(result.attemptedAdapters)
  const successfulAdapters = readStringArray(result.successfulAdapters)
  const failedAdapters = readStringArray(result.failedAdapters)
  const selectedAdapterTypes = Array.from(
    new Set([...attemptedAdapters, ...successfulAdapters, ...failedAdapters]),
  )

  return {
    status: typeof result.status === 'string' ? result.status : 'unknown',
    failureReason: typeof result.failureReason === 'string' ? result.failureReason : null,
    sourceHintCount: inputCounts.sourceHintCount,
    userProvidedSourceCount: inputCounts.userProvidedSourceCount,
    captureInlineSourceTextCount: inputCounts.captureInlineSourceTextCount,
    selectedAdapterTypes,
  }
}

export function buildFertilizerEnrichmentStartFailureDiagnostic(input: {
  requestId: string | null
  phase: FertilizerEnrichmentStartFailurePhase
  error?: unknown
  httpStatus: number
  responseBody?: string | null
  inputCounts?: FertilizerEnrichmentStartInputCounts
}): FertilizerEnrichmentStartFailureDiagnostic {
  let parsedBody: unknown = null
  if (input.responseBody?.trim()) {
    try {
      parsedBody = JSON.parse(input.responseBody)
    } catch {
      parsedBody = null
    }
  }

  const apiErrorCode = readApiErrorCode(parsedBody)
  const jobResult = readJobResult(parsedBody)
  const enrichmentStatus =
    typeof jobResult?.status === 'string' ? jobResult.status : null
  const failureReason =
    typeof jobResult?.failureReason === 'string' ? jobResult.failureReason : null

  const diagnostic: FertilizerEnrichmentStartFailureDiagnostic = {
    functionName: FERTILIZER_ENRICHMENT_START_FUNCTION_NAME,
    requestId: input.requestId,
    phase: input.phase,
    errorName: resolveFertilizerEnrichmentStartErrorName(input.error),
    errorCode: resolveFertilizerEnrichmentStartSafeErrorCode({
      error: input.error,
      httpStatus: input.httpStatus,
      apiErrorCode,
      enrichmentStatus,
      failureReason,
    }),
    httpStatus: input.httpStatus,
  }

  if (jobResult) {
    diagnostic.enrichmentResult = buildFertilizerEnrichmentStartEnrichmentResultDiagnostic(
      jobResult,
      input.inputCounts ?? extractSafeFertilizerEnrichmentStartInputCounts(null),
    )
  }

  return diagnostic
}

export function shouldLogFertilizerEnrichmentStartFailure(input: {
  httpStatus: number
  responseBody?: string | null
}): boolean {
  if (input.httpStatus >= 400) {
    return true
  }

  if (!input.responseBody?.trim()) {
    return false
  }

  try {
    const parsed = JSON.parse(input.responseBody) as Record<string, unknown>
    const result = readJobResult(parsed)
    const status = typeof result?.status === 'string' ? result.status : null
    return status === 'failed' || status === 'timed_out'
  } catch {
    return false
  }
}

export function logFertilizerEnrichmentStartFailure(
  diagnostic: FertilizerEnrichmentStartFailureDiagnostic,
): void {
  console.error(`[${FERTILIZER_ENRICHMENT_START_FUNCTION_NAME}]`, diagnostic)
}

export function diagnoseFertilizerEnrichmentStartResponse(input: {
  requestId: string | null
  httpStatus: number
  responseBody?: string | null
  inputCounts: FertilizerEnrichmentStartInputCounts
  error?: unknown
  phaseOverride?: FertilizerEnrichmentStartFailurePhase
}): void {
  if (!shouldLogFertilizerEnrichmentStartFailure(input)) {
    return
  }

  let parsedBody: unknown = null
  if (input.responseBody?.trim()) {
    try {
      parsedBody = JSON.parse(input.responseBody)
    } catch {
      parsedBody = null
    }
  }

  const apiErrorCode = readApiErrorCode(parsedBody)
  const jobResult = readJobResult(parsedBody)
  const enrichmentStatus =
    typeof jobResult?.status === 'string' ? jobResult.status : null
  const failureReason =
    typeof jobResult?.failureReason === 'string' ? jobResult.failureReason : null
  const failedAdapters = readStringArray(jobResult?.failedAdapters)

  const phase =
    input.phaseOverride ??
    resolveFertilizerEnrichmentStartFailurePhase({
      httpStatus: input.httpStatus,
      apiErrorCode,
      enrichmentStatus,
      failureReason,
      failedAdapters,
    })

  logFertilizerEnrichmentStartFailure(
    buildFertilizerEnrichmentStartFailureDiagnostic({
      requestId: input.requestId,
      phase,
      error: input.error,
      httpStatus: input.httpStatus,
      responseBody: input.responseBody,
      inputCounts: input.inputCounts,
    }),
  )
}
