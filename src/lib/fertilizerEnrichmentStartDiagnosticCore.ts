import type { HandlerEvent } from '@netlify/functions'
import { FertilizerEnrichmentJobRepositoryError } from './fertilizerEnrichmentJobRepositoryCore'
import { FertilizerEnrichmentOrchestrationContractError } from './fertilizerEnrichmentOrchestrationCore'
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
  inputCounts: FertilizerEnrichmentStartInputCounts
  error?: unknown
  phaseOverride?: FertilizerEnrichmentStartFailurePhase
}): void {
  if (!shouldLogFertilizerEnrichmentStartFailure(input)) {
    return
  }

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
