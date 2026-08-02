import { describe, expect, it } from 'vitest'
import {
  buildLegacyContainerMigrationIdempotencyKey,
  buildLegacyContainerMigrationSourceEventRef,
  evaluateLegacyContainerMigration,
  type LegacyContainerMigrationInput,
  type LegacyMigrationContainerInput,
  type LegacyMigrationMovementInput,
} from './fertilizerInventoryLegacyMigrationCore'
import {
  PHASE7A_FIXED_NOW,
  PHASE7A_INVENTORY_ITEM_ID,
  PHASE7A_SAVED_PRODUCT_PROFILE_ID,
  PHASE7A_SESSION_HASH,
  PHASE7A_USER_ID,
} from './fertilizerInventoryTestFixtures'

const SAVED_PROFILE_ID = PHASE7A_SAVED_PRODUCT_PROFILE_ID
const CONTAINER_ID = PHASE7A_INVENTORY_ITEM_ID
const USER_ID = PHASE7A_USER_ID
const SESSION_HASH = PHASE7A_SESSION_HASH
const CREATED_AT = PHASE7A_FIXED_NOW

function legacyContainer(
  overrides: Partial<LegacyMigrationContainerInput> = {},
): LegacyMigrationContainerInput {
  return {
    containerId: CONTAINER_ID,
    userId: USER_ID,
    createdAt: CREATED_AT,
    productId: '44444444-4444-4444-8444-444444444441',
    packageSizeValue: 25,
    packageSizeUnit: 'kg',
    productForm: 'granular',
    label: 'ICL All Season 25 kg',
    ...overrides,
  }
}

function legacyMovement(
  overrides: Partial<LegacyMigrationMovementInput> = {},
): LegacyMigrationMovementInput {
  return {
    movementId: '55555555-5555-4555-8555-555555555551',
    movementType: 'purchase',
    quantityDelta: 25,
    unit: 'kg',
    movementDate: '2026-07-31',
    createdAt: CREATED_AT,
    captureIdempotencyKey: 'capture-key-1',
    ...overrides,
  }
}

function savedProfileInput(
  overrides: Partial<NonNullable<LegacyContainerMigrationInput['savedProfiles']>[number]> = {},
) {
  return {
    id: SAVED_PROFILE_ID,
    profileStatus: 'saved' as const,
    source: 'enrichment' as const,
    productForm: 'granular' as const,
    ...overrides,
  }
}

function baseInput(
  overrides: Partial<LegacyContainerMigrationInput> = {},
): LegacyContainerMigrationInput {
  return {
    container: legacyContainer(),
    movements: [legacyMovement()],
    savedProfiles: [savedProfileInput()],
    catalogProduct: {
      productId: '44444444-4444-4444-8444-444444444441',
      productForm: 'granular',
      linkedSavedProfileId: SAVED_PROFILE_ID,
    },
    ...overrides,
  }
}

describe('fertilizerInventoryLegacyMigrationCore', () => {
  describe('success paths', () => {
    it('1 — already migrated authenticated user container', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({
            productId: null,
            recognitionCandidateId: null,
            savedProductProfileId: SAVED_PROFILE_ID,
            accessKind: 'authenticated_user',
            baseUnit: 'kg',
          }),
          movements: [
            legacyMovement({
              captureIdempotencyKey: null,
              accessKind: 'authenticated_user',
              movementAt: CREATED_AT,
            }),
          ],
        }),
      )

      expect(result.status).toBe('already_migrated')
      expect(result.isAlreadyMigrated).toBe(true)
      expect(result.upgradePlan).toBeNull()
      expect(result.reasons).toContain('CORE_BINDING_ALREADY_COMPLETE')
    })

    it('2 — already migrated session container', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({
            userId: null,
            productId: null,
            recognitionCandidateId: null,
            savedProductProfileId: SAVED_PROFILE_ID,
            accessKind: 'session',
            sessionAccessHash: SESSION_HASH,
            baseUnit: 'kg',
          }),
          movements: [
            legacyMovement({
              captureIdempotencyKey: null,
              accessKind: 'session',
              movementAt: CREATED_AT,
            }),
          ],
        }),
      )

      expect(result.status).toBe('already_migrated')
    })

    it('3 — legacy catalog container with saved profile is ready', () => {
      const result = evaluateLegacyContainerMigration(baseInput())

      expect(result.status).toBe('ready')
      expect(result.upgradePlan).not.toBeNull()
      expect(result.upgradePlan?.savedProductProfileId).toBe(SAVED_PROFILE_ID)
      expect(result.reasons).toContain('SAVED_PROFILE_AVAILABLE')
    })

    it('4 — legacy candidate with saved profile is ready', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({
            productId: null,
            recognitionCandidateId: '66666666-6666-4666-8666-666666666661',
          }),
          catalogProduct: null,
          candidate: {
            candidateId: '66666666-6666-4666-8666-666666666661',
            productForm: 'granular',
            linkedProductProfileId: SAVED_PROFILE_ID,
          },
        }),
      )

      expect(result.status).toBe('ready')
    })

    it('5 — zero balance remains ready', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          movements: [
            legacyMovement({ movementType: 'purchase', quantityDelta: 25 }),
            legacyMovement({
              movementId: '55555555-5555-4555-8555-555555555552',
              movementType: 'fertilization',
              quantityDelta: -25,
            }),
          ],
        }),
      )

      expect(result.status).toBe('ready')
      expect(result.upgradePlan?.movementUpgrades).toHaveLength(2)
    })

    it('6 — partially consumed package remains ready', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          movements: [
            legacyMovement({ movementType: 'purchase', quantityDelta: 25 }),
            legacyMovement({
              movementId: '55555555-5555-4555-8555-555555555552',
              movementType: 'fertilization',
              quantityDelta: -8,
            }),
          ],
        }),
      )

      expect(result.status).toBe('ready')
    })

    it('7 — preserves all movements in upgrade plan', () => {
      const movements = [
        legacyMovement({ movementId: 'm-1', quantityDelta: 10, movementType: 'initial_stock' }),
        legacyMovement({
          movementId: 'm-2',
          quantityDelta: 15,
          movementType: 'purchase',
          movementAt: '2026-07-30T10:00:00.000Z',
          captureIdempotencyKey: 'capture-key-1',
        }),
      ]

      const result = evaluateLegacyContainerMigration(baseInput({ movements }))

      expect(result.upgradePlan?.movementUpgrades.map((movement) => movement.movementId)).toEqual([
        'm-1',
        'm-2',
      ])
    })

    it('8 — same input yields identical result', () => {
      const input = baseInput()
      expect(evaluateLegacyContainerMigration(input)).toEqual(evaluateLegacyContainerMigration(input))
    })

    it('9 — does not mutate input', () => {
      const input = baseInput()
      const snapshot = structuredClone(input)

      evaluateLegacyContainerMigration(input)

      expect(input).toEqual(snapshot)
    })

    it('10 — migration idempotency key is stable', () => {
      const result = evaluateLegacyContainerMigration(baseInput())

      expect(result.upgradePlan?.migrationIdempotencyKey).toBe(
        buildLegacyContainerMigrationIdempotencyKey(CONTAINER_ID),
      )
    })

    it('11 — clears legacy product bindings in upgrade plan', () => {
      const result = evaluateLegacyContainerMigration(baseInput())

      expect(result.upgradePlan?.productId).toBeNull()
      expect(result.upgradePlan?.recognitionCandidateId).toBeNull()
    })

    it('12 — keeps container id unchanged', () => {
      const result = evaluateLegacyContainerMigration(baseInput())

      expect(result.containerId).toBe(CONTAINER_ID)
      expect(result.upgradePlan?.containerId).toBe(CONTAINER_ID)
    })
  })

  describe('profile uplift', () => {
    it('13 — catalog product without saved profile needs uplift', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          savedProfiles: [],
          catalogProduct: {
            productId: '44444444-4444-4444-8444-444444444441',
            productForm: 'granular',
          },
        }),
      )

      expect(result.status).toBe('needs_profile_uplift')
      expect(result.upgradePlan).toBeNull()
      expect(result.profileUpliftInput?.sourceKind).toBe('catalog_product')
    })

    it('14 — candidate without saved profile needs uplift', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({
            productId: null,
            recognitionCandidateId: '66666666-6666-4666-8666-666666666661',
          }),
          savedProfiles: [],
          catalogProduct: null,
          candidate: {
            candidateId: '66666666-6666-4666-8666-666666666661',
            productForm: 'granular',
          },
        }),
      )

      expect(result.status).toBe('needs_profile_uplift')
      expect(result.profileUpliftInput?.sourceKind).toBe('recognition_candidate')
    })

    it('15 — draft profile with sufficient source needs uplift', () => {
      const draftId = '77777777-7777-4777-8777-777777777771'
      const result = evaluateLegacyContainerMigration(
        baseInput({
          savedProfiles: [
            {
              id: draftId,
              profileStatus: 'draft',
              source: 'packaging_photo',
              productForm: 'granular',
            },
          ],
          catalogProduct: {
            productId: '44444444-4444-4444-8444-444444444441',
            productForm: 'granular',
            linkedVerifiedProfileId: draftId,
          },
        }),
      )

      expect(result.status).toBe('needs_profile_uplift')
      expect(result.profileUpliftInput?.sourceKind).toBe('verified_profile')
    })

    it('16 — no upgrade plan before uplift', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({ savedProfiles: [], catalogProduct: { productId: '44444444-4444-4444-8444-444444444441' } }),
      )

      expect(result.upgradePlan).toBeNull()
    })

    it('17 — uplift input contains no invented nutrients', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({ savedProfiles: [], catalogProduct: { productId: '44444444-4444-4444-8444-444444444441' } }),
      )

      expect(result.profileUpliftInput).toEqual(
        expect.objectContaining({
          sourceKind: 'catalog_product',
          sourceId: '44444444-4444-4444-8444-444444444441',
          productForm: 'granular',
        }),
      )
      expect(JSON.stringify(result.profileUpliftInput)).not.toMatch(/nutrient|nitrogen|npk/i)
    })
  })

  describe('manual review', () => {
    it('19 — unknown product form', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({ productForm: 'unknown' }),
          catalogProduct: { productId: '44444444-4444-4444-8444-444444444441', productForm: 'unknown' },
        }),
      )

      expect(result.status).toBe('needs_manual_review')
      expect(result.reasons).toContain('UNKNOWN_PRODUCT_FORM')
    })

    it('20 — unit g', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({ movements: [legacyMovement({ unit: 'g' })] }),
      )

      expect(result.status).toBe('needs_manual_review')
      expect(result.reasons).toContain('UNSUPPORTED_PACKAGE_UNIT')
    })

    it('21 — unit l', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({ packageSizeValue: 10, packageSizeUnit: 'l', productForm: 'liquid' }),
          movements: [legacyMovement({ unit: 'l' })],
          savedProfiles: [savedProfileInput({ productForm: 'liquid' })],
          catalogProduct: {
            productId: '44444444-4444-4444-8444-444444444441',
            productForm: 'liquid',
            linkedSavedProfileId: SAVED_PROFILE_ID,
          },
        }),
      )

      expect(result.status).toBe('needs_manual_review')
    })

    it('22 — missing nominal package size', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({ packageSizeValue: null, packageSizeUnit: null }),
        }),
      )

      expect(result.status).toBe('needs_manual_review')
      expect(result.reasons).toContain('MISSING_PACKAGE_SIZE')
    })

    it('23 — multiple saved profiles', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          savedProfiles: [
            savedProfileInput({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' }),
            savedProfileInput({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2' }),
          ],
        }),
      )

      expect(result.status).toBe('needs_manual_review')
      expect(result.reasons).toContain('MULTIPLE_SAVED_PROFILES')
    })

    it('24 — aggregation suspicion via multiple captures', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          movements: [
            legacyMovement({ captureIdempotencyKey: 'capture-a' }),
            legacyMovement({
              movementId: '55555555-5555-4555-8555-555555555552',
              captureIdempotencyKey: 'capture-b',
            }),
          ],
        }),
      )

      expect(result.status).toBe('needs_manual_review')
      expect(result.reasons).toContain('AGGREGATED_LEGACY_CONTAINER')
    })

    it('25 — package_count > 1 metadata', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          captureMetadata: { packageCount: 3 },
        }),
      )

      expect(result.status).toBe('needs_manual_review')
      expect(result.reasons).toContain('AGGREGATED_LEGACY_CONTAINER')
    })

    it('26 — conflicting product sources', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({
            productId: '44444444-4444-4444-8444-444444444441',
            recognitionCandidateId: '66666666-6666-4666-8666-666666666661',
          }),
        }),
      )

      expect(result.status).toBe('blocked_invalid_data')
      expect(result.reasons).toContain('AMBIGUOUS_PRODUCT_BINDING')
    })

    it('27 — ambiguous creation reason', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          movements: [
            legacyMovement({
              movementId: 'm-purchase',
              movementType: 'purchase',
              movementDate: '2026-07-30',
              quantityDelta: 10,
            }),
            legacyMovement({
              movementId: 'm-gift',
              movementType: 'gift_received',
              movementDate: '2026-07-31',
              quantityDelta: 5,
            }),
          ],
        }),
      )

      expect(result.status).toBe('needs_manual_review')
      expect(result.reasons).toContain('AMBIGUOUS_CREATION_REASON')
    })
  })

  describe('blocked invalid data', () => {
    it('29 — negative package size', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({ container: legacyContainer({ packageSizeValue: -5 }) }),
      )

      expect(result.status).toBe('blocked_invalid_data')
      expect(result.reasons).toContain('INVALID_PACKAGE_VALUE')
    })

    it('30 — NaN package size', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({ container: legacyContainer({ packageSizeValue: Number.NaN }) }),
      )

      expect(result.status).toBe('blocked_invalid_data')
    })

    it('31 — unit without value', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({ container: legacyContainer({ packageSizeValue: null, packageSizeUnit: 'kg' }) }),
      )

      expect(result.status).toBe('needs_manual_review')
    })

    it('32 — value without unit', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({ container: legacyContainer({ packageSizeValue: 25, packageSizeUnit: null }) }),
      )

      expect(result.status).toBe('needs_manual_review')
    })

    it('33 — conflicting movement units', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          movements: [
            legacyMovement({ unit: 'kg' }),
            legacyMovement({
              movementId: '55555555-5555-4555-8555-555555555552',
              unit: 'ml',
            }),
          ],
        }),
      )

      expect(result.status).toBe('blocked_invalid_data')
      expect(result.reasons).toContain('CONFLICTING_MOVEMENT_UNITS')
    })

    it('34 — invalid movement quantity', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({ movements: [legacyMovement({ quantityDelta: Number.NaN })] }),
      )

      expect(result.status).toBe('blocked_invalid_data')
    })

    it('35 — legacy and core binding conflict', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({
            savedProductProfileId: SAVED_PROFILE_ID,
            accessKind: 'authenticated_user',
            productId: '44444444-4444-4444-8444-444444444441',
          }),
        }),
      )

      expect(result.status).toBe('blocked_invalid_data')
      expect(result.reasons).toContain('LEGACY_AND_CORE_BINDING_CONFLICT')
    })

    it('36 — invalid access binding', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({ userId: null, accessKind: null }),
        }),
      )

      expect(result.status).toBe('blocked_invalid_data')
      expect(result.reasons).toContain('INVALID_ACCESS_BINDING')
    })

    it('37 — negative balance', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          movements: [
            legacyMovement({ quantityDelta: 5 }),
            legacyMovement({
              movementId: '55555555-5555-4555-8555-555555555552',
              quantityDelta: -10,
            }),
          ],
        }),
      )

      expect(result.status).toBe('blocked_invalid_data')
      expect(result.reasons).toContain('NEGATIVE_BALANCE')
    })

    it('38 — invalid container id', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({ container: legacyContainer({ containerId: 'not-a-uuid' }) }),
      )

      expect(result.status).toBe('blocked_invalid_data')
      expect(result.reasons).toContain('INVALID_CONTAINER_ID')
    })
  })

  describe('creation reason', () => {
    it('39 — earliest purchase', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          movements: [
            legacyMovement({ movementType: 'initial_stock', quantityDelta: 5, movementDate: '2026-07-30' }),
            legacyMovement({
              movementId: '55555555-5555-4555-8555-555555555552',
              movementType: 'purchase',
              quantityDelta: 20,
              movementDate: '2026-07-29',
            }),
          ],
        }),
      )

      expect(result.upgradePlan?.creationReason).toBe('purchase')
    })

    it('40 — earliest initial_stock', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          movements: [legacyMovement({ movementType: 'initial_stock', quantityDelta: 12 })],
        }),
      )

      expect(result.upgradePlan?.creationReason).toBe('initial_stock')
    })

    it('41 — gift_received', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          movements: [legacyMovement({ movementType: 'gift_received', quantityDelta: 12 })],
        }),
      )

      expect(result.upgradePlan?.creationReason).toBe('gift_received')
    })

    it('42 — inventory_correction is never initial creation reason', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          movements: [
            legacyMovement({
              movementType: 'inventory_correction',
              quantityDelta: 10,
            }),
          ],
        }),
      )

      expect(result.upgradePlan?.creationReason).not.toBe('inventory_correction')
      expect(result.status).toBe('needs_manual_review')
    })

    it('43 — migration fallback is explicit for empty movement history', () => {
      const result = evaluateLegacyContainerMigration(baseInput({ movements: [] }))

      expect(result.status).toBe('ready')
      expect(result.upgradePlan?.creationReason).toBe('initial_stock')
      expect(result.upgradePlan?.creationReasonUsedMigrationFallback).toBe(true)
      expect(result.warnings).toContain('MIGRATION_CREATION_REASON_FALLBACK')
    })
  })

  describe('units and quantities', () => {
    it('44 — accepts kg', () => {
      const result = evaluateLegacyContainerMigration(baseInput())

      expect(result.status).toBe('ready')
      expect(result.upgradePlan?.baseUnit).toBe('kg')
    })

    it('45 — accepts ml for liquid', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({
            packageSizeValue: 10,
            packageSizeUnit: 'ml',
            productForm: 'liquid',
          }),
          movements: [legacyMovement({ unit: 'ml', quantityDelta: 10 })],
          savedProfiles: [savedProfileInput({ productForm: 'liquid' })],
          catalogProduct: {
            productId: '44444444-4444-4444-8444-444444444441',
            productForm: 'liquid',
            linkedSavedProfileId: SAVED_PROFILE_ID,
          },
        }),
      )

      expect(result.status).toBe('ready')
      expect(result.upgradePlan?.baseUnit).toBe('ml')
    })

    it('46 — does not convert g', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({ movements: [legacyMovement({ unit: 'g' })] }),
      )

      expect(result.status).toBe('needs_manual_review')
    })

    it('47 — does not convert l', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({ packageSizeUnit: 'l', productForm: 'liquid' }),
          movements: [legacyMovement({ unit: 'l' })],
        }),
      )

      expect(result.status).toBe('needs_manual_review')
    })

    it('48 — accepts four decimal places', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({ packageSizeValue: 12.3456 }),
          movements: [legacyMovement({ quantityDelta: 12.3456 })],
        }),
      )

      expect(result.status).toBe('ready')
    })

    it('49 — rejects more than four decimal places', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({ packageSizeValue: 12.34567 }),
        }),
      )

      expect(result.status).toBe('blocked_invalid_data')
      expect(result.reasons).toContain('EXCESSIVE_PACKAGE_PRECISION')
    })

    it('50 — nominal size and balance remain separate', () => {
      const result = evaluateLegacyContainerMigration(
        baseInput({
          container: legacyContainer({ packageSizeValue: 25 }),
          movements: [
            legacyMovement({ quantityDelta: 25 }),
            legacyMovement({
              movementId: '55555555-5555-4555-8555-555555555552',
              quantityDelta: -10,
            }),
          ],
        }),
      )

      expect(result.upgradePlan?.packageSizeValue).toBe(25)
      expect(JSON.stringify(result.upgradePlan)).not.toMatch(/currentQuantity|balance|remaining/i)
    })
  })

  describe('idempotency helpers', () => {
    it('builds stable source event ref', () => {
      expect(buildLegacyContainerMigrationSourceEventRef(CONTAINER_ID)).toBe(
        `legacy:container:${CONTAINER_ID}`,
      )
    })
  })
})
