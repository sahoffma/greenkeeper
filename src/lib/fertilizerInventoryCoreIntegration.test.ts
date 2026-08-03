import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { FertilizerSavedProductProfile } from '../types/fertilizerProductProfile'
import {
  FERTILIZER_COMPOSITION_FINGERPRINT_VERSION,
  FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE,
  FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS,
} from '../types/fertilizerProductProfile'
import { computeInventoryItemBalance } from './fertilizerInventoryBalanceCore'
import { saveFertilizerCaptureToInventoryCore } from './fertilizerCaptureInventorySaveCore'
import {
  buildRecognitionIdentityFingerprint,
  computePurchaseAmount,
} from './fertilizerInventoryCore'
import {
  createInventoryCoreIntegrationStack,
  INVENTORY_MOVEMENT_IMMUTABLE_ERROR,
} from './fertilizerInventoryCoreIntegrationHarness'
import {
  FERTILIZER_INVENTORY_CONTAINERS_TABLE,
  FERTILIZER_INVENTORY_MOVEMENTS_TABLE,
  mapInventoryItemToContainerRow,
} from './fertilizerInventoryRepositoryMappingCore'
import { FertilizerInventoryRepositoryError } from './fertilizerInventoryRepositoryCore'
import { createPersistentFertilizerInventoryRepository } from './fertilizerInventoryRepositoryPersistentCore'
import {
  PHASE7A_FIXED_NOW,
  PHASE7A_SAVED_PRODUCT_PROFILE_ID,
  PHASE7A_SESSION_HASH,
  PHASE7A_SESSION_ID,
  PHASE7A_USER_ID,
  phase7AAuthenticatedAccessContext,
  phase7ASessionAccessContext,
} from './fertilizerInventoryTestFixtures'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INVENTORY_CORE_MIGRATION_PATH = join(
  __dirname,
  '../../supabase/migrations/20250805_fertilizer_inventory_core.sql',
)
const LEGACY_CAPTURE_MIGRATION_PATH = join(
  __dirname,
  '../../supabase/migrations/20250802_save_fertilizer_capture_replay_product_profile.sql',
)

const OTHER_USER_ID = '00000000-0000-4000-8000-0000000007b2'
const OTHER_SESSION_ID = 'session-phase7a-other'

function buildSavedProfile(
  overrides: Partial<FertilizerSavedProductProfile> = {},
): FertilizerSavedProductProfile {
  return {
    id: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
    accessKind: 'authenticated_user',
    userId: PHASE7A_USER_ID,
    sessionAccessHash: null,
    productFamilyKey: 'family',
    identityFingerprint: 'identity',
    manufacturer: 'ICL',
    productLine: null,
    officialName: 'Stressmanager',
    variant: '0-0-30',
    productForm: 'granular',
    npkDeclaration: '0-0-30',
    nitrogen: 0,
    phosphate: 0,
    potash: 30,
    nutrientMatrix: {},
    compositionFingerprintVersion: FERTILIZER_COMPOSITION_FINGERPRINT_VERSION,
    compositionFingerprint: 'fp-7a',
    provenance: { confirmedAt: PHASE7A_FIXED_NOW },
    saveIdempotencyKey: 'profile-idem-7a',
    source: FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE,
    profileStatus: FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS,
    verificationStatus: 'verified',
    createdAt: PHASE7A_FIXED_NOW,
    ...overrides,
  }
}

function createSequentialIdFactory(prefix: string) {
  let counter = 0
  return () => {
    counter += 1
    return `${prefix}-${counter}`
  }
}

async function createSeededStack(
  profileOverrides: Partial<FertilizerSavedProductProfile> = {},
  options: { createId?: () => string } = {},
) {
  const profile = buildSavedProfile(profileOverrides)
  const stack = createInventoryCoreIntegrationStack({
    createId: options.createId,
  })

  await stack.seedProfile(profile, phase7AAuthenticatedAccessContext())

  return { ...stack, profile }
}

describe('fertilizerInventoryCoreIntegration', () => {
  it('1 — creates inventory items from saved product profiles with derived baseUnit and package metadata', async () => {
    const { inventoryRepository, profile, supabase } = await createSeededStack()

    const item = await inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'ml',
        packageSizeValue: 25,
        packageSizeUnit: 'kg',
        label: '25 kg Sack',
      },
      phase7AAuthenticatedAccessContext(),
    )

    expect(item.baseUnit).toBe('kg')
    expect(item.packageSizeValue).toBe(25)
    expect(item.packageSizeUnit).toBe('kg')
    expect(item.savedProductProfileId).toBe(profile.id)
    expect(await inventoryRepository.computeItemBalance(item.id, phase7AAuthenticatedAccessContext())).toBe(
      0,
    )

    const stored = supabase.containers[0]
    expect(stored.package_size_value).toBe(25)
    expect(stored.package_size_unit).toBe('kg')
    expect(stored).not.toHaveProperty('current_quantity')
    expect(stored).not.toHaveProperty('balance')
  })

  it('2 — binds inventory items only via saved_product_profile_id without copying product data', async () => {
    const { inventoryRepository, profile, supabase } = await createSeededStack()

    const item = await inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
      },
      phase7AAuthenticatedAccessContext(),
    )

    expect(item.savedProductProfileId).toBe(profile.id)
    expect(item).not.toHaveProperty('officialName')
    expect(item).not.toHaveProperty('manufacturer')
    expect(item).not.toHaveProperty('nutrientMatrix')

    const row = mapInventoryItemToContainerRow(item)
    expect(row.saved_product_profile_id).toBe(profile.id)
    expect(row.product_id).toBeNull()
    expect(row.recognition_candidate_id).toBeNull()
    expect(supabase.containers).toHaveLength(1)
    expect(supabase.containers[0].product_id).toBeNull()
    expect(supabase.containers[0].recognition_candidate_id).toBeNull()
  })

  it('3 — keeps separate inventory items for the same product version (DL-024)', async () => {
    const { inventoryRepository, profile } = await createSeededStack(undefined, {
      createId: createSequentialIdFactory('package-item'),
    })
    const accessContext = phase7AAuthenticatedAccessContext()

    const first = await inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
        packageSizeValue: 25,
        packageSizeUnit: 'kg',
        label: 'Sack 1',
      },
      accessContext,
    )
    const second = await inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
        packageSizeValue: 25,
        packageSizeUnit: 'kg',
        label: 'Sack 2',
      },
      accessContext,
    )

    expect(first.id).not.toBe(second.id)
    expect(await inventoryRepository.listInventoryItemsByProductVersion(profile.id, accessContext)).toEqual([
      first,
      second,
    ])
  })

  it('4 — records movements append-only and derives balance from movement sum (DL-019)', async () => {
    const { inventoryRepository, profile } = await createSeededStack(undefined, {
      createId: createSequentialIdFactory('movement-chain'),
    })
    const accessContext = phase7AAuthenticatedAccessContext()

    const item = await inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
      },
      accessContext,
    )

    await inventoryRepository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )
    await inventoryRepository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: -8,
        unit: 'kg',
        movementType: 'fertilization',
      },
      accessContext,
    )

    const movements = await inventoryRepository.listMovementsByItemId(item.id, accessContext)
    expect(movements).toHaveLength(2)
    expect(computeInventoryItemBalance(movements)).toBe(17)
    expect(await inventoryRepository.computeItemBalance(item.id, accessContext)).toBe(17)
  })

  it('5 — keeps inventory items at zero balance without deleting them', async () => {
    const { inventoryRepository, profile } = await createSeededStack(undefined, {
      createId: createSequentialIdFactory('zero-balance'),
    })
    const accessContext = phase7AAuthenticatedAccessContext()

    const item = await inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
      },
      accessContext,
    )

    await inventoryRepository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )
    await inventoryRepository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: -25,
        unit: 'kg',
        movementType: 'fertilization',
      },
      accessContext,
    )

    const reloaded = await inventoryRepository.getInventoryItemById(item.id, accessContext)
    expect(reloaded).not.toBeNull()
    expect(reloaded?.status).toBe('active')
    expect(await inventoryRepository.computeItemBalance(item.id, accessContext)).toBe(0)
  })

  it('6 — enforces kg for granular and ml for liquid inventory units (DL-021)', async () => {
    const granularProfile = buildSavedProfile({ productForm: 'granular' })
    const liquidProfile = buildSavedProfile({
      id: '22222222-2222-4222-8222-222222227a02',
      productForm: 'liquid',
      saveIdempotencyKey: 'profile-idem-liquid',
      compositionFingerprint: 'fp-7a-liquid',
    })

    const stack = createInventoryCoreIntegrationStack({
      createId: createSequentialIdFactory('unit-item'),
    })
    await stack.seedProfile(granularProfile, phase7AAuthenticatedAccessContext())
    await stack.seedProfile(liquidProfile, phase7AAuthenticatedAccessContext())

    const granularItem = await stack.inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: granularProfile.id,
        baseUnit: 'ml',
      },
      phase7AAuthenticatedAccessContext(),
    )
    const liquidItem = await stack.inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: liquidProfile.id,
        baseUnit: 'kg',
        packageSizeValue: 5000,
        packageSizeUnit: 'ml',
      },
      phase7AAuthenticatedAccessContext(),
    )

    expect(granularItem.baseUnit).toBe('kg')
    expect(liquidItem.baseUnit).toBe('ml')

    await expect(
      stack.inventoryRepository.appendMovement(
        {
          inventoryItemId: granularItem.id,
          quantityDelta: 1,
          unit: 'ml',
          movementType: 'initial_stock',
        },
        phase7AAuthenticatedAccessContext(),
      ),
    ).rejects.toBeInstanceOf(FertilizerInventoryRepositoryError)

    expect(
      await stack.inventoryRepository.listMovementsByItemId(
        granularItem.id,
        phase7AAuthenticatedAccessContext(),
      ),
    ).toHaveLength(0)
  })

  it('7 — isolates authenticated user and session access scopes', async () => {
    const userStack = await createSeededStack(undefined, {
      createId: createSequentialIdFactory('user-item'),
    })
    const userItem = await userStack.inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: userStack.profile.id,
        baseUnit: 'kg',
      },
      phase7AAuthenticatedAccessContext(),
    )

    expect(
      await userStack.inventoryRepository.getInventoryItemById(userItem.id, {
        kind: 'authenticated_user',
        userId: OTHER_USER_ID,
      }),
    ).toBeNull()

    const sessionProfile = buildSavedProfile({
      id: '33333333-3333-4333-8333-333333337a03',
      accessKind: 'session',
      userId: null,
      sessionAccessHash: PHASE7A_SESSION_HASH,
      saveIdempotencyKey: 'profile-idem-session',
      compositionFingerprint: 'fp-7a-session',
    })
    const sessionStack = createInventoryCoreIntegrationStack({
      createId: createSequentialIdFactory('session-item'),
    })
    await sessionStack.seedProfile(sessionProfile, phase7ASessionAccessContext())

    const sessionItem = await sessionStack.inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: sessionProfile.id,
        baseUnit: 'kg',
      },
      phase7ASessionAccessContext(),
    )

    expect(sessionItem.sessionAccessHash).toBe(PHASE7A_SESSION_HASH)
    expect(JSON.stringify(sessionItem).includes(PHASE7A_SESSION_ID)).toBe(false)
    expect(
      await sessionStack.inventoryRepository.getInventoryItemById(sessionItem.id, {
        kind: 'session',
        sessionId: OTHER_SESSION_ID,
      }),
    ).toBeNull()
  })

  it('8 — rejects movement updates and deletes as append-only persistence', async () => {
    const { inventoryRepository, profile, supabase } = await createSeededStack(undefined, {
      createId: createSequentialIdFactory('append-only'),
    })
    const accessContext = phase7AAuthenticatedAccessContext()

    expect('updateMovement' in inventoryRepository).toBe(false)
    expect('deleteMovement' in inventoryRepository).toBe(false)

    const item = await inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
      },
      accessContext,
    )
    await inventoryRepository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
      },
      accessContext,
    )

    const movementId = supabase.movements[0]?.id
    expect(movementId).toBeDefined()

    const updateResult = await supabase.client
      .from(FERTILIZER_INVENTORY_MOVEMENTS_TABLE)
      .update({ quantity_delta: 10 })
      .eq('id', movementId)
    expect(updateResult.error?.message).toBe(INVENTORY_MOVEMENT_IMMUTABLE_ERROR)

    const deleteResult = await supabase.client
      .from(FERTILIZER_INVENTORY_MOVEMENTS_TABLE)
      .delete()
      .eq('id', movementId)
    expect(deleteResult.error?.message).toBe(INVENTORY_MOVEMENT_IMMUTABLE_ERROR)
    expect(supabase.movements).toHaveLength(1)
  })

  it('9 — replays movement writes by inventory_idempotency_key without duplicate rows', async () => {
    const { inventoryRepository, profile, supabase } = await createSeededStack(undefined, {
      createId: createSequentialIdFactory('idempotency'),
    })
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
      },
      accessContext,
    )

    const first = await inventoryRepository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
        idempotencyKey: 'inventory-idem-integration',
      },
      accessContext,
    )
    const replay = await inventoryRepository.appendMovement(
      {
        inventoryItemId: item.id,
        quantityDelta: 25,
        unit: 'kg',
        movementType: 'initial_stock',
        idempotencyKey: 'inventory-idem-integration',
      },
      accessContext,
    )

    expect(replay.id).toBe(first.id)
    expect(supabase.movements).toHaveLength(1)
    expect(await inventoryRepository.computeItemBalance(item.id, accessContext)).toBe(25)
  })

  it('10 — does not auto-create inventory items when saving a product profile', async () => {
    const stack = createInventoryCoreIntegrationStack()
    const profile = buildSavedProfile()

    await stack.seedProfile(profile, phase7AAuthenticatedAccessContext())

    expect(stack.supabase.containers).toHaveLength(0)
    expect(stack.supabase.movements).toHaveLength(0)
    expect(
      await stack.inventoryRepository.listInventoryItemsByProductVersion(
        profile.id,
        phase7AAuthenticatedAccessContext(),
      ),
    ).toEqual([])
  })

  it('11 — keeps legacy capture separate from the inventory core chain', () => {
    const inventoryCoreMigration = readFileSync(INVENTORY_CORE_MIGRATION_PATH, 'utf8')
    const legacyCaptureMigration = readFileSync(LEGACY_CAPTURE_MIGRATION_PATH, 'utf8')

    expect(inventoryCoreMigration).toContain('prevent_fertilizer_stock_movement_mutation')
    expect(inventoryCoreMigration).not.toContain('create or replace function public.save_fertilizer_capture')
    expect(legacyCaptureMigration).toContain('create or replace function public.save_fertilizer_capture')

    expect(String(createPersistentFertilizerInventoryRepository)).not.toContain('save_fertilizer_capture')
    expect(typeof saveFertilizerCaptureToInventoryCore).toBe('function')
    expect(String(saveFertilizerCaptureToInventoryCore)).not.toContain('save_fertilizer_capture')
    expect(typeof computePurchaseAmount).toBe('function')
    expect(typeof buildRecognitionIdentityFingerprint).toBe('function')
  })

  it('validates migration contract used by the integration harness', () => {
    const sql = readFileSync(INVENTORY_CORE_MIGRATION_PATH, 'utf8')

    expect(sql).toContain('saved_product_profile_id uuid references public.product_profiles')
    expect(sql).toContain('inventory_idempotency_key')
    expect(sql).toContain('prevent_fertilizer_stock_movement_update')
    expect(sql).toContain('prevent_fertilizer_stock_movement_delete')
    expect(sql).toContain('INVENTORY_MOVEMENT_UNIT_MISMATCH')
    expect(sql).toContain('INVENTORY_BASE_UNIT_PRODUCT_FORM_MISMATCH')
    expect(sql).toContain('append_fertilizer_inventory_core_movement')
    expect(sql).not.toContain('current_quantity')
    expect(sql).not.toContain('create table public.fertilizer_inventory_items')
  })

  it('rejects wrong movement units at migration-simulated persistence layer', async () => {
    const { inventoryRepository, profile, supabase } = await createSeededStack(undefined, {
      createId: createSequentialIdFactory('db-unit-check'),
    })
    const accessContext = phase7AAuthenticatedAccessContext()
    const item = await inventoryRepository.createInventoryItem(
      {
        savedProductProfileId: profile.id,
        baseUnit: 'kg',
      },
      accessContext,
    )

    await expect(
      inventoryRepository.appendMovement(
        {
          inventoryItemId: item.id,
          quantityDelta: 1,
          unit: 'ml',
          movementType: 'initial_stock',
        },
        accessContext,
      ),
    ).rejects.toMatchObject({ code: 'unit_mismatch' })

    expect(supabase.movements).toHaveLength(0)
  })

  it('surfaces repository errors instead of silently mutating inventory state', async () => {
    const stack = createInventoryCoreIntegrationStack()

    await expect(
      stack.inventoryRepository.createInventoryItem(
        {
          savedProductProfileId: 'missing-profile-id',
          baseUnit: 'kg',
        },
        phase7AAuthenticatedAccessContext(),
      ),
    ).rejects.toBeInstanceOf(FertilizerInventoryRepositoryError)
  })
})

describe('fertilizerInventoryCoreIntegration migration tables', () => {
  it('uses legacy fertilizer_containers and fertilizer_stock_movements tables', () => {
    expect(FERTILIZER_INVENTORY_CONTAINERS_TABLE).toBe('fertilizer_containers')
    expect(FERTILIZER_INVENTORY_MOVEMENTS_TABLE).toBe('fertilizer_stock_movements')
  })
})
