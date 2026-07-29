import { describe, expect, it, vi } from 'vitest'
import {
  createInMemoryFertilizerEnrichmentJobRepository,
  serializedPublicJobHasNoInternalLeakage,
} from './fertilizerEnrichmentJobRepositoryCore'
import { createFertilizerEnrichmentHttpHandlers } from './fertilizerEnrichmentServerHandlerCore'
import {
  createFertilizerEnrichmentServerService,
  createTestOrchestrationDependencies,
} from './fertilizerEnrichmentServerServiceCore'
import type { FertilizerSourceAdapter } from './fertilizerEnrichmentOrchestrationCore'

const ACCESS = { kind: 'session' as const, sessionId: 'session-1' }
const FIXED_NOW = '2026-07-29T10:00:00.000Z'

function emptyTimeoutState() {
  return {
    kind: 'none' as const,
    startedAt: FIXED_NOW,
    timedOut: false,
    timedOutAdapters: [],
    completedAdapters: [],
    cancelledAdapters: [],
  }
}

function buildHandlers(adapters: FertilizerSourceAdapter[] = [], enabled = true) {
  const repository = createInMemoryFertilizerEnrichmentJobRepository()
  const service = createFertilizerEnrichmentServerService({
    repository,
    resolveOrchestrationDependencies: () => createTestOrchestrationDependencies(adapters),
    createJobId: () => 'job-handler-1',
    createOrchestrationRunId: () => 'orch-handler-1',
  })

  return createFertilizerEnrichmentHttpHandlers({
    service: enabled ? service : null,
    isCompositionEnabled: () => enabled,
    buildRequestContext: () => ({ sessionId: 'session-1', requestId: 'req-handler-1' }),
  })
}

describe('fertilizerEnrichmentServerHandlerCore', () => {
  it('handleStart accepts POST and returns job JSON', async () => {
    const handlers = buildHandlers()
    const response = await handlers.handleStart({
      httpMethod: 'POST',
      body: JSON.stringify({
        idempotencyKey: 'idem-handler',
        accessContext: ACCESS,
        input: {
          objectCategory: 'fertilizer',
          identity: {
            manufacturer: 'ICL',
            officialName: 'Spring Start',
            identityFingerprint: 'fp-handler',
            identityConfidence: 1,
            hasIdentityAmbiguity: false,
          },
          allowedInputChannels: ['capture_flow'],
        },
      }),
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['Content-Type']).toBe('application/json')
    const payload = JSON.parse(response.body) as { job: { jobId: string } }
    expect(payload.job.jobId).toBe('job-handler-1')
  })

  it('handleStart rejects wrong HTTP method', async () => {
    const handlers = buildHandlers()
    const response = await handlers.handleStart({ httpMethod: 'GET' })

    expect(response.statusCode).toBe(405)
    expect(JSON.parse(response.body).error.code).toBe('invalid_request')
  })

  it('handleStart rejects invalid JSON', async () => {
    const handlers = buildHandlers()
    const response = await handlers.handleStart({ httpMethod: 'POST', body: '{' })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error.code).toBe('invalid_request')
  })

  it('handleStart maps service API errors without stack traces', async () => {
    const handlers = buildHandlers()
    const response = await handlers.handleStart({
      httpMethod: 'POST',
      body: JSON.stringify({
        idempotencyKey: ' ',
        accessContext: ACCESS,
        input: {},
      }),
    })

    expect(response.statusCode).toBe(400)
    const payload = JSON.parse(response.body)
    expect(payload.error.code).toBe('invalid_request')
    expect(JSON.stringify(payload)).not.toContain('stack')
  })

  it('handleStart returns temporarily_unavailable when composition is disabled', async () => {
    const handlers = buildHandlers([], false)
    const response = await handlers.handleStart({
      httpMethod: 'POST',
      body: JSON.stringify({
        idempotencyKey: 'idem-disabled',
        accessContext: ACCESS,
        input: {
          objectCategory: 'fertilizer',
          identity: {
            identityFingerprint: 'fp',
            identityConfidence: 1,
            hasIdentityAmbiguity: false,
          },
          allowedInputChannels: ['capture_flow'],
        },
      }),
    })

    expect(response.statusCode).toBe(503)
    expect(JSON.parse(response.body).error.code).toBe('temporarily_unavailable')
  })

  it('handleStatus returns stored job', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    const service = createFertilizerEnrichmentServerService({
      repository,
      resolveOrchestrationDependencies: () => createTestOrchestrationDependencies([]),
      createJobId: () => 'job-status-1',
    })
    const handlers = createFertilizerEnrichmentHttpHandlers({
      service,
      buildRequestContext: () => ({ sessionId: 'session-1', requestId: 'req-status' }),
    })

    const started = await service.startFertilizerEnrichment(
      {
        idempotencyKey: 'idem-status',
        accessContext: ACCESS,
        input: {
          objectCategory: 'fertilizer',
          identity: {
            manufacturer: 'ICL',
            officialName: 'Spring Start',
            variant: '15-0-26',
            identityFingerprint: 'fp-status',
            identityConfidence: 1,
            hasIdentityAmbiguity: false,
          },
          allowedInputChannels: ['capture_flow'],
        },
      },
      { sessionId: 'session-1', requestId: 'req-status' },
    )

    const response = await handlers.handleStatus({
      httpMethod: 'POST',
      body: JSON.stringify({ jobId: started.jobId, accessContext: ACCESS }),
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body).job.jobId).toBe(started.jobId)
  })

  it('handleCancel returns cancelled job', async () => {
    const repository = createInMemoryFertilizerEnrichmentJobRepository()
    await repository.save({
      job: {
        jobId: 'job-cancel-handler',
        orchestrationRunId: 'orch-cancel-handler',
        idempotencyKey: 'idem-cancel-handler',
        accessContext: ACCESS,
        objectCategory: 'fertilizer',
        identityFingerprint: 'fp-cancel',
        createdAt: '2026-07-29T10:00:00.000Z',
        updatedAt: '2026-07-29T10:00:00.000Z',
        result: {
          orchestrationRunId: 'orch-cancel-handler',
          startedAt: '2026-07-29T10:00:00.000Z',
          completedAt: '2026-07-29T10:00:00.000Z',
          attemptedAdapters: [],
          successfulAdapters: [],
          failedAdapters: [],
          timeoutState: emptyTimeoutState(),
          technicalErrors: [],
          status: 'needs_input',
          recommendedNextAction: 'upload_product_document',
        },
      },
      orchestrationInput: {
        objectCategory: 'fertilizer',
        identity: {
          manufacturer: 'ICL',
          officialName: 'Spring Start',
          variant: null,
          identityFingerprint: 'fp-cancel',
          identityConfidence: 1,
          hasIdentityAmbiguity: false,
        },
        allowedInputChannels: ['capture_flow'],
      },
      lastSourceProvisionIdempotencyKey: null,
    })

    const service = createFertilizerEnrichmentServerService({
      repository,
      resolveOrchestrationDependencies: () => createTestOrchestrationDependencies([]),
    })
    const handlers = createFertilizerEnrichmentHttpHandlers({
      service,
      buildRequestContext: () => ({ sessionId: 'session-1', requestId: 'req-cancel' }),
    })

    const response = await handlers.handleCancel({
      httpMethod: 'POST',
      body: JSON.stringify({ jobId: 'job-cancel-handler', accessContext: ACCESS }),
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body).job.result.status).toBe('cancelled')
  })

  it('handleAdditionalSource normalizes unexpected service failures safely', async () => {
    const handlers = createFertilizerEnrichmentHttpHandlers({
      service: {
        startFertilizerEnrichment: vi.fn(),
        getFertilizerEnrichmentStatus: vi.fn(),
        provideAdditionalFertilizerEnrichmentSource: vi.fn(async () => {
          throw new Error('Sensitive handler failure')
        }),
        cancelFertilizerEnrichment: vi.fn(),
      },
      buildRequestContext: () => ({ sessionId: 'session-1', requestId: 'req-additional' }),
    })

    const response = await handlers.handleAdditionalSource({
      httpMethod: 'POST',
      body: JSON.stringify({
        jobId: 'job-1',
        accessContext: ACCESS,
        idempotencyKey: 'source-handler',
        additionalSources: [{ kind: 'product_document', referenceId: 'doc-1' }],
      }),
    })

    expect(response.statusCode).toBe(500)
    const payload = JSON.parse(response.body)
    expect(payload.error.code).toBe('internal_server_error')
    expect(payload.error.message).not.toContain('Sensitive')
  })

  describe('handler response leakage', () => {
    it('HL-1: handleStart JSON body contains only public job contract', async () => {
      const handlers = buildHandlers()
      const response = await handlers.handleStart({
        httpMethod: 'POST',
        body: JSON.stringify({
          idempotencyKey: 'idem-leak-handler-start',
          accessContext: ACCESS,
          input: {
            objectCategory: 'fertilizer',
            identity: {
              manufacturer: 'ICL',
              officialName: 'Spring Start',
              identityFingerprint: 'fp-leak-start',
              identityConfidence: 1,
              hasIdentityAmbiguity: false,
            },
            allowedInputChannels: ['capture_flow'],
          },
        }),
      })

      expect(response.statusCode).toBe(200)
      expect(serializedPublicJobHasNoInternalLeakage(response.body)).toBe(true)
    })

    it('HL-2: handleStatus JSON body contains only public job contract', async () => {
      const repository = createInMemoryFertilizerEnrichmentJobRepository()
      const service = createFertilizerEnrichmentServerService({
        repository,
        resolveOrchestrationDependencies: () => createTestOrchestrationDependencies([]),
        createJobId: () => 'job-leak-status',
      })
      const handlers = createFertilizerEnrichmentHttpHandlers({
        service,
        buildRequestContext: () => ({ sessionId: 'session-1', requestId: 'req-leak-status' }),
      })

      const started = await service.startFertilizerEnrichment(
        {
          idempotencyKey: 'idem-leak-status',
          accessContext: ACCESS,
          input: {
            objectCategory: 'fertilizer',
            identity: {
              manufacturer: 'ICL',
              officialName: 'Spring Start',
              variant: null,
              identityFingerprint: 'fp-leak-status',
              identityConfidence: 1,
              hasIdentityAmbiguity: false,
            },
            allowedInputChannels: ['capture_flow'],
          },
        },
        { sessionId: 'session-1', requestId: 'req-leak-status' },
      )

      const response = await handlers.handleStatus({
        httpMethod: 'POST',
        body: JSON.stringify({ jobId: started.jobId, accessContext: ACCESS }),
      })

      expect(response.statusCode).toBe(200)
      expect(serializedPublicJobHasNoInternalLeakage(response.body)).toBe(true)
    })

    it('HL-3: handleAdditionalSource JSON body contains only public job contract', async () => {
      const repository = createInMemoryFertilizerEnrichmentJobRepository()
      await repository.save({
        job: {
          jobId: 'job-leak-additional',
          orchestrationRunId: 'orch-leak-additional',
          idempotencyKey: 'idem-leak-additional',
          accessContext: ACCESS,
          objectCategory: 'fertilizer',
          identityFingerprint: 'fp-leak-additional',
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW,
          result: {
            orchestrationRunId: 'orch-leak-additional',
            startedAt: FIXED_NOW,
            completedAt: FIXED_NOW,
            attemptedAdapters: [],
            successfulAdapters: [],
            failedAdapters: [],
            timeoutState: emptyTimeoutState(),
            technicalErrors: [],
            status: 'needs_input',
            recommendedNextAction: 'upload_product_document',
          },
        },
        orchestrationInput: {
          objectCategory: 'fertilizer',
          identity: {
            manufacturer: 'ICL',
            officialName: 'Spring Start',
            variant: null,
            identityFingerprint: 'fp-leak-additional',
            identityConfidence: 1,
            hasIdentityAmbiguity: false,
          },
          allowedInputChannels: ['capture_flow'],
        },
      })

      const service = createFertilizerEnrichmentServerService({
        repository,
        resolveOrchestrationDependencies: () => createTestOrchestrationDependencies([]),
        createOrchestrationRunId: () => 'orch-leak-additional-2',
      })
      const handlers = createFertilizerEnrichmentHttpHandlers({
        service,
        buildRequestContext: () => ({ sessionId: 'session-1', requestId: 'req-leak-additional' }),
      })

      const response = await handlers.handleAdditionalSource({
        httpMethod: 'POST',
        body: JSON.stringify({
          jobId: 'job-leak-additional',
          accessContext: ACCESS,
          idempotencyKey: 'source-leak-handler',
          additionalSources: [{ kind: 'product_document', referenceId: 'doc-leak-handler' }],
        }),
      })

      expect(response.statusCode).toBe(200)
      expect(serializedPublicJobHasNoInternalLeakage(response.body)).toBe(true)
    })

    it('HL-4: handleCancel JSON body contains only public job contract', async () => {
      const repository = createInMemoryFertilizerEnrichmentJobRepository()
      await repository.save({
        job: {
          jobId: 'job-leak-cancel',
          orchestrationRunId: 'orch-leak-cancel',
          idempotencyKey: 'idem-leak-cancel',
          accessContext: ACCESS,
          objectCategory: 'fertilizer',
          identityFingerprint: 'fp-leak-cancel',
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW,
          result: {
            orchestrationRunId: 'orch-leak-cancel',
            startedAt: FIXED_NOW,
            completedAt: FIXED_NOW,
            attemptedAdapters: [],
            successfulAdapters: [],
            failedAdapters: [],
            timeoutState: emptyTimeoutState(),
            technicalErrors: [],
            status: 'needs_input',
            recommendedNextAction: 'upload_product_document',
          },
        },
        orchestrationInput: {
          objectCategory: 'fertilizer',
          identity: {
            manufacturer: 'ICL',
            officialName: 'Spring Start',
            variant: null,
            identityFingerprint: 'fp-leak-cancel',
            identityConfidence: 1,
            hasIdentityAmbiguity: false,
          },
          allowedInputChannels: ['capture_flow'],
        },
      })

      const service = createFertilizerEnrichmentServerService({
        repository,
        resolveOrchestrationDependencies: () => createTestOrchestrationDependencies([]),
      })
      const handlers = createFertilizerEnrichmentHttpHandlers({
        service,
        buildRequestContext: () => ({ sessionId: 'session-1', requestId: 'req-leak-cancel' }),
      })

      const response = await handlers.handleCancel({
        httpMethod: 'POST',
        body: JSON.stringify({ jobId: 'job-leak-cancel', accessContext: ACCESS }),
      })

      expect(response.statusCode).toBe(200)
      expect(serializedPublicJobHasNoInternalLeakage(response.body)).toBe(true)
    })
  })
})
