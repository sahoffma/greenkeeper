import { afterEach, describe, expect, it, vi } from 'vitest'
import { FertilizerEnrichmentJobRepositoryError } from './fertilizerEnrichmentJobRepositoryCore'
import { FertilizerEnrichmentOrchestrationContractError } from './fertilizerEnrichmentOrchestrationCore'
import { FertilizerEnrichmentServerConfigurationError } from './fertilizerEnrichmentServerEnvironmentCore'
import { FertilizerEnrichmentServerApiError } from './fertilizerEnrichmentServerServiceCore'
import {
  analyzeFertilizerEnrichmentStartInternalError,
  buildFertilizerEnrichmentStartFailureDiagnostic,
  diagnoseFertilizerEnrichmentStartResponse,
  extractSafeFertilizerEnrichmentStartInputCounts,
  logFertilizerEnrichmentStartFailure,
  resolveFertilizerEnrichmentStartFailurePhase,
  resolveFertilizerEnrichmentStartRequestId,
  sanitizeFertilizerEnrichmentStartDiagnosticMessage,
} from './fertilizerEnrichmentStartDiagnosticCore'

describe('fertilizerEnrichmentStartDiagnosticCore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('extracts request id from Netlify headers', () => {
    expect(
      resolveFertilizerEnrichmentStartRequestId({
        headers: { 'x-nf-request-id': '40392437' },
      }),
    ).toBe('40392437')
  })

  it('counts input sources without reading source contents', () => {
    const counts = extractSafeFertilizerEnrichmentStartInputCounts(
      JSON.stringify({
        idempotencyKey: 'idem-1',
        input: {
          objectCategory: 'fertilizer',
          sourceHints: [{ adapterType: 'manufacturer_product_document' }],
          userProvidedSources: [{ kind: 'packaging_back_photo', referenceId: 'captureRecognitionLabel' }],
          captureInlineSourceTexts: {
            captureRecognitionLabel: 'Manufacturer: SecretCo\nNPK 0-0-30',
          },
        },
      }),
    )

    expect(counts).toEqual({
      sourceHintCount: 1,
      userProvidedSourceCount: 1,
      captureInlineSourceTextCount: 1,
    })
  })

  it('builds diagnostic with phase and safe error code for no_viable_source', () => {
    const diagnostic = buildFertilizerEnrichmentStartFailureDiagnostic({
      requestId: '40392437',
      phase: 'source_selection',
      httpStatus: 200,
      responseBody: JSON.stringify({
        job: {
          jobId: 'job-1',
          result: {
            status: 'failed',
            failureReason: 'no_viable_source',
            attemptedAdapters: ['manufacturer_product_document', 'packaging'],
            successfulAdapters: [],
            failedAdapters: ['manufacturer_product_document'],
          },
        },
      }),
      inputCounts: {
        sourceHintCount: 2,
        userProvidedSourceCount: 1,
        captureInlineSourceTextCount: 1,
      },
    })

    expect(diagnostic.phase).toBe('source_selection')
    expect(diagnostic.errorCode).toBe('enrichment_no_viable_source')
    expect(diagnostic.enrichmentResult).toEqual(
      expect.objectContaining({
        status: 'failed',
        failureReason: 'no_viable_source',
        sourceHintCount: 2,
        userProvidedSourceCount: 1,
        captureInlineSourceTextCount: 1,
        selectedAdapterTypes: ['manufacturer_product_document', 'packaging'],
      }),
    )
  })

  it('distinguishes unexpected runtime failures from no_viable_source', () => {
    const runtimeDiagnostic = buildFertilizerEnrichmentStartFailureDiagnostic({
      requestId: '40392437',
      phase: 'unknown',
      error: new Error('adapter exploded'),
      httpStatus: 500,
      responseBody: JSON.stringify({
        error: { code: 'internal_server_error', message: 'unexpected' },
      }),
    })

    const noSourceDiagnostic = buildFertilizerEnrichmentStartFailureDiagnostic({
      requestId: '40392437',
      phase: 'source_selection',
      httpStatus: 200,
      responseBody: JSON.stringify({
        job: {
          jobId: 'job-1',
          result: {
            status: 'failed',
            failureReason: 'no_viable_source',
            attemptedAdapters: [],
            successfulAdapters: [],
            failedAdapters: [],
          },
        },
      }),
    })

    expect(runtimeDiagnostic.errorCode).toBe('internal_server_error')
    expect(runtimeDiagnostic.errorName).toBe('Error')
    expect(noSourceDiagnostic.errorCode).toBe('enrichment_no_viable_source')
    expect(noSourceDiagnostic.phase).toBe('source_selection')
  })

  it('resolves source_fetch phase when manufacturer adapter failed', () => {
    expect(
      resolveFertilizerEnrichmentStartFailurePhase({
        httpStatus: 200,
        enrichmentStatus: 'failed',
        failureReason: 'technical_failure',
        failedAdapters: ['manufacturer_product_document'],
      }),
    ).toBe('source_fetch')
  })

  it('does not log secrets, headers, or inline source text', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    logFertilizerEnrichmentStartFailure(
      buildFertilizerEnrichmentStartFailureDiagnostic({
        requestId: '40392437',
        phase: 'request_validation',
        error: new FertilizerEnrichmentServerApiError(
          { code: 'invalid_request', message: 'input is required.' },
          400,
        ),
        httpStatus: 400,
        responseBody: JSON.stringify({
          error: { code: 'invalid_request', message: 'input is required.' },
        }),
        inputCounts: {
          sourceHintCount: 1,
          userProvidedSourceCount: 1,
          captureInlineSourceTextCount: 1,
        },
      }),
    )

    const serialized = JSON.stringify(consoleError.mock.calls[0])

    expect(serialized).toContain('request_validation')
    expect(serialized).toContain('invalid_request')
    expect(serialized).not.toContain('Bearer secret-token')
    expect(serialized).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(serialized).not.toContain('Manufacturer: SecretCo')
    expect(serialized).not.toContain('captureInlineSourceTexts')
    expect(serialized).not.toContain('NPK 0-0-30')
  })

  it('logs structured diagnosis for failed enrichment responses', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    diagnoseFertilizerEnrichmentStartResponse({
      requestId: '40392437',
      httpStatus: 200,
      responseBody: JSON.stringify({
        job: {
          jobId: 'job-1',
          result: {
            status: 'failed',
            failureReason: 'no_viable_source',
            attemptedAdapters: ['packaging'],
            successfulAdapters: [],
            failedAdapters: [],
          },
        },
      }),
      inputCounts: {
        sourceHintCount: 1,
        userProvidedSourceCount: 1,
        captureInlineSourceTextCount: 1,
      },
    })

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        functionName: 'fertilizer-enrichment-start',
        requestId: '40392437',
        phase: 'source_selection',
        errorCode: 'enrichment_no_viable_source',
        httpStatus: 200,
      }),
    )
  })

  it('maps configuration failures to runtime_init error code', () => {
    const diagnostic = buildFertilizerEnrichmentStartFailureDiagnostic({
      requestId: '40392437',
      error: new FertilizerEnrichmentServerConfigurationError(
        'Fertilizer enrichment server configuration is incomplete (SUPABASE_SERVICE_ROLE_KEY).',
      ),
      httpStatus: 500,
      responseBody: JSON.stringify({
        error: { code: 'internal_server_error', message: 'unexpected' },
      }),
    })

    expect(diagnostic.phase).toBe('runtime_init')
    expect(diagnostic.errorCode).toBe('configuration_incomplete')
    expect(diagnostic.internalError).toEqual(
      expect.objectContaining({
        subtype: 'adapter_creation',
        rootErrorName: 'FertilizerEnrichmentServerConfigurationError',
        internalErrorCode: 'configuration_incomplete',
      }),
    )
  })

  it('diagnoses wrapped Supabase persistence errors with safe supabase metadata', () => {
    const supabaseError = {
      code: '23505',
      message:
        'duplicate key value violates unique constraint on relation "fertilizer_enrichment_jobs"',
      details: 'Key (idempotency_key)=(idem-secret) already exists.',
    }
    const repositoryError = new FertilizerEnrichmentJobRepositoryError(
      'persistence_unavailable',
      'Enrichment job persistence write failed.',
      { cause: supabaseError },
    )
    const apiError = new FertilizerEnrichmentServerApiError(
      { code: 'internal_server_error', message: 'Fertilizer enrichment server request failed unexpectedly.' },
      500,
      { cause: repositoryError },
    )

    const diagnostic = buildFertilizerEnrichmentStartFailureDiagnostic({
      requestId: 'a1baff1d',
      error: apiError,
      httpStatus: 500,
      responseBody: JSON.stringify({
        error: { code: 'internal_server_error', message: 'Fertilizer enrichment server request failed unexpectedly.' },
      }),
    })

    expect(diagnostic.phase).toBe('persistence')
    expect(diagnostic.errorName).toBe('FertilizerEnrichmentServerApiError')
    expect(diagnostic.errorCode).toBe('repository_persistence_unavailable')
    expect(diagnostic.internalError).toEqual(
      expect.objectContaining({
        subtype: 'supabase_persistence',
        internalErrorCode: 'repository_persistence_unavailable',
        supabase: {
          code: '23505',
          target: 'fertilizer_enrichment_jobs',
        },
        cause: expect.objectContaining({
          name: 'FertilizerEnrichmentJobRepositoryError',
          safeMessage: 'Enrichment job persistence write failed.',
        }),
      }),
    )

    const serialized = JSON.stringify(diagnostic)
    expect(serialized).not.toContain('idem-secret')
    expect(serialized).not.toContain('duplicate key value')
  })

  it('diagnoses job creation failures from idempotency conflicts', () => {
    const diagnostic = buildFertilizerEnrichmentStartFailureDiagnostic({
      requestId: 'a1baff1d',
      error: new FertilizerEnrichmentJobRepositoryError(
        'idempotency_conflict',
        'Enrichment job idempotency conflict.',
      ),
      httpStatus: 409,
      responseBody: JSON.stringify({
        error: { code: 'idempotency_conflict', message: 'Enrichment job idempotency conflict.' },
      }),
    })

    expect(diagnostic.phase).toBe('job_creation')
    expect(diagnostic.errorCode).toBe('repository_idempotency_conflict')
    expect(diagnostic.internalError).toEqual(
      expect.objectContaining({
        subtype: 'job_creation',
        rootErrorName: 'FertilizerEnrichmentJobRepositoryError',
        internalErrorCode: 'repository_idempotency_conflict',
      }),
    )
  })

  it('diagnoses orchestration failures with first relevant stack frame', () => {
    const orchestrationError = new FertilizerEnrichmentOrchestrationContractError('fertilizer')
    orchestrationError.stack = [
      'FertilizerEnrichmentOrchestrationContractError: fertilizer',
      '    at orchestrateFertilizerEnrichment (/Users/test/greenkeeper/src/lib/fertilizerEnrichmentOrchestrationCore.ts:502:11)',
      '    at Object.startEnrichment (/Users/test/greenkeeper/src/lib/fertilizerEnrichmentServerServiceCore.ts:820:5)',
    ].join('\n')

    const diagnostic = buildFertilizerEnrichmentStartFailureDiagnostic({
      requestId: 'a1baff1d',
      error: new FertilizerEnrichmentServerApiError(
        { code: 'internal_server_error', message: 'Fertilizer enrichment server request failed unexpectedly.' },
        500,
        { cause: orchestrationError },
      ),
      httpStatus: 500,
      responseBody: JSON.stringify({
        error: { code: 'internal_server_error', message: 'Fertilizer enrichment server request failed unexpectedly.' },
      }),
    })

    expect(diagnostic.phase).toBe('orchestration')
    expect(diagnostic.errorCode).toBe('orchestration_contract')
    expect(diagnostic.internalError).toEqual(
      expect.objectContaining({
        subtype: 'orchestration',
        rootErrorName: 'FertilizerEnrichmentServerApiError',
        stackFrame: {
          file: 'fertilizerEnrichmentOrchestrationCore.ts',
          function: 'orchestrateFertilizerEnrichment',
        },
        cause: expect.objectContaining({
          name: 'FertilizerEnrichmentOrchestrationContractError',
        }),
      }),
    )

    const serialized = JSON.stringify(diagnostic)
    expect(serialized).not.toContain('/Users/test/greenkeeper')
  })

  it('preserves cause metadata for wrapped runtime errors', () => {
    const rootCause = Object.assign(new Error('storage bucket missing'), {
      code: 'storage_not_found',
    })
    const wrapped = new FertilizerEnrichmentServerApiError(
      { code: 'internal_server_error', message: 'Fertilizer enrichment server request failed unexpectedly.' },
      500,
      { cause: rootCause },
    )

    const internalError = analyzeFertilizerEnrichmentStartInternalError(wrapped)

    expect(internalError).toEqual(
      expect.objectContaining({
        rootErrorName: 'FertilizerEnrichmentServerApiError',
        cause: {
          name: 'Error',
          code: 'storage_not_found',
          safeMessage: 'storage bucket missing',
        },
      }),
    )
  })

  it('sanitizes sensitive fragments from diagnostic messages', () => {
    expect(
      sanitizeFertilizerEnrichmentStartDiagnosticMessage(
        'Auth failed Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig for /Users/me/greenkeeper/src/lib/foo.ts',
      ),
    ).toBe('Auth failed [redacted] for [path]')
  })

  it('does not log secrets, cookies, tokens, bodies, or source text in internal error diagnostics', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const supabaseError = {
      code: '42501',
      message: 'permission denied for relation "fertilizer_enrichment_jobs"',
    }
    const repositoryError = new FertilizerEnrichmentJobRepositoryError(
      'persistence_unavailable',
      'Failed to insert enrichment job. Bearer secret-token session=cookie-value',
      { cause: supabaseError },
    )

    logFertilizerEnrichmentStartFailure(
      buildFertilizerEnrichmentStartFailureDiagnostic({
        requestId: '40392437',
        error: new FertilizerEnrichmentServerApiError(
          { code: 'internal_server_error', message: 'Fertilizer enrichment server request failed unexpectedly.' },
          500,
          { cause: repositoryError },
        ),
        httpStatus: 500,
        responseBody: JSON.stringify({
          error: { code: 'internal_server_error', message: 'Fertilizer enrichment server request failed unexpectedly.' },
        }),
        inputCounts: {
          sourceHintCount: 1,
          userProvidedSourceCount: 1,
          captureInlineSourceTextCount: 1,
        },
      }),
    )

    const serialized = JSON.stringify(consoleError.mock.calls[0])

    expect(serialized).toContain('supabase_persistence')
    expect(serialized).toContain('42501')
    expect(serialized).toContain('fertilizer_enrichment_jobs')
    expect(serialized).not.toContain('Bearer secret-token')
    expect(serialized).not.toContain('cookie-value')
    expect(serialized).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(serialized).not.toContain('Manufacturer: SecretCo')
    expect(serialized).not.toContain('captureInlineSourceTexts')
    expect(serialized).not.toContain('NPK 0-0-30')
    expect(serialized).not.toContain('permission denied for relation')
  })
})
