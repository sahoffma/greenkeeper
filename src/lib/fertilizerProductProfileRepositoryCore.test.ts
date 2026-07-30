import { describe, expect, it } from 'vitest'
import type { FertilizerSavedProductProfile } from '../types/fertilizerProductProfile'
import {
  FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE,
  FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS,
  FERTILIZER_COMPOSITION_FINGERPRINT_VERSION,
} from '../types/fertilizerProductProfile'
import {
  FertilizerProductProfileRepositoryError,
  createInMemoryFertilizerProductProfileRepository,
} from './fertilizerProductProfileRepositoryCore'
import {
  deriveTestSessionAccessHash,
  PHASE5_SESSION_HASH,
  PHASE5_SESSION_ID,
} from './fertilizerProductProfileSaveTestFixtures'

const USER_A = 'user-a'
const USER_B = 'user-b'

function buildSavedProfile(overrides: Partial<FertilizerSavedProductProfile> = {}): FertilizerSavedProductProfile {
  return {
    id: overrides.id ?? 'profile-1',
    accessKind: 'authenticated_user',
    userId: USER_A,
    sessionAccessHash: null,
    productFamilyKey: 'icl|professional|spring start|15-0-26',
    identityFingerprint: 'icl-spring-start',
    manufacturer: 'ICL',
    productLine: 'Professional',
    officialName: 'Spring Start',
    variant: '15-0-26',
    productForm: 'granular',
    npkDeclaration: '15-0-26',
    nitrogen: 15,
    phosphate: 0,
    potash: 26,
    nutrientMatrix: {},
    compositionFingerprintVersion: FERTILIZER_COMPOSITION_FINGERPRINT_VERSION,
    compositionFingerprint: 'abc123',
    provenance: { confirmedAt: '2026-07-31T10:00:00.000Z' },
    saveIdempotencyKey: 'idem-1',
    source: FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE,
    profileStatus: FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS,
    verificationStatus: 'verified',
    createdAt: '2026-07-31T10:00:00.000Z',
    ...overrides,
  }
}

describe('fertilizerProductProfileRepositoryCore', () => {
  it('PR-1: finds existing identical version', async () => {
    const repository = createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    })
    const profile = buildSavedProfile()
    await repository.saveNewVersion(profile, { kind: 'authenticated_user', userId: USER_A })

    const found = await repository.findByIdentityAndCompositionFingerprint(
      {
        productFamilyKey: profile.productFamilyKey,
        compositionFingerprintVersion: profile.compositionFingerprintVersion,
        compositionFingerprint: profile.compositionFingerprint,
      },
      { kind: 'authenticated_user', userId: USER_A },
    )

    expect(found?.id).toBe(profile.id)
  })

  it('PR-2: inserts a new version exactly once', async () => {
    const repository = createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    })
    const profile = buildSavedProfile({ id: 'new-profile' })

    await repository.saveNewVersion(profile, { kind: 'authenticated_user', userId: USER_A })

    expect(repository.state.byId.size).toBe(1)
  })

  it('PR-3: never mutates existing fachliche fields', async () => {
    const repository = createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    })
    const profile = buildSavedProfile({ nitrogen: 15 })
    await repository.saveNewVersion(profile, { kind: 'authenticated_user', userId: USER_A })

    const duplicateAttempt = buildSavedProfile({
      id: 'profile-2',
      saveIdempotencyKey: 'idem-2',
      nitrogen: 29,
      compositionFingerprint: profile.compositionFingerprint,
    })

    const reused = await repository.saveNewVersion(duplicateAttempt, {
      kind: 'authenticated_user',
      userId: USER_A,
    })

    expect(reused.nitrogen).toBe(15)
    expect(repository.state.byId.size).toBe(1)
  })

  it('PR-4: parallel identical insert reloads existing version on unique conflict', async () => {
    const repository = createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    })
    const profile = buildSavedProfile({ id: 'parallel-1', saveIdempotencyKey: 'parallel-idem' })
    await repository.saveNewVersion(profile, { kind: 'authenticated_user', userId: USER_A })

    const conflicting = buildSavedProfile({
      id: 'parallel-2',
      saveIdempotencyKey: 'parallel-idem-2',
    })

    const reloaded = await repository.saveNewVersion(conflicting, {
      kind: 'authenticated_user',
      userId: USER_A,
    })

    expect(reloaded.id).toBe('parallel-1')
  })

  it('PR-5: parallel abweichende Version erlaubt separate Versionen', async () => {
    const repository = createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    })

    await repository.saveNewVersion(buildSavedProfile({ id: 'v1', compositionFingerprint: 'fp-1' }), {
      kind: 'authenticated_user',
      userId: USER_A,
    })
    await repository.saveNewVersion(
      buildSavedProfile({
        id: 'v2',
        compositionFingerprint: 'fp-2',
        saveIdempotencyKey: 'idem-2',
      }),
      { kind: 'authenticated_user', userId: USER_A },
    )

    expect(repository.state.byId.size).toBe(2)
  })

  it('PR-6: foreign private profile is not visible', async () => {
    const repository = createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    })
    const profile = buildSavedProfile({ userId: USER_A })
    await repository.saveNewVersion(profile, { kind: 'authenticated_user', userId: USER_A })

    const foreign = await repository.getById(profile.id, {
      kind: 'authenticated_user',
      userId: USER_B,
    })

    expect(foreign).toBeNull()
  })

  it('PR-7: session scope respects session HMAC boundary', async () => {
    const repository = createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    })
    const profile = buildSavedProfile({
      id: 'session-profile',
      accessKind: 'session',
      userId: null,
      sessionAccessHash: PHASE5_SESSION_HASH,
      saveIdempotencyKey: 'session-idem',
    })

    await repository.saveNewVersion(profile, { kind: 'session', sessionId: PHASE5_SESSION_ID })

    const sameSession = await repository.getById(profile.id, {
      kind: 'session',
      sessionId: PHASE5_SESSION_ID,
    })
    const otherSession = await repository.getById(profile.id, {
      kind: 'session',
      sessionId: 'other-session',
    })

    expect(sameSession?.id).toBe(profile.id)
    expect(otherSession).toBeNull()
  })

  it('PR-8: stored profile JSON shape contains no raw session id', async () => {
    const profile = buildSavedProfile({
      accessKind: 'session',
      userId: null,
      sessionAccessHash: PHASE5_SESSION_HASH,
    })

    const serialized = JSON.stringify(profile)
    expect(serialized.includes(PHASE5_SESSION_ID)).toBe(false)
    expect(serialized.includes(PHASE5_SESSION_HASH)).toBe(true)
  })

  it('PR-9: invalid stored record throws controlled error', async () => {
    const repository = createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    })

    await expect(
      repository.saveNewVersion(
        buildSavedProfile({
          accessKind: 'session',
          userId: USER_A,
          sessionAccessHash: 'not-a-valid-hash',
        }),
        { kind: 'session', sessionId: PHASE5_SESSION_ID },
      ),
    ).rejects.toBeInstanceOf(FertilizerProductProfileRepositoryError)
  })
})
