import { describe, expect, it, vi } from 'vitest'
import { createInMemoryFertilizerEnrichmentJobRepository } from './fertilizerEnrichmentJobRepositoryCore'
import { createInMemoryFertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryCore'
import { createFertilizerProductProfileSaveHttpHandlers } from './fertilizerProductProfileSaveHandlerCore'
import { createFertilizerProductProfileSaveServerService } from './fertilizerProductProfileSaveServerServiceCore'
import {
  buildPhase5IntakeReadyResult,
  deriveTestSessionAccessHash,
  PHASE5_FIXED_NOW,
  PHASE5_SESSION_ID,
} from './fertilizerProductProfileSaveTestFixtures'

const ACCESS = { kind: 'session' as const, sessionId: PHASE5_SESSION_ID }
const TEST_EXPIRES_AT = '2026-08-05T10:00:00.000Z'

function buildHandlers(enabled = true) {
  const enrichmentJobRepository = createInMemoryFertilizerEnrichmentJobRepository()
  enrichmentJobRepository.state.byJobId.set('job-handler-1', {
    job: {
      jobId: 'job-handler-1',
      orchestrationRunId: 'orch-handler-1',
      idempotencyKey: 'enrichment-idem-1',
      accessContext: ACCESS,
      objectCategory: 'fertilizer',
      identityFingerprint: 'fp-handler-1',
      createdAt: PHASE5_FIXED_NOW,
      updatedAt: PHASE5_FIXED_NOW,
      expiresAt: TEST_EXPIRES_AT,
      result: buildPhase5IntakeReadyResult(),
    },
    orchestrationInput: {
      objectCategory: 'fertilizer',
      identity: {
        manufacturer: 'ICL',
        officialName: 'Spring Start',
        variant: null,
        identityFingerprint: 'fp-handler-1',
        identityConfidence: 1,
        hasIdentityAmbiguity: false,
      },
      allowedInputChannels: ['capture_flow'],
    },
    lastSourceProvisionIdempotencyKey: null,
    recordSchemaVersion: 1,
    revision: 1,
  })

  const service = createFertilizerProductProfileSaveServerService({
    enrichmentJobRepository,
    productProfileRepository: createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    }),
    deriveSessionAccessHash: deriveTestSessionAccessHash,
    now: () => PHASE5_FIXED_NOW,
  })

  return createFertilizerProductProfileSaveHttpHandlers({
    service: enabled ? service : null,
    isCompositionEnabled: () => enabled,
    buildAccessContext: async () => ACCESS,
  })
}

describe('fertilizerProductProfileSaveHandlerCore', () => {
  it('accepts POST and returns save response JSON', async () => {
    const handlers = buildHandlers()
    const response = await handlers.handleSave({
      httpMethod: 'POST',
      body: JSON.stringify({
        enrichmentJobId: 'job-handler-1',
        userConfirmed: true,
        idempotencyKey: 'save-handler-1',
      }),
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['Content-Type']).toBe('application/json')
    const payload = JSON.parse(response.body) as {
      profile: { officialName: string }
      reusedExistingVersion: boolean
    }
    expect(payload.profile.officialName).toBe('Spring Start')
    expect(payload.reusedExistingVersion).toBe(false)
  })

  it('rejects wrong HTTP method', async () => {
    const handlers = buildHandlers()
    const response = await handlers.handleSave({ httpMethod: 'GET' })

    expect(response.statusCode).toBe(405)
  })

  it('rejects missing user confirmation', async () => {
    const handlers = buildHandlers()
    const response = await handlers.handleSave({
      httpMethod: 'POST',
      body: JSON.stringify({
        enrichmentJobId: 'job-handler-1',
        userConfirmed: false,
        idempotencyKey: 'save-handler-2',
      }),
    })

    expect(response.statusCode).toBe(422)
    expect(JSON.parse(response.body).error.code).toBe('unconfirmed_save')
  })

  it('rejects missing idempotency key', async () => {
    const handlers = buildHandlers()
    const response = await handlers.handleSave({
      httpMethod: 'POST',
      body: JSON.stringify({
        enrichmentJobId: 'job-handler-1',
        userConfirmed: true,
        idempotencyKey: '   ',
      }),
    })

    expect(response.statusCode).toBe(400)
  })

  it('rejects forbidden client fields', async () => {
    const handlers = buildHandlers()
    const response = await handlers.handleSave({
      httpMethod: 'POST',
      body: JSON.stringify({
        enrichmentJobId: 'job-handler-1',
        userConfirmed: true,
        idempotencyKey: 'save-handler-3',
        pipelineResult: {},
      }),
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 503 when composition is disabled', async () => {
    const handlers = buildHandlers(false)
    const response = await handlers.handleSave({
      httpMethod: 'POST',
      body: JSON.stringify({
        enrichmentJobId: 'job-handler-1',
        userConfirmed: true,
        idempotencyKey: 'save-handler-4',
      }),
    })

    expect(response.statusCode).toBe(503)
  })

  it('does not invoke service when validation fails early', async () => {
    const save = vi.fn()
    const handlers = createFertilizerProductProfileSaveHttpHandlers({
      service: { saveFertilizerProductProfile: save },
      buildAccessContext: async () => ACCESS,
    })

    await handlers.handleSave({
      httpMethod: 'POST',
      body: JSON.stringify({
        enrichmentJobId: 'job-handler-1',
        userConfirmed: false,
        idempotencyKey: 'save-handler-5',
      }),
    })

    expect(save).not.toHaveBeenCalled()
  })
})
