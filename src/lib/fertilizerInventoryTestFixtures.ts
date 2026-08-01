import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import {
  FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  type FertilizerInventoryItem,
  type FertilizerInventoryMovement,
} from '../types/fertilizerInventoryCore'

export const PHASE7A_FIXED_NOW = '2026-07-31T12:00:00.000Z'
export const PHASE7A_USER_ID = '00000000-0000-4000-8000-0000000007a1'
export const PHASE7A_SESSION_ID = 'session-phase7a-test'
export const PHASE7A_SESSION_HASH = 'abcdef0123456789'.repeat(4)
export const PHASE7A_SAVED_PRODUCT_PROFILE_ID = '11111111-1111-4111-8111-111111117a01'
export const PHASE7A_INVENTORY_ITEM_ID = '22222222-2222-4222-8222-222222227a01'
export const PHASE7A_INVENTORY_MOVEMENT_ID = '33333333-3333-4333-8333-333333337a01'

export function phase7AAuthenticatedAccessContext(): FertilizerEnrichmentAccessContext {
  return {
    kind: 'authenticated_user',
    userId: PHASE7A_USER_ID,
  }
}

export function phase7ASessionAccessContext(): FertilizerEnrichmentAccessContext {
  return {
    kind: 'session',
    sessionId: PHASE7A_SESSION_ID,
  }
}

export function buildPhase7AInventoryItem(
  overrides: Partial<FertilizerInventoryItem> = {},
): FertilizerInventoryItem {
  return {
    id: PHASE7A_INVENTORY_ITEM_ID,
    accessKind: 'authenticated_user',
    userId: PHASE7A_USER_ID,
    sessionAccessHash: null,
    savedProductProfileId: PHASE7A_SAVED_PRODUCT_PROFILE_ID,
    baseUnit: 'kg',
    packageSizeValue: 25,
    packageSizeUnit: 'kg',
    label: '25 kg Sack',
    status: 'active',
    createdAt: PHASE7A_FIXED_NOW,
    archivedAt: null,
    recordSchemaVersion: FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
    ...overrides,
  }
}

export function buildPhase7AInventoryMovement(
  overrides: Partial<FertilizerInventoryMovement> = {},
): FertilizerInventoryMovement {
  return {
    id: PHASE7A_INVENTORY_MOVEMENT_ID,
    inventoryItemId: PHASE7A_INVENTORY_ITEM_ID,
    accessKind: 'authenticated_user',
    userId: PHASE7A_USER_ID,
    sessionAccessHash: null,
    quantityDelta: 25,
    unit: 'kg',
    movementType: 'initial_stock',
    movementOrigin: 'manual',
    movementAt: PHASE7A_FIXED_NOW,
    sourceEventRef: null,
    idempotencyKey: null,
    note: null,
    createdAt: PHASE7A_FIXED_NOW,
    recordSchemaVersion: FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
    ...overrides,
  }
}

export function buildPhase7AInitialStockScenario(): {
  item: FertilizerInventoryItem
  initialMovement: FertilizerInventoryMovement
  applicationMovement: FertilizerInventoryMovement
} {
  const item = buildPhase7AInventoryItem()
  const initialMovement = buildPhase7AInventoryMovement({
    id: `${PHASE7A_INVENTORY_MOVEMENT_ID}-initial`,
    quantityDelta: 25,
    movementType: 'initial_stock',
  })
  const applicationMovement = buildPhase7AInventoryMovement({
    id: `${PHASE7A_INVENTORY_MOVEMENT_ID}-application`,
    quantityDelta: -8,
    movementType: 'fertilization',
    movementAt: '2026-08-01T09:00:00.000Z',
    createdAt: '2026-08-01T09:00:00.000Z',
  })

  return { item, initialMovement, applicationMovement }
}
