import type { HandlerEvent } from '@netlify/functions'
import { FertilizerEnrichmentJobRepositoryError } from './fertilizerEnrichmentJobRepositoryCore'
import { FertilizerEnrichmentOrchestrationContractError } from './fertilizerEnrichmentOrchestrationCore'
import { FertilizerEnrichmentServerConfigurationError } from './fertilizerEnrichmentServerEnvironmentCore'
import { FertilizerEnrichmentServerApiError } from './fertilizerEnrichmentServerServiceCore'
import type { FertilizerEnrichmentApiErrorCode } from '../types/fertilizerEnrichmentOrchestration'
import {
  classifyEnrichmentFormEvidenceCategory,
  resolveRecognitionFormEvidenceSourceField,
} from './fertilizerRecognitionEnrichmentBasisCore'

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

export type FertilizerEnrichmentStartInternalErrorSubtype =
  | 'supabase_persistence'
  | 'job_creation'
  | 'session_cookie'
  | 'adapter_creation'
  | 'source_validation'
  | 'source_fetch'
  | 'orchestration'
  | 'unknown_runtime'

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

export interface FertilizerEnrichmentStartAdapterOutcomeDiagnostic {
  adapterType: string
  status: string
  errorCode: string | null
  retryable: boolean | null
}

export interface FertilizerEnrichmentStartReadinessDiagnostic {
  status: string | null
  readinessReason: string | null
  missingSections: string[]
  failedCheck: string | null
}

export type FertilizerEnrichmentStartRecognitionFormField =
  | 'form'
  | 'normalizedValue'
  | 'productDescriptor'
  | 'packagingBasis'
  | 'none'

export type FertilizerEnrichmentStartFormCategory =
  | 'granular'
  | 'liquid'
  | 'ambiguous'
  | 'unknown'
  | 'missing'

export type FertilizerEnrichmentStartFormFallbackRejectedReason =
  | 'missing'
  | 'ambiguous'
  | 'invalid_mapping'
  | 'overwritten_by_unknown'
  | 'lost_during_serialization'
  | 'none'

export interface FertilizerEnrichmentStartFormDiagnostic {
  recognitionFormPresent: boolean
  recognitionFormField: FertilizerEnrichmentStartRecognitionFormField
  recognitionFormCategory: FertilizerEnrichmentStartFormCategory
  packagingBasisPresent: boolean
  packagingBasisFormCategory: FertilizerEnrichmentStartFormCategory
  adapterFormCategory: FertilizerEnrichmentStartFormCategory
  mergedFormCategory: FertilizerEnrichmentStartFormCategory
  formFallbackUsed: boolean
  formFallbackRejectedReason: FertilizerEnrichmentStartFormFallbackRejectedReason
}

export interface FertilizerEnrichmentStartOutcomeWarningDiagnostic {
  functionName: typeof FERTILIZER_ENRICHMENT_START_FUNCTION_NAME
  requestId: string | null
  httpStatus: number
  jobIdRef: string
  result: {
    status: string
    failureReason: string | null
    recommendedNextAction: string | null
  }
  readiness: FertilizerEnrichmentStartReadinessDiagnostic | null
  sourceHintCount: number
  userProvidedSourceCount: number
  captureInlineSourceTextCount: number
  selectedAdapterTypes: string[]
  adapterOutcomes: FertilizerEnrichmentStartAdapterOutcomeDiagnostic[]
  sourceSummary: {
    foundCount: number
    acceptedCount: number
  }
  packagingInlineProcessed: boolean
  manufacturerHttpFetchAttempted: boolean
  formDiagnostic: FertilizerEnrichmentStartFormDiagnostic | null
}

export interface FertilizerEnrichmentStartStackFrameDiagnostic {
  file: string
  function: string
}

export interface FertilizerEnrichmentStartCauseDiagnostic {
  name: string
  code: string | null
  safeMessage: string | null
}

export interface FertilizerEnrichmentStartSupabaseDiagnostic {
  code: string
  target: string | null
}

export interface FertilizerEnrichmentStartInternalErrorDiagnostic {
  subtype: FertilizerEnrichmentStartInternalErrorSubtype
  rootErrorName: string
  internalErrorCode: string
  safeMessage: string | null
  stackFrame: FertilizerEnrichmentStartStackFrameDiagnostic | null
  cause: FertilizerEnrichmentStartCauseDiagnostic | null
  supabase: FertilizerEnrichmentStartSupabaseDiagnostic | null
}

export interface FertilizerEnrichmentStartFailureDiagnostic {
  functionName: typeof FERTILIZER_ENRICHMENT_START_FUNCTION_NAME
  requestId: string | null
  phase: FertilizerEnrichmentStartFailurePhase
  errorName: string
  errorCode: string
  httpStatus: number
  internalError?: FertilizerEnrichmentStartInternalErrorDiagnostic
  enrichmentResult?: FertilizerEnrichmentStartEnrichmentResultDiagnostic
}

const REQUEST_ID_HEADER_NAMES = [
  'x-nf-request-id',
  'x-request-id',
  'X-Nf-Request-Id',
  'X-Request-Id',
] as const

const SENSITIVE_MESSAGE_PATTERNS = [
  /Bearer\s+\S+/gi,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /SUPABASE_[A-Z0-9_]+/g,
  /OPENAI_[A-Z0-9_]+/g,
  /service[_-]?role[_-]?key/gi,
  /session[_-]?cookie[_-]?signing[_-]?secret/gi,
  /password=\S+/gi,
  /token=\S+/gi,
  /session=\S+/gi,
  /https?:\/\/\S+/gi,
] as const

const SUPABASE_TABLE_PATTERN = /relation "([^"]+)"/i
const SUPABASE_RPC_PATTERN = /function "([^"]+)"/i

type ErrorWithOptionalCause = Error & { cause?: unknown }

function readLinkedErrorCause(error: Error): unknown | undefined {
  return (error as ErrorWithOptionalCause).cause
}

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

function readJobId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const job = (payload as Record<string, unknown>).job
  if (!job || typeof job !== 'object') {
    return null
  }

  const jobId = (job as Record<string, unknown>).jobId
  return typeof jobId === 'string' && jobId.trim() ? jobId.trim() : null
}

export function redactFertilizerEnrichmentStartJobId(jobId: string): string {
  const trimmed = jobId.trim()
  if (trimmed.length <= 8) {
    return 'job:[redacted]'
  }

  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`
}

function readObjectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function readAdapterOutcomeErrorCode(record: Record<string, unknown>): string | null {
  const technicalError = readObjectRecord(record.technicalError)
  if (technicalError && typeof technicalError.code === 'string') {
    return technicalError.code
  }

  if (typeof record.reasonCode === 'string') {
    return record.reasonCode
  }

  return null
}

function readAdapterOutcomeRetryable(record: Record<string, unknown>): boolean | null {
  if (typeof record.retryable === 'boolean') {
    return record.retryable
  }

  const technicalError = readObjectRecord(record.technicalError)
  if (technicalError && typeof technicalError.retryable === 'boolean') {
    return technicalError.retryable
  }

  return null
}

export function buildFertilizerEnrichmentStartAdapterOutcomeDiagnostics(
  result: Record<string, unknown>,
): FertilizerEnrichmentStartAdapterOutcomeDiagnostic[] {
  const partialAdapterResults = result.partialAdapterResults
  if (!Array.isArray(partialAdapterResults)) {
    return []
  }

  const outcomes: FertilizerEnrichmentStartAdapterOutcomeDiagnostic[] = []

  for (const item of partialAdapterResults) {
    const record = readObjectRecord(item)
    if (!record || typeof record.adapterType !== 'string' || typeof record.status !== 'string') {
      continue
    }

    outcomes.push({
      adapterType: record.adapterType,
      status: record.status,
      errorCode: readAdapterOutcomeErrorCode(record),
      retryable: readAdapterOutcomeRetryable(record),
    })
  }

  return outcomes
}

function readNestedReadinessResult(
  result: Record<string, unknown>,
): Record<string, unknown> | null {
  const direct = readObjectRecord(result.readinessResult)
  if (direct) {
    return direct
  }

  const pipelineResult = readObjectRecord(result.pipelineResult)
  return pipelineResult ? readObjectRecord(pipelineResult.readinessResult) : null
}

export function buildFertilizerEnrichmentStartReadinessDiagnostic(
  result: Record<string, unknown>,
  status: string,
  failureReason: string | null,
): FertilizerEnrichmentStartReadinessDiagnostic | null {
  const readiness = readNestedReadinessResult(result)
  const missingSections = readiness ? readStringArray(readiness.missingRequirements) : []
  const readinessStatus =
    readiness && typeof readiness.status === 'string' ? readiness.status : null
  const failedCheck = resolveFertilizerEnrichmentStartReadinessFailedCheck(
    result,
    status,
    failureReason,
  )

  if (!readiness && !failedCheck && missingSections.length === 0) {
    return null
  }

  return {
    status: readinessStatus,
    readinessReason: readinessStatus,
    missingSections,
    failedCheck,
  }
}

export function resolveFertilizerEnrichmentStartReadinessFailedCheck(
  result: Record<string, unknown>,
  status: string,
  failureReason: string | null,
): string | null {
  if (status === 'needs_input') {
    return 'readiness_needs_input'
  }

  if (failureReason === 'domain_not_ready') {
    return 'readiness_not_ready'
  }

  if (failureReason === 'pipeline_failure') {
    const pipelineStep = result.pipelineStep
    return typeof pipelineStep === 'string' ? `pipeline_${pipelineStep}` : 'pipeline_failure'
  }

  if (failureReason === 'no_viable_source') {
    return 'no_viable_source'
  }

  if (status === 'failed' && failureReason) {
    return failureReason
  }

  if (status === 'timed_out') {
    return 'orchestration_timed_out'
  }

  if (status === 'recognized' || status === 'enriching' || status === 'cancelled') {
    return status
  }

  return null
}

function readCaptureRecognitionPackagingBasisFromRequest(
  requestBody: string | null | undefined,
): Record<string, unknown> | null {
  if (!requestBody?.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(requestBody) as Record<string, unknown>
    const input = parsed.input
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null
    }

    const basis = (input as Record<string, unknown>).captureRecognitionPackagingBasis
    return readObjectRecord(basis)
  } catch {
    return null
  }
}

function readAdapterPackagingFormCategory(
  jobResult: Record<string, unknown>,
): FertilizerEnrichmentStartFormCategory {
  const partialAdapterResults = jobResult.partialAdapterResults
  if (!Array.isArray(partialAdapterResults)) {
    return 'missing'
  }

  for (const item of partialAdapterResults) {
    const record = readObjectRecord(item)
    if (!record || record.adapterType !== 'packaging') {
      continue
    }

    const extraction = readObjectRecord(record.extraction)
    const extractedProductForm = extraction?.extractedProductForm
    if (extractedProductForm === 'granular' || extractedProductForm === 'liquid') {
      return extractedProductForm
    }

    if (extractedProductForm === 'unknown') {
      return 'unknown'
    }
  }

  return 'missing'
}

function readMergedFormCategory(jobResult: Record<string, unknown>): FertilizerEnrichmentStartFormCategory {
  const pipelineResult = readObjectRecord(jobResult.pipelineResult)
  const rawDeclarationInput =
    readObjectRecord(jobResult.rawDeclarationInput) ??
    (pipelineResult ? readObjectRecord(pipelineResult.rawDeclarationInput) : null)
  const productForm = readObjectRecord(rawDeclarationInput?.productForm)
  const value = productForm?.value

  if (value === 'granular' || value === 'liquid') {
    return value
  }

  if (value === 'unknown') {
    return 'unknown'
  }

  return 'missing'
}

function resolveFormFallbackRejectedReason(input: {
  recognitionFormCategory: FertilizerEnrichmentStartFormCategory
  packagingBasisFormCategory: FertilizerEnrichmentStartFormCategory
  adapterFormCategory: FertilizerEnrichmentStartFormCategory
  mergedFormCategory: FertilizerEnrichmentStartFormCategory
  formFallbackUsed: boolean
  packagingBasisPresent: boolean
  recognitionFormPresent: boolean
  requestHasBasisPayload: boolean
}): FertilizerEnrichmentStartFormFallbackRejectedReason {
  if (
    (input.adapterFormCategory === 'granular' || input.adapterFormCategory === 'liquid') &&
    input.mergedFormCategory !== 'granular' &&
    input.mergedFormCategory !== 'liquid'
  ) {
    return 'overwritten_by_unknown'
  }

  if (input.formFallbackUsed || input.mergedFormCategory === 'granular' || input.mergedFormCategory === 'liquid') {
    return 'none'
  }

  if (
    input.requestHasBasisPayload &&
    !input.packagingBasisPresent &&
    input.recognitionFormPresent
  ) {
    return 'lost_during_serialization'
  }

  if (input.recognitionFormCategory === 'ambiguous') {
    return 'ambiguous'
  }

  if (
    input.recognitionFormPresent &&
    input.recognitionFormCategory === 'unknown' &&
    input.packagingBasisFormCategory === 'unknown'
  ) {
    return 'invalid_mapping'
  }

  return 'missing'
}

export function buildFertilizerEnrichmentStartFormDiagnostic(input: {
  requestBody?: string | null
  jobResult: Record<string, unknown>
}): FertilizerEnrichmentStartFormDiagnostic | null {
  const basis = readCaptureRecognitionPackagingBasisFromRequest(input.requestBody)
  const requestHasBasisPayload = Boolean(
    input.requestBody?.includes('captureRecognitionPackagingBasis'),
  )
  const packagingBasisPresent = basis != null

  const recognitionFormLabel =
    typeof basis?.recognitionFormLabel === 'string' ? basis.recognitionFormLabel : null
  const recognitionDescriptorLabel =
    typeof basis?.recognitionDescriptorLabel === 'string'
      ? basis.recognitionDescriptorLabel
      : null
  const basisProductForm = basis?.productForm

  const recognitionFormCategory = classifyEnrichmentFormEvidenceCategory(
    recognitionFormLabel,
    recognitionDescriptorLabel,
  )
  const packagingBasisFormCategory =
    basisProductForm === 'granular' || basisProductForm === 'liquid'
      ? basisProductForm
      : classifyEnrichmentFormEvidenceCategory(recognitionFormLabel, recognitionDescriptorLabel)

  const adapterFormCategory = readAdapterPackagingFormCategory(input.jobResult)
  const mergedFormCategory = readMergedFormCategory(input.jobResult)

  const recognitionFormPresent =
    recognitionFormCategory !== 'missing' ||
    packagingBasisFormCategory !== 'missing' ||
    Boolean(recognitionFormLabel || recognitionDescriptorLabel)

  const recognitionFormField = resolveRecognitionFormEvidenceSourceField({
    formRawValue: recognitionFormLabel,
    formNormalizedValue:
      basisProductForm === 'granular' || basisProductForm === 'liquid' ? basisProductForm : null,
    descriptorRawValue: recognitionDescriptorLabel,
    descriptorNormalizedValue: recognitionDescriptorLabel,
    packagingBasisProductForm:
      basisProductForm === 'granular' || basisProductForm === 'liquid'
        ? basisProductForm
        : null,
  })

  const formFallbackUsed =
    (mergedFormCategory === 'granular' || mergedFormCategory === 'liquid') &&
    adapterFormCategory !== 'granular' &&
    adapterFormCategory !== 'liquid' &&
    (packagingBasisFormCategory === 'granular' ||
      packagingBasisFormCategory === 'liquid' ||
      recognitionFormCategory === 'granular' ||
      recognitionFormCategory === 'liquid')

  const formFallbackRejectedReason = resolveFormFallbackRejectedReason({
    recognitionFormCategory,
    packagingBasisFormCategory,
    adapterFormCategory,
    mergedFormCategory,
    formFallbackUsed,
    packagingBasisPresent,
    recognitionFormPresent,
    requestHasBasisPayload,
  })

  if (
    !recognitionFormPresent &&
    !packagingBasisPresent &&
    adapterFormCategory === 'missing' &&
    mergedFormCategory === 'missing'
  ) {
    return null
  }

  return {
    recognitionFormPresent,
    recognitionFormField,
    recognitionFormCategory,
    packagingBasisPresent,
    packagingBasisFormCategory,
    adapterFormCategory,
    mergedFormCategory,
    formFallbackUsed,
    formFallbackRejectedReason,
  }
}

export function buildFertilizerEnrichmentStartOutcomeWarningDiagnostic(input: {
  requestId: string | null
  httpStatus: number
  responseBody?: string | null
  requestBody?: string | null
  inputCounts: FertilizerEnrichmentStartInputCounts
}): FertilizerEnrichmentStartOutcomeWarningDiagnostic | null {
  if (!input.responseBody?.trim()) {
    return null
  }

  let parsedBody: unknown = null
  try {
    parsedBody = JSON.parse(input.responseBody)
  } catch {
    return null
  }

  const jobResult = readJobResult(parsedBody)
  if (!jobResult) {
    return null
  }

  const status = typeof jobResult.status === 'string' ? jobResult.status : 'unknown'
  const failureReason =
    typeof jobResult.failureReason === 'string' ? jobResult.failureReason : null
  const recommendedNextAction =
    typeof jobResult.recommendedNextAction === 'string' ? jobResult.recommendedNextAction : null
  const attemptedAdapters = readStringArray(jobResult.attemptedAdapters)
  const successfulAdapters = readStringArray(jobResult.successfulAdapters)
  const failedAdapters = readStringArray(jobResult.failedAdapters)
  const selectedAdapterTypes = Array.from(
    new Set([...attemptedAdapters, ...successfulAdapters, ...failedAdapters]),
  )
  const adapterOutcomes = buildFertilizerEnrichmentStartAdapterOutcomeDiagnostics(jobResult)
  const jobId = readJobId(parsedBody)

  return {
    functionName: FERTILIZER_ENRICHMENT_START_FUNCTION_NAME,
    requestId: input.requestId,
    httpStatus: input.httpStatus,
    jobIdRef: jobId ? redactFertilizerEnrichmentStartJobId(jobId) : 'job:[missing]',
    result: {
      status,
      failureReason,
      recommendedNextAction,
    },
    readiness: buildFertilizerEnrichmentStartReadinessDiagnostic(jobResult, status, failureReason),
    sourceHintCount: input.inputCounts.sourceHintCount,
    userProvidedSourceCount: input.inputCounts.userProvidedSourceCount,
    captureInlineSourceTextCount: input.inputCounts.captureInlineSourceTextCount,
    selectedAdapterTypes,
    adapterOutcomes,
    sourceSummary: {
      foundCount: adapterOutcomes.length > 0 ? adapterOutcomes.length : attemptedAdapters.length,
      acceptedCount: successfulAdapters.length,
    },
    packagingInlineProcessed:
      input.inputCounts.captureInlineSourceTextCount > 0 &&
      selectedAdapterTypes.includes('packaging'),
    manufacturerHttpFetchAttempted: selectedAdapterTypes.includes('manufacturer_product_document'),
    formDiagnostic: buildFertilizerEnrichmentStartFormDiagnostic({
      requestBody: input.requestBody,
      jobResult,
    }),
  }
}

export function shouldWarnFertilizerEnrichmentStartOutcome(input: {
  httpStatus: number
  responseBody?: string | null
}): boolean {
  if (input.httpStatus < 200 || input.httpStatus >= 300) {
    return false
  }

  if (!input.responseBody?.trim()) {
    return false
  }

  try {
    const parsed = JSON.parse(input.responseBody) as Record<string, unknown>
    const result = readJobResult(parsed)
    const status = typeof result?.status === 'string' ? result.status : null
    return status != null && status !== 'intake_ready'
  } catch {
    return false
  }
}

export function logFertilizerEnrichmentStartOutcomeWarning(
  diagnostic: FertilizerEnrichmentStartOutcomeWarningDiagnostic,
): void {
  console.warn(`[${FERTILIZER_ENRICHMENT_START_FUNCTION_NAME}]`, diagnostic)
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

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((entry): entry is string => typeof entry === 'string')
}

export function sanitizeFertilizerEnrichmentStartDiagnosticMessage(
  message: string | null | undefined,
): string | null {
  if (!message?.trim()) {
    return null
  }

  let sanitized = message.trim().slice(0, 200)
  for (const pattern of SENSITIVE_MESSAGE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[redacted]')
  }

  sanitized = sanitized.replace(/\/(?:Users|home|private|var|tmp)\/[^\s,)]+/g, '[path]')
  sanitized = sanitized.replace(/\s+/g, ' ').trim()
  return sanitized.length > 0 ? sanitized : null
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null
  }

  const record = error as Record<string, unknown>
  if (typeof record.code === 'string' && record.code.trim()) {
    return record.code.trim()
  }

  return null
}

function isEnrichmentDiagnosticWrapper(error: unknown): boolean {
  return (
    error instanceof FertilizerEnrichmentJobRepositoryError ||
    error instanceof FertilizerEnrichmentServerApiError ||
    error instanceof FertilizerEnrichmentOrchestrationContractError ||
    error instanceof FertilizerEnrichmentServerConfigurationError
  )
}

function readSupabaseDiagnostic(error: unknown): FertilizerEnrichmentStartSupabaseDiagnostic | null {
  if (isEnrichmentDiagnosticWrapper(error)) {
    return null
  }

  const code = readErrorCode(error)
  if (!code) {
    return null
  }

  const message =
    error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string'
      ? String((error as Record<string, unknown>).message)
      : ''
  const details =
    error && typeof error === 'object' && typeof (error as Record<string, unknown>).details === 'string'
      ? String((error as Record<string, unknown>).details)
      : ''
  const haystack = `${message} ${details}`
  const tableMatch = SUPABASE_TABLE_PATTERN.exec(haystack)
  const rpcMatch = SUPABASE_RPC_PATTERN.exec(haystack)
  const looksLikeSupabase =
    tableMatch != null ||
    rpcMatch != null ||
    /^PGRST\d+/i.test(code) ||
    /^\d{5}$/.test(code)

  if (!looksLikeSupabase) {
    return null
  }

  return {
    code,
    target: tableMatch?.[1] ?? rpcMatch?.[1] ?? null,
  }
}

export function unwrapFertilizerEnrichmentStartErrorChain(error: unknown): unknown[] {
  const chain: unknown[] = []
  const seen = new Set<unknown>()
  let current: unknown = error

  while (current != null && !seen.has(current)) {
    seen.add(current)
    chain.push(current)

    if (current instanceof Error) {
      const cause = readLinkedErrorCause(current)
      if (cause != null) {
        current = cause
        continue
      }
    }

    break
  }

  return chain
}

function extractStackFileName(location: string): string {
  const cleaned = location.replace(/\)$/, '').trim()
  const match = /([^/\\]+\.(?:tsx?|mjs|cjs|js))(?::\d+)?(?::\d+)?$/.exec(cleaned)
  return match?.[1] ?? 'unknown'
}

export function readFertilizerEnrichmentStartStackFrame(
  error: Error,
): FertilizerEnrichmentStartStackFrameDiagnostic | null {
  const lines = error.stack?.split('\n') ?? []

  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim()
    const withFunction = /^at\s+(?:async\s+)?(.+?)\s+\((.+)\)$/.exec(line)
    const withoutFunction = /^at\s+(?:async\s+)?(.+)$/.exec(line)

    const location = (withFunction?.[2] ?? withoutFunction?.[1] ?? '').trim()
    if (!location || location.includes('node_modules')) {
      continue
    }

    const file = extractStackFileName(location)
    if (file === 'unknown') {
      continue
    }

    const fn = withFunction?.[1]?.trim() || '<anonymous>'
    return {
      file,
      function: fn,
    }
  }

  return null
}

function readRelevantStackFrame(
  chain: unknown[],
): FertilizerEnrichmentStartStackFrameDiagnostic | null {
  for (const item of chain) {
    if (!(item instanceof Error)) {
      continue
    }

    const frame = readFertilizerEnrichmentStartStackFrame(item)
    if (!frame || frame.file.includes('.test.')) {
      continue
    }

    return frame
  }

  const rootError = chain.find((item): item is Error => item instanceof Error) ?? null
  return rootError ? readFertilizerEnrichmentStartStackFrame(rootError) : null
}

function resolveSubtypeFromErrorChain(
  chain: unknown[],
): FertilizerEnrichmentStartInternalErrorSubtype {
  for (const item of chain) {
    if (item instanceof FertilizerEnrichmentJobRepositoryError) {
      return item.code === 'idempotency_conflict' ? 'job_creation' : 'supabase_persistence'
    }

    if (item instanceof FertilizerEnrichmentOrchestrationContractError) {
      return 'orchestration'
    }

    if (item instanceof FertilizerEnrichmentServerConfigurationError) {
      const message = item.message.toUpperCase()
      if (message.includes('SESSION') || message.includes('COOKIE') || message.includes('HMAC')) {
        return 'session_cookie'
      }

      return 'adapter_creation'
    }

    if (item instanceof Error) {
      const haystack = `${item.name} ${item.message} ${item.stack ?? ''}`
      if (haystack.includes('fertilizerEnrichmentHttpManufacturerFetchCore')) {
        return 'source_fetch'
      }
      if (haystack.includes('fertilizerManufacturerDocumentSourceValidatorCore')) {
        return 'source_validation'
      }
      if (haystack.includes('orchestrateFertilizerEnrichment')) {
        return 'orchestration'
      }
      if (haystack.includes('fertilizerEnrichmentSessionCookieCore')) {
        return 'session_cookie'
      }
      if (haystack.includes('createFertilizerEnrichmentOrchestrationDependencies')) {
        return 'adapter_creation'
      }
    }

    if (readSupabaseDiagnostic(item)) {
      return 'supabase_persistence'
    }
  }

  return 'unknown_runtime'
}

export function resolveFertilizerEnrichmentStartPhaseFromInternalSubtype(
  subtype: FertilizerEnrichmentStartInternalErrorSubtype,
): FertilizerEnrichmentStartFailurePhase {
  switch (subtype) {
    case 'job_creation':
      return 'job_creation'
    case 'supabase_persistence':
      return 'persistence'
    case 'session_cookie':
    case 'adapter_creation':
      return 'runtime_init'
    case 'source_validation':
      return 'request_validation'
    case 'source_fetch':
      return 'source_fetch'
    case 'orchestration':
      return 'orchestration'
    default:
      return 'unknown'
  }
}

function resolveRootErrorName(chain: unknown[]): string {
  for (const item of chain) {
    if (item instanceof Error) {
      return item.name
    }
  }

  if (chain[0] && typeof chain[0] === 'object' && 'name' in chain[0]) {
    const name = (chain[0] as Record<string, unknown>).name
    if (typeof name === 'string' && name.trim()) {
      return name.trim()
    }
  }

  return 'UnknownError'
}

function resolveInternalErrorCode(
  chain: unknown[],
  subtype: FertilizerEnrichmentStartInternalErrorSubtype,
): string {
  for (const item of chain) {
    if (item instanceof FertilizerEnrichmentJobRepositoryError) {
      return `repository_${item.code}`
    }

    if (item instanceof FertilizerEnrichmentServerApiError) {
      if (item.apiError.code !== 'internal_server_error') {
        return item.apiError.code
      }
    }

    if (item instanceof FertilizerEnrichmentOrchestrationContractError) {
      return 'orchestration_contract'
    }

    if (item instanceof FertilizerEnrichmentServerConfigurationError) {
      return 'configuration_incomplete'
    }

    const supabase = readSupabaseDiagnostic(item)
    if (supabase) {
      return `supabase_${supabase.code}`
    }
  }

  switch (subtype) {
    case 'job_creation':
      return 'job_creation_failed'
    case 'supabase_persistence':
      return 'persistence_failed'
    case 'session_cookie':
      return 'session_cookie_failed'
    case 'adapter_creation':
      return 'adapter_creation_failed'
    case 'source_validation':
      return 'source_validation_failed'
    case 'source_fetch':
      return 'source_fetch_failed'
    case 'orchestration':
      return 'orchestration_failed'
    default:
      return 'internal_server_error'
  }
}

function readCauseDiagnostic(error: unknown): FertilizerEnrichmentStartCauseDiagnostic | null {
  if (!(error instanceof Error)) {
    return null
  }

  const cause = readLinkedErrorCause(error)
  if (cause == null) {
    return null
  }
  const name =
    cause instanceof Error
      ? cause.name
      : typeof (cause as Record<string, unknown>).name === 'string'
        ? String((cause as Record<string, unknown>).name)
        : 'UnknownCause'

  const message =
    cause instanceof Error
      ? cause.message
      : typeof (cause as Record<string, unknown>).message === 'string'
        ? String((cause as Record<string, unknown>).message)
        : null

  return {
    name,
    code: readErrorCode(cause),
    safeMessage: sanitizeFertilizerEnrichmentStartDiagnosticMessage(message),
  }
}

export function analyzeFertilizerEnrichmentStartInternalError(
  error: unknown,
): FertilizerEnrichmentStartInternalErrorDiagnostic | null {
  if (error == null) {
    return null
  }

  const chain = unwrapFertilizerEnrichmentStartErrorChain(error)
  const subtype = resolveSubtypeFromErrorChain(chain)
  const rootError = chain.find((item): item is Error => item instanceof Error) ?? null

  let supabase: FertilizerEnrichmentStartSupabaseDiagnostic | null = null
  for (const item of [...chain].reverse()) {
    supabase = readSupabaseDiagnostic(item)
    if (supabase) {
      break
    }
  }

  return {
    subtype,
    rootErrorName: resolveRootErrorName(chain),
    internalErrorCode: resolveInternalErrorCode(chain, subtype),
    safeMessage: sanitizeFertilizerEnrichmentStartDiagnosticMessage(
      rootError?.message ??
        (typeof chain[0] === 'object' &&
        chain[0] &&
        'message' in chain[0] &&
        typeof (chain[0] as Record<string, unknown>).message === 'string'
          ? String((chain[0] as Record<string, unknown>).message)
          : null),
    ),
    stackFrame: readRelevantStackFrame(chain),
    cause: readCauseDiagnostic(rootError ?? error),
    supabase,
  }
}

export function resolveFertilizerEnrichmentStartFailurePhase(input: {
  httpStatus: number
  apiErrorCode?: string | null
  enrichmentStatus?: string | null
  failureReason?: string | null
  failedAdapters?: string[]
  internalError?: FertilizerEnrichmentStartInternalErrorDiagnostic | null
}): FertilizerEnrichmentStartFailurePhase {
  if (input.internalError) {
    return resolveFertilizerEnrichmentStartPhaseFromInternalSubtype(input.internalError.subtype)
  }

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
  internalError?: FertilizerEnrichmentStartInternalErrorDiagnostic | null
}): string {
  if (input.internalError) {
    return input.internalError.internalErrorCode
  }

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
    return 'configuration_incomplete'
  }

  if (input.error instanceof FertilizerEnrichmentServerApiError) {
    return input.error.apiError.code
  }

  if (input.httpStatus >= 500) {
    return 'internal_server_error'
  }

  return 'request_failed'
}

export function resolveFertilizerEnrichmentStartErrorName(
  error: unknown,
  internalError?: FertilizerEnrichmentStartInternalErrorDiagnostic | null,
): string {
  if (internalError?.rootErrorName) {
    return internalError.rootErrorName
  }

  if (error instanceof Error) {
    return error.name
  }

  if (error == null) {
    return 'EnrichmentStartFailure'
  }

  return 'UnknownError'
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
  phase?: FertilizerEnrichmentStartFailurePhase
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
  const internalError = analyzeFertilizerEnrichmentStartInternalError(input.error)
  const phase =
    input.phase ??
    resolveFertilizerEnrichmentStartFailurePhase({
      httpStatus: input.httpStatus,
      apiErrorCode,
      enrichmentStatus,
      failureReason,
      failedAdapters: readStringArray(jobResult?.failedAdapters),
      internalError,
    })

  const diagnostic: FertilizerEnrichmentStartFailureDiagnostic = {
    functionName: FERTILIZER_ENRICHMENT_START_FUNCTION_NAME,
    requestId: input.requestId,
    phase,
    errorName: resolveFertilizerEnrichmentStartErrorName(input.error, internalError),
    errorCode: resolveFertilizerEnrichmentStartSafeErrorCode({
      error: input.error,
      httpStatus: input.httpStatus,
      apiErrorCode,
      enrichmentStatus,
      failureReason,
      internalError,
    }),
    httpStatus: input.httpStatus,
  }

  if (internalError) {
    diagnostic.internalError = internalError
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
  requestBody?: string | null
  inputCounts: FertilizerEnrichmentStartInputCounts
  error?: unknown
  phaseOverride?: FertilizerEnrichmentStartFailurePhase
}): void {
  if (shouldLogFertilizerEnrichmentStartFailure(input)) {
    logFertilizerEnrichmentStartFailure(
      buildFertilizerEnrichmentStartFailureDiagnostic({
        requestId: input.requestId,
        phase: input.phaseOverride,
        error: input.error,
        httpStatus: input.httpStatus,
        responseBody: input.responseBody,
        inputCounts: input.inputCounts,
      }),
    )
  }

  if (shouldWarnFertilizerEnrichmentStartOutcome(input)) {
    const warning = buildFertilizerEnrichmentStartOutcomeWarningDiagnostic({
      requestId: input.requestId,
      httpStatus: input.httpStatus,
      responseBody: input.responseBody,
      requestBody: input.requestBody,
      inputCounts: input.inputCounts,
    })

    if (warning) {
      logFertilizerEnrichmentStartOutcomeWarning(warning)
    }
  }
}
