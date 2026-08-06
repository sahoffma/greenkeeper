import { afterEach, describe, expect, it, vi } from 'vitest'
import { FertilizerEnrichmentServerConfigurationError } from './fertilizerEnrichmentServerEnvironmentCore'
import { FertilizerEnrichmentServerApiError } from './fertilizerEnrichmentServerServiceCore'
import {
  buildFertilizerEnrichmentStartFailureDiagnostic,
  diagnoseFertilizerEnrichmentStartResponse,
  extractSafeFertilizerEnrichmentStartInputCounts,
  logFertilizerEnrichmentStartFailure,
  resolveFertilizerEnrichmentStartFailurePhase,
  resolveFertilizerEnrichmentStartRequestId,
  resolveFertilizerEnrichmentStartSafeErrorCode,
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
    expect(
      resolveFertilizerEnrichmentStartSafeErrorCode({
        error: new FertilizerEnrichmentServerConfigurationError(
          'Fertilizer enrichment server configuration is incomplete (SUPABASE_SERVICE_ROLE_KEY).',
        ),
        httpStatus: 500,
      }),
    ).toBe('internal_server_error')
  })
})
