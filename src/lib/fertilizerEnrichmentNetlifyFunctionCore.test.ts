import { describe, expect, it, vi } from 'vitest'
import { createFertilizerEnrichmentNetlifyHandler } from './fertilizerEnrichmentNetlifyFunctionCore'
import { FertilizerEnrichmentJobRepositoryError } from './fertilizerEnrichmentJobRepositoryCore'
import { FertilizerEnrichmentServerConfigurationError } from './fertilizerEnrichmentServerEnvironmentCore'
import { FertilizerEnrichmentServerApiError } from './fertilizerEnrichmentServerServiceCore'
import type { FertilizerEnrichmentServerRuntime } from './fertilizerEnrichmentServerCompositionCore'
import type { FertilizerEnrichmentHttpResponse } from './fertilizerEnrichmentServerHandlerCore'
import { createFertilizerEnrichmentProductionHttpHandlers } from './fertilizerEnrichmentServerTransportCore'
import { createFertilizerEnrichmentSessionCookieManager } from './fertilizerEnrichmentSessionCookieCore'

const sessionCookieManager = createFertilizerEnrichmentSessionCookieManager('cookie-signing-secret', {
  maxAgeSeconds: 3600,
  secure: false,
})

function createMockRuntime() {
  const handlers = {
    handleStart: vi.fn(async (): Promise<FertilizerEnrichmentHttpResponse> => ({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: { jobId: 'job-1' } }),
    })),
    handleStatus: vi.fn(async (): Promise<FertilizerEnrichmentHttpResponse> => ({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: { jobId: 'job-1' } }),
    })),
    handleAdditionalSource: vi.fn(async (): Promise<FertilizerEnrichmentHttpResponse> => ({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: { jobId: 'job-1' } }),
    })),
    handleCancel: vi.fn(async (): Promise<FertilizerEnrichmentHttpResponse> => ({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: { jobId: 'job-1' } }),
    })),
  }

  return {
    handlers,
    isCompositionEnabled: () => true,
    environment: {
      supabaseUrl: 'https://example.supabase.co',
      supabaseServiceRoleKey: 'service-role-key',
      sessionAccessHmacSecret: 'hmac-secret',
      sessionCookieSigningSecret: 'cookie-signing-secret',
      sessionCookieSecure: false,
      sessionMaxAgeSeconds: 72 * 3600,
      retention: {
        continuableDays: 7,
        sessionMaxHours: 72,
        terminalDays: 30,
        intakeReadyDays: 14,
      },
    },
  } satisfies FertilizerEnrichmentServerRuntime
}

describe('fertilizerEnrichmentNetlifyFunctionCore', () => {
  it('Start entry point accepts POST and delegates to handler', async () => {
    const runtime = createMockRuntime()
    const handler = createFertilizerEnrichmentNetlifyHandler('start', () => runtime)

    const response = await handler(
      {
        httpMethod: 'POST',
        body: JSON.stringify({ idempotencyKey: 'idem-1', input: {} }),
        headers: {},
      } as never,
      {} as never,
    )

    expect(response?.statusCode).toBe(200)
    expect(runtime.handlers.handleStart).toHaveBeenCalledTimes(1)
  })

  it('Status entry point delegates to handler', async () => {
    const runtime = createMockRuntime()
    const handler = createFertilizerEnrichmentNetlifyHandler('status', () => runtime)

    await handler(
      {
        httpMethod: 'POST',
        body: JSON.stringify({ jobId: 'job-1' }),
        headers: {},
      } as never,
      {} as never,
    )

    expect(runtime.handlers.handleStatus).toHaveBeenCalledTimes(1)
  })

  it('Additional Source entry point delegates to handler', async () => {
    const runtime = createMockRuntime()
    const handler = createFertilizerEnrichmentNetlifyHandler('additionalSource', () => runtime)

    await handler(
      {
        httpMethod: 'POST',
        body: JSON.stringify({
          jobId: 'job-1',
          idempotencyKey: 'source-1',
          additionalSources: [],
        }),
        headers: {},
      } as never,
      {} as never,
    )

    expect(runtime.handlers.handleAdditionalSource).toHaveBeenCalledTimes(1)
  })

  it('Cancel entry point delegates to handler', async () => {
    const runtime = createMockRuntime()
    const handler = createFertilizerEnrichmentNetlifyHandler('cancel', () => runtime)

    await handler(
      {
        httpMethod: 'POST',
        body: JSON.stringify({ jobId: 'job-1' }),
        headers: {},
      } as never,
      {} as never,
    )

    expect(runtime.handlers.handleCancel).toHaveBeenCalledTimes(1)
  })

  it('TC-5 OPTIONS returns 204 without invoking handler or Set-Cookie', async () => {
    const runtime = createMockRuntime()
    const handler = createFertilizerEnrichmentNetlifyHandler('start', () => runtime)

    const response = await handler({ httpMethod: 'OPTIONS' } as never, {} as never)

    expect(response?.statusCode).toBe(204)
    expect(response?.headers?.['Set-Cookie']).toBeUndefined()
    expect(runtime.handlers.handleStart).not.toHaveBeenCalled()
  })

  it('configuration errors map to safe internal_server_error without secrets', async () => {
    const handler = createFertilizerEnrichmentNetlifyHandler('start', () => {
      throw new FertilizerEnrichmentServerConfigurationError(
        'Fertilizer enrichment server configuration is incomplete (SUPABASE_SERVICE_ROLE_KEY).',
      )
    })

    const response = await handler({ httpMethod: 'POST', body: '{}' } as never, {} as never)
    const payload = JSON.parse(String(response?.body))

    expect(response?.statusCode).toBe(500)
    expect(payload.error.code).toBe('internal_server_error')
    expect(JSON.stringify(payload)).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(JSON.stringify(payload)).not.toContain('service-role-key')
  })

  it('transport rejects client access context fields before handler delegation', async () => {
    const service = {
      startFertilizerEnrichment: vi.fn(),
      getFertilizerEnrichmentStatus: vi.fn(),
      provideAdditionalFertilizerEnrichmentSource: vi.fn(),
      cancelFertilizerEnrichment: vi.fn(),
    }

    const runtime: FertilizerEnrichmentServerRuntime = {
      handlers: createFertilizerEnrichmentProductionHttpHandlers({
        service,
        accessContextResolver: {
          authValidator: { validateBearerToken: async () => null },
          sessionCookieManager,
        },
      }),
      isCompositionEnabled: () => true,
      environment: createMockRuntime().environment,
    }

    const handler = createFertilizerEnrichmentNetlifyHandler('start', () => runtime)
    const response = await handler(
      {
        httpMethod: 'POST',
        body: JSON.stringify({
          idempotencyKey: 'idem-1',
          input: {},
          accessContext: { kind: 'session', sessionId: 'forged' },
        }),
        headers: {},
      } as never,
      {} as never,
    )

    expect(response?.statusCode).toBe(400)
    expect(service.startFertilizerEnrichment).not.toHaveBeenCalled()
  })

  it('LK-1: responses do not leak secrets or internal record fields', async () => {
    const runtime = createMockRuntime()
    runtime.handlers.handleStart.mockResolvedValue({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: {
          code: 'internal_server_error',
          message: 'Fertilizer enrichment server request failed unexpectedly.',
        },
      }),
    })

    const handler = createFertilizerEnrichmentNetlifyHandler('start', () => runtime)
    const response = await handler(
      {
        httpMethod: 'POST',
        body: JSON.stringify({ idempotencyKey: 'idem-1', input: {} }),
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'session=secret',
        },
      } as never,
      {} as never,
    )

    const serialized = JSON.stringify(response)
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('hmac-secret')
    expect(serialized).not.toContain('cookie-signing-secret')
    expect(serialized).not.toContain('service-role-key')
    expect(serialized).not.toContain('recordSchemaVersion')
    expect(serialized).not.toContain('orchestrationInput')
    expect(serialized).not.toContain('sessionAccessHash')
  })

  it('logs structured start failure diagnostics without leaking secrets', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const runtime = createMockRuntime()
    runtime.handlers.handleStart.mockResolvedValue({
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
    })

    const handler = createFertilizerEnrichmentNetlifyHandler('start', () => runtime)
    await handler(
      {
        httpMethod: 'POST',
        body: JSON.stringify({
          idempotencyKey: 'idem-1',
          input: {
            objectCategory: 'fertilizer',
            sourceHints: [{ adapterType: 'packaging' }],
            userProvidedSources: [{ kind: 'packaging_back_photo', referenceId: 'captureRecognitionLabel' }],
            captureInlineSourceTexts: {
              captureRecognitionLabel: 'Manufacturer: SecretCo\nNPK 0-0-30',
            },
          },
        }),
        headers: {
          authorization: 'Bearer secret-token',
          'x-nf-request-id': '40392437',
        },
      } as never,
      {} as never,
    )

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleWarn).toHaveBeenCalledTimes(1)
    const diagnostic = consoleError.mock.calls[0]?.[1] as Record<string, unknown>
    const warning = consoleWarn.mock.calls[0]?.[1] as Record<string, unknown>
    expect(diagnostic).toEqual(
      expect.objectContaining({
        functionName: 'fertilizer-enrichment-start',
        requestId: '40392437',
        phase: 'source_selection',
        errorCode: 'enrichment_no_viable_source',
        httpStatus: 200,
      }),
    )

    const serialized = JSON.stringify(diagnostic)
    const warningSerialized = JSON.stringify(warning)
    expect(serialized).not.toContain('secret-token')
    expect(serialized).not.toContain('SecretCo')
    expect(serialized).not.toContain('NPK 0-0-30')
    expect(warningSerialized).not.toContain('secret-token')
    expect(warningSerialized).not.toContain('SecretCo')
    expect(warningSerialized).not.toContain('NPK 0-0-30')
  })

  it('logs runtime_init diagnostics for configuration failures', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const handler = createFertilizerEnrichmentNetlifyHandler('start', () => {
      throw new FertilizerEnrichmentServerConfigurationError(
        'Fertilizer enrichment server configuration is incomplete (SUPABASE_SERVICE_ROLE_KEY).',
      )
    })

    await handler(
      {
        httpMethod: 'POST',
        body: '{}',
        headers: { 'x-nf-request-id': '40392437' },
      } as never,
      {} as never,
    )

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        functionName: 'fertilizer-enrichment-start',
        requestId: '40392437',
        phase: 'runtime_init',
        errorCode: 'configuration_incomplete',
        httpStatus: 500,
        internalError: expect.objectContaining({
          subtype: 'adapter_creation',
          rootErrorName: 'FertilizerEnrichmentServerConfigurationError',
        }),
      }),
    )
    expect(JSON.stringify(consoleError.mock.calls[0])).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
  })

  it('logs internal error diagnostics for HTTP 500 start failures with preserved cause chain', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const runtime = createMockRuntime()

    const supabaseError = {
      code: 'PGRST116',
      message: 'JSON object requested, multiple (or no) rows returned',
    }
    const repositoryError = new FertilizerEnrichmentJobRepositoryError(
      'persistence_unavailable',
      'Enrichment job persistence write failed.',
      { cause: supabaseError },
    )
    runtime.handlers.handleStart.mockResolvedValue({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: {
          code: 'internal_server_error',
          message: 'Fertilizer enrichment server request failed unexpectedly.',
        },
      }),
      diagnosticError: new FertilizerEnrichmentServerApiError(
        { code: 'internal_server_error', message: 'Fertilizer enrichment server request failed unexpectedly.' },
        500,
        { cause: repositoryError },
      ),
    } as FertilizerEnrichmentHttpResponse)

    const handler = createFertilizerEnrichmentNetlifyHandler('start', () => runtime)
    await handler(
      {
        httpMethod: 'POST',
        body: JSON.stringify({ idempotencyKey: 'idem-1', input: { objectCategory: 'fertilizer' } }),
        headers: { 'x-nf-request-id': 'a1baff1d' },
      } as never,
      {} as never,
    )

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        functionName: 'fertilizer-enrichment-start',
        requestId: 'a1baff1d',
        phase: 'persistence',
        errorCode: 'repository_persistence_unavailable',
        httpStatus: 500,
        internalError: expect.objectContaining({
          subtype: 'supabase_persistence',
          supabase: {
            code: 'PGRST116',
            target: null,
          },
        }),
      }),
    )

    const serialized = JSON.stringify(consoleError.mock.calls[0])
    expect(serialized).not.toContain('idem-1')
    expect(serialized).not.toContain('objectCategory')
  })
})
