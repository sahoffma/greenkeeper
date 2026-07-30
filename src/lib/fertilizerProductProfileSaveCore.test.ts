import { describe, expect, it, vi } from 'vitest'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerDeclarationNormalization'
import { computeFertilizerCompositionFingerprint } from './fertilizerCompositionFingerprintCore'
import { projectFertilizerProductVersionFromPipeline } from './fertilizerProductVersionProjectionCore'
import {
  saveConfirmedFertilizerProductProfile,
} from './fertilizerProductProfileSaveCore'
import type { FertilizerReadinessReadyResult } from '../types/fertilizerEnrichmentOrchestration'
import { createInMemoryFertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryCore'
import {
  assertNoSensitiveLeakage,
  buildPhase5IntakeReadyResult,
  buildPhase5PipelineReadyResult,
  buildPhase5RawInput,
  deriveTestSessionAccessHash,
  rawDeclared,
  rawNotDeclared,
  PHASE5_FIXED_NOW,
  PHASE5_SESSION_HASH,
  PHASE5_SESSION_ID,
  withNpk,
} from './fertilizerProductProfileSaveTestFixtures'

const ACCESS = { kind: 'session' as const, sessionId: PHASE5_SESSION_ID }

function createSaveDependencies() {
  let counter = 0
  return {
    repository: createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    }),
    deriveSessionAccessHash: deriveTestSessionAccessHash,
    now: () => PHASE5_FIXED_NOW,
    createId: () => `profile-id-${++counter}`,
  }
}

describe('saveConfirmedFertilizerProductProfile', () => {
  it('PS-1: confirmed save-ready intake returns public product profile', async () => {
    const result = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'save-idem-1',
      },
      createSaveDependencies(),
    )

    expect(result.publicProfile.officialName).toBe('Spring Start')
    expect(result.publicProfile.npkDeclaration).toBe('15-0-26')
    expect(result.reusedExistingVersion).toBe(false)
  })

  it('PS-2: unconfirmed save performs no repository write', async () => {
    const dependencies = createSaveDependencies()

    await expect(
      saveConfirmedFertilizerProductProfile(
        {
          intakeReadyResult: buildPhase5IntakeReadyResult(),
          accessContext: ACCESS,
          userConfirmed: false,
          idempotencyKey: 'save-idem-2',
        },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: 'unconfirmed_save' })

    expect(dependencies.repository.state.byId.size).toBe(0)
  })

  it('PS-3: not-ready enrichment performs no write', async () => {
    const dependencies = createSaveDependencies()
    const intake = buildPhase5IntakeReadyResult()
    intake.pipelineResult.readinessResult = {
      ...intake.pipelineResult.readinessResult,
      status: 'needs_input',
      missingRequirements: ['basis.npk'],
    } as FertilizerReadinessReadyResult

    await expect(
      saveConfirmedFertilizerProductProfile(
        {
          intakeReadyResult: intake,
          accessContext: ACCESS,
          userConfirmed: true,
          idempotencyKey: 'save-idem-3',
        },
        dependencies,
      ),
    ).rejects.toMatchObject({ code: 'not_save_ready' })

    expect(dependencies.repository.state.byId.size).toBe(0)
  })

  it('PS-5/VC-1: identical declaration reuses existing version', async () => {
    const dependencies = createSaveDependencies()
    const input = {
      intakeReadyResult: buildPhase5IntakeReadyResult(),
      accessContext: ACCESS,
      userConfirmed: true,
      idempotencyKey: 'save-idem-4',
    }

    const first = await saveConfirmedFertilizerProductProfile(input, dependencies)
    const second = await saveConfirmedFertilizerProductProfile(
      {
        ...input,
        idempotencyKey: 'save-idem-5',
        packSizeLabel: '5 kg',
      },
      dependencies,
    )

    expect(second.profile.id).toBe(first.profile.id)
    expect(second.reusedExistingVersion).toBe(true)
    expect(dependencies.repository.state.byId.size).toBe(1)
  })

  it('PS-6/VC-2: changed NPK creates new version and keeps old unchanged', async () => {
    const dependencies = createSaveDependencies()

    const first = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(withNpk(0, 0, 30)),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'save-idem-6a',
      },
      dependencies,
    )

    const second = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(withNpk(0, 0, 29)),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'save-idem-6b',
      },
      dependencies,
    )

    expect(second.profile.id).not.toBe(first.profile.id)
    expect(first.profile.potash).toBe(30)
    expect(second.profile.potash).toBe(29)
    expect(dependencies.repository.state.byId.size).toBe(2)
  })

  it('PS-7/VC-7: pack size change reuses existing version', async () => {
    const dependencies = createSaveDependencies()
    const baseInput = {
      intakeReadyResult: buildPhase5IntakeReadyResult(),
      accessContext: ACCESS,
      userConfirmed: true,
    }

    const fourKg = await saveConfirmedFertilizerProductProfile(
      { ...baseInput, idempotencyKey: 'pack-4kg', packSizeLabel: '4 kg' },
      dependencies,
    )
    const tenKg = await saveConfirmedFertilizerProductProfile(
      { ...baseInput, idempotencyKey: 'pack-10kg', packSizeLabel: '10 kg', packagingType: 'Sack' },
      dependencies,
    )

    expect(tenKg.profile.id).toBe(fourKg.profile.id)
  })

  it('PS-9: idempotent repeat returns same version without duplicate', async () => {
    const dependencies = createSaveDependencies()
    const input = {
      intakeReadyResult: buildPhase5IntakeReadyResult(),
      accessContext: ACCESS,
      userConfirmed: true,
      idempotencyKey: 'idem-repeat',
    }

    const first = await saveConfirmedFertilizerProductProfile(input, dependencies)
    const second = await saveConfirmedFertilizerProductProfile(input, dependencies)

    expect(second.profile.id).toBe(first.profile.id)
    expect(dependencies.repository.state.byId.size).toBe(1)
  })

  it('PS-10: persistence errors map safely without DB details', async () => {
    const repository = createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    })

    repository.saveNewVersion = vi.fn(async () => {
      throw new Error('postgres: duplicate key value violates unique constraint')
    })

    await expect(
      saveConfirmedFertilizerProductProfile(
        {
          intakeReadyResult: buildPhase5IntakeReadyResult(),
          accessContext: ACCESS,
          userConfirmed: true,
          idempotencyKey: 'persist-fail',
        },
        {
          repository,
          deriveSessionAccessHash: deriveTestSessionAccessHash,
          now: () => PHASE5_FIXED_NOW,
          createId: () => 'new-id',
        },
      ),
    ).rejects.toMatchObject({ code: 'persistence_unavailable' })
  })

  it('VC-8: changed product identity is not the same version family lookup', async () => {
    const dependencies = createSaveDependencies()

    const first = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'identity-a',
      },
      dependencies,
    )

    const second = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult({
          identity: {
            manufacturer: 'OtherMaker',
            officialName: 'Other Product',
            productLine: 'Line',
            variant: '1-1-1',
            identityFingerprint: 'other-product',
            identityConfidence: 0.9,
            hasIdentityAmbiguity: false,
          },
        }),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'identity-b',
      },
      dependencies,
    )

    expect(second.profile.productFamilyKey).not.toBe(first.profile.productFamilyKey)
    expect(dependencies.repository.state.byId.size).toBe(2)
  })

  it('HI-1/HI-3: historical versions remain unchanged when new recipe is saved', async () => {
    const dependencies = createSaveDependencies()

    const v30 = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(withNpk(0, 0, 30)),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'hist-30',
      },
      dependencies,
    )

    await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(withNpk(0, 0, 29)),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'hist-29',
      },
      dependencies,
    )

    const reloaded = await dependencies.repository.getById(v30.profile.id, ACCESS)
    expect(reloaded?.potash).toBe(30)
    expect(reloaded?.npkDeclaration).toBe('0-0-30')
  })

  it('HI-4/HI-5: save core has no inventory or journal side effects', async () => {
    const dependencies = createSaveDependencies()
    const result = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'no-side-effects',
      },
      dependencies,
    )

    const serialized = JSON.stringify(result)
    expect(serialized.includes('container')).toBe(false)
    expect(serialized.includes('journal')).toBe(false)
    expect(serialized.includes('stock')).toBe(false)
    expect(serialized.includes('catalog')).toBe(false)
  })

  it('Leakage: public response excludes internal persistence details', async () => {
    const result = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'leakage-check',
      },
      createSaveDependencies(),
    )

    const payload = JSON.stringify(result.publicProfile)
    assertNoSensitiveLeakage(payload)
    expect(payload.includes('compositionFingerprint')).toBe(false)
    expect(payload.includes('sessionAccessHash')).toBe(false)
    expect(payload.includes(PHASE5_SESSION_HASH)).toBe(false)
  })

  it('E2E: save, reuse with different pack size, then new NPK version', async () => {
    const dependencies = createSaveDependencies()
    const intake = buildPhase5IntakeReadyResult(withNpk(0, 0, 30))

    const first = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: intake,
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'e2e-1',
        packSizeLabel: '5 kg',
      },
      dependencies,
    )

    const projection = projectFertilizerProductVersionFromPipeline(intake.pipelineResult)
    const fingerprint = computeFertilizerCompositionFingerprint(projection)
    expect(first.profile.compositionFingerprint).toBe(fingerprint.compositionFingerprint)

    const reused = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: intake,
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'e2e-2',
        packSizeLabel: '4 kg',
        remainderQuantity: 2,
      },
      dependencies,
    )

    expect(reused.profile.id).toBe(first.profile.id)

    const changed = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(withNpk(0, 0, 29)),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'e2e-3',
      },
      dependencies,
    )

    expect(changed.profile.id).not.toBe(first.profile.id)

    const original = await dependencies.repository.getById(first.profile.id, ACCESS)
    expect(original?.potash).toBe(30)
    expect(dependencies.repository.state.byId.size).toBe(2)
  })

  it('VC-4/VC-5: nutrient added or removed after DL-014 yields different versions', () => {
    const base = computeFertilizerCompositionFingerprint(
      projectFertilizerProductVersionFromPipeline(buildPhase5PipelineReadyResult()),
    )

    const withIron = computeFertilizerCompositionFingerprint(
      projectFertilizerProductVersionFromPipeline(
        buildPhase5PipelineReadyResult({
          nutrientMatrix: {
            ...buildPhase5RawInput().nutrientMatrix,
            iron: rawDeclared(1, { declarationBasis: 'Fe' }),
          },
        }),
      ),
    )

    expect(base.compositionFingerprint).not.toBe(withIron.compositionFingerprint)

    const allZero = computeFertilizerCompositionFingerprint(
      projectFertilizerProductVersionFromPipeline(
        buildPhase5PipelineReadyResult({
          nutrientMatrix: Object.fromEntries(
            FERTILIZER_NUTRIENT_MATRIX_KEYS.map((key) => [
              key,
              rawNotDeclared({ declarationBasis: 'N', provenanceIds: ['prov-decl'] }),
            ]),
          ) as never,
        }),
      ),
    )

    expect(base.compositionFingerprint).not.toBe(allZero.compositionFingerprint)
  })

  it('PS-D1: near-distinct recipes create separate immutable product profiles', async () => {
    const dependencies = createSaveDependencies()

    const first = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(withNpk(0, 0, 1.0000004)),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'decimal-a',
      },
      dependencies,
    )

    const second = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(withNpk(0, 0, 1.0000005)),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'decimal-b',
      },
      dependencies,
    )

    expect(second.profile.id).not.toBe(first.profile.id)
    expect(first.profile.potash).toBe(1.0000004)

    const reloaded = await dependencies.repository.getById(first.profile.id, ACCESS)
    expect(reloaded?.potash).toBe(1.0000004)
    expect(dependencies.repository.state.byId.size).toBe(2)
  })

  it('PS-D2: equivalent decimal spellings reuse the same version', async () => {
    const dependencies = createSaveDependencies()

    const first = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(withNpk(30, 0, 0)),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'decimal-equiv-a',
      },
      dependencies,
    )

    const second = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: buildPhase5IntakeReadyResult(withNpk(30.0, 0.0, 0.0)),
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'decimal-equiv-b',
        packSizeLabel: '10 kg',
      },
      dependencies,
    )

    expect(second.profile.id).toBe(first.profile.id)
    expect(dependencies.repository.state.byId.size).toBe(1)
  })

  it('PS-D3: high-precision declaration ignores pack size changes', async () => {
    const dependencies = createSaveDependencies()
    const intake = buildPhase5IntakeReadyResult(withNpk(0, 0, 0.1234567))

    const first = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: intake,
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'decimal-pack-a',
        packSizeLabel: '4 kg',
      },
      dependencies,
    )

    const second = await saveConfirmedFertilizerProductProfile(
      {
        intakeReadyResult: intake,
        accessContext: ACCESS,
        userConfirmed: true,
        idempotencyKey: 'decimal-pack-b',
        packSizeLabel: '25 kg',
        packagingType: 'Sack',
      },
      dependencies,
    )

    expect(second.profile.id).toBe(first.profile.id)
  })
})

describe('FertilizerProductProfileSaveError', () => {
  it('maps projection failures to controlled save errors', async () => {
    const intake = buildPhase5IntakeReadyResult()
    intake.pipelineResult.readinessInput.objectCategory = 'machine'

    await expect(
      saveConfirmedFertilizerProductProfile(
        {
          intakeReadyResult: intake,
          accessContext: ACCESS,
          userConfirmed: true,
          idempotencyKey: 'bad-category',
        },
        createSaveDependencies(),
      ),
    ).rejects.toMatchObject({ code: 'unsupported_object_category' })
  })
})
