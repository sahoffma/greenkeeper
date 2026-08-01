import { describe, expect, it } from 'vitest'
import {
  FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  type FertilizerInventoryItem,
} from '../types/fertilizerInventoryCore'
import {
  FERTILIZER_INVENTORY_LEGACY_CONTAINER_FIELDS,
  FERTILIZER_INVENTORY_LEGACY_MOVEMENT_FIELDS,
  mapContainerRowToInventoryItem,
  mapInventoryItemToContainerRow,
  mapInventoryMovementToRow,
  mapMovementRowToInventoryMovement,
} from './fertilizerInventoryRepositoryMappingCore'
import { FertilizerInventoryRepositoryError } from './fertilizerInventoryRepositoryCore'
import {
  PHASE7A_FIXED_NOW,
  PHASE7A_INVENTORY_ITEM_ID,
  PHASE7A_INVENTORY_MOVEMENT_ID,
  PHASE7A_SAVED_PRODUCT_PROFILE_ID,
  PHASE7A_SESSION_HASH,
  PHASE7A_USER_ID,
  buildPhase7AInventoryItem,
  buildPhase7AInventoryMovement,
} from './fertilizerInventoryTestFixtures'

describe('fertilizerInventoryRepositoryMappingCore', () => {
  it('maps inventory item domain to core container row without legacy bindings', () => {
    const item = buildPhase7AInventoryItem()
    const row = mapInventoryItemToContainerRow(item)

    expect(row.id).toBe(PHASE7A_INVENTORY_ITEM_ID)
    expect(row.saved_product_profile_id).toBe(PHASE7A_SAVED_PRODUCT_PROFILE_ID)
    expect(row.access_kind).toBe('authenticated_user')
    expect(row.user_id).toBe(PHASE7A_USER_ID)
    expect(row.session_access_hash).toBeNull()
    expect(row.base_unit).toBe('kg')
    expect(row.product_id).toBeNull()
    expect(row.recognition_candidate_id).toBeNull()
    expect(row).not.toHaveProperty('current_quantity')
    expect(row).not.toHaveProperty('balance')
  })

  it('maps core container row back to inventory item domain', () => {
    const item = buildPhase7AInventoryItem()
    const roundTrip = mapContainerRowToInventoryItem({
      ...mapInventoryItemToContainerRow(item),
      created_at: PHASE7A_FIXED_NOW,
    })

    expect(roundTrip).toEqual(item)
  })

  it('maps session-scoped inventory item access fields', () => {
    const item = buildPhase7AInventoryItem({
      accessKind: 'session',
      userId: null,
      sessionAccessHash: PHASE7A_SESSION_HASH,
    })

    const row = mapInventoryItemToContainerRow(item)

    expect(row.access_kind).toBe('session')
    expect(row.user_id).toBeNull()
    expect(row.session_access_hash).toBe(PHASE7A_SESSION_HASH)
    expect(JSON.stringify(row).includes(PHASE7A_SESSION_HASH)).toBe(true)
  })

  it('maps inventory movement domain to core movement row without capture idempotency', () => {
    const movement = buildPhase7AInventoryMovement({
      idempotencyKey: 'movement-idem-1',
      sourceEventRef: 'journal-event-1',
    })
    const row = mapInventoryMovementToRow(movement)

    expect(row.container_id).toBe(PHASE7A_INVENTORY_ITEM_ID)
    expect(row.inventory_idempotency_key).toBe('movement-idem-1')
    expect(row.source_event_ref).toBe('journal-event-1')
    expect(row.capture_idempotency_key).toBeNull()
    expect(row.movement_date).toBe('2026-07-31')
    expect(row.movement_at).toBe(PHASE7A_FIXED_NOW)
  })

  it('maps core movement row back to inventory movement domain', () => {
    const movement = buildPhase7AInventoryMovement()
    const roundTrip = mapMovementRowToInventoryMovement({
      ...mapInventoryMovementToRow(movement),
      created_at: PHASE7A_FIXED_NOW,
    })

    expect(roundTrip).toEqual(movement)
  })

  it('rejects legacy container bindings when mapping to core inventory item', () => {
    expect(() =>
      mapContainerRowToInventoryItem({
        id: PHASE7A_INVENTORY_ITEM_ID,
        saved_product_profile_id: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
        access_kind: 'authenticated_user',
        user_id: PHASE7A_USER_ID,
        session_access_hash: null,
        base_unit: 'kg',
        package_size_value: 25,
        package_size_unit: 'kg',
        label: 'Legacy',
        archived_at: null,
        created_at: PHASE7A_FIXED_NOW,
        product_id: 'legacy-product-id',
        recognition_candidate_id: null,
      }),
    ).toThrow(FertilizerInventoryRepositoryError)
  })

  it('rejects legacy capture idempotency when mapping to core inventory movement', () => {
    expect(() =>
      mapMovementRowToInventoryMovement({
        id: PHASE7A_INVENTORY_MOVEMENT_ID,
        container_id: PHASE7A_INVENTORY_ITEM_ID,
        access_kind: 'authenticated_user',
        user_id: PHASE7A_USER_ID,
        session_access_hash: null,
        quantity_delta: 25,
        unit: 'kg',
        movement_type: 'purchase',
        movement_origin: 'manual',
        movement_at: PHASE7A_FIXED_NOW,
        inventory_idempotency_key: null,
        source_event_ref: null,
        note: null,
        created_at: PHASE7A_FIXED_NOW,
        capture_idempotency_key: 'legacy-capture-key',
      }),
    ).toThrow(FertilizerInventoryRepositoryError)
  })

  it('documents legacy fields that must not become core domain sources', () => {
    expect(FERTILIZER_INVENTORY_LEGACY_CONTAINER_FIELDS).toContain('product_id')
    expect(FERTILIZER_INVENTORY_LEGACY_CONTAINER_FIELDS).toContain('recognition_candidate_id')
    expect(FERTILIZER_INVENTORY_LEGACY_MOVEMENT_FIELDS).toContain('capture_idempotency_key')
  })

  it('does not duplicate product profile data on mapped inventory item', () => {
    const mapped = mapContainerRowToInventoryItem({
      ...mapInventoryItemToContainerRow(buildPhase7AInventoryItem()),
      created_at: PHASE7A_FIXED_NOW,
    }) satisfies FertilizerInventoryItem

    expect(mapped.savedProductProfileId).toBe(PHASE7A_SAVED_PRODUCT_PROFILE_ID)
    expect(mapped.recordSchemaVersion).toBe(FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION)
    expect(mapped).not.toHaveProperty('officialName')
    expect(mapped).not.toHaveProperty('nutrientMatrix')
  })
})
