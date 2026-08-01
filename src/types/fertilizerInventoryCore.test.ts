import { describe, expect, it } from 'vitest'
import {
  FERTILIZER_ENRICHMENT_ACCESS_CONTEXT_KINDS,
} from './fertilizerEnrichmentOrchestration'
import {
  FERTILIZER_INVENTORY_BASE_UNITS,
  FERTILIZER_INVENTORY_ERROR_CODES,
  FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS,
  FERTILIZER_INVENTORY_ITEM_STATUSES,
  FERTILIZER_INVENTORY_MOVEMENT_ORIGINS,
  FERTILIZER_INVENTORY_MOVEMENT_TYPES,
  FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION,
  FertilizerInventoryError,
  isFertilizerInventoryBaseUnit,
  resolveInventoryBaseUnitFromProductForm,
  type FertilizerInventoryItem,
  type FertilizerInventoryMovement,
} from './fertilizerInventoryCore'
import {
  buildPhase7AInventoryItem,
  buildPhase7AInventoryMovement,
} from '../lib/fertilizerInventoryTestFixtures'

describe('fertilizerInventoryCore types', () => {
  it('exports the inventory core record schema version', () => {
    expect(FERTILIZER_INVENTORY_RECORD_SCHEMA_VERSION).toBe('fertilizer-inventory-core-v1')
  })

  it('reuses Phase 5 access context kinds without introducing inventory-specific scopes', () => {
    expect(FERTILIZER_ENRICHMENT_ACCESS_CONTEXT_KINDS).toEqual(['authenticated_user', 'session'])
  })

  it('limits internal base units to kg and ml only', () => {
    expect(FERTILIZER_INVENTORY_BASE_UNITS).toEqual(['kg', 'ml'])
    expect(isFertilizerInventoryBaseUnit('kg')).toBe(true)
    expect(isFertilizerInventoryBaseUnit('ml')).toBe(true)
    expect(isFertilizerInventoryBaseUnit('l')).toBe(false)
    expect(isFertilizerInventoryBaseUnit('g')).toBe(false)
  })

  it('maps product form to base unit without volume conversion', () => {
    expect(resolveInventoryBaseUnitFromProductForm('granular')).toBe('kg')
    expect(resolveInventoryBaseUnitFromProductForm('liquid')).toBe('ml')
  })

  it('lists controlled movement types and origins aligned with legacy inventory enums', () => {
    expect(FERTILIZER_INVENTORY_MOVEMENT_TYPES).toContain('initial_stock')
    expect(FERTILIZER_INVENTORY_MOVEMENT_TYPES).toContain('fertilization')
    expect(FERTILIZER_INVENTORY_MOVEMENT_ORIGINS).toEqual([
      'manual',
      'journal',
      'system',
      'migration',
    ])
  })

  it('lists inventory item statuses without quantity semantics', () => {
    expect(FERTILIZER_INVENTORY_ITEM_STATUSES).toEqual(['active', 'depleted'])
  })

  it('documents forbidden persisted item fields including quantity and product duplication', () => {
    expect(FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS).toContain('currentQuantity')
    expect(FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS).toContain('balance')
    expect(FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS).toContain('remainingAmount')
    expect(FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS).toContain('officialName')
    expect(FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS).toContain('productForm')
    expect(FERTILIZER_INVENTORY_FORBIDDEN_ITEM_FIELDS).toContain('productId')
  })

  it('defines inventory error codes for validation and future repository boundaries', () => {
    expect(FERTILIZER_INVENTORY_ERROR_CODES).toContain('invalid_inventory_record')
    expect(FERTILIZER_INVENTORY_ERROR_CODES).toContain('access_scope_mismatch')
    expect(FERTILIZER_INVENTORY_ERROR_CODES).toContain('unit_mismatch')
    expect(FERTILIZER_INVENTORY_ERROR_CODES).toContain('forbidden_inventory_field')
    expect(FERTILIZER_INVENTORY_ERROR_CODES).toContain('product_version_not_found')
    expect(new Set(FERTILIZER_INVENTORY_ERROR_CODES).size).toBe(
      FERTILIZER_INVENTORY_ERROR_CODES.length,
    )
  })

  it('carries error codes on FertilizerInventoryError', () => {
    const error = new FertilizerInventoryError('unit_mismatch', 'Units differ.')

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('FertilizerInventoryError')
    expect(error.code).toBe('unit_mismatch')
    expect(error.message).toBe('Units differ.')
  })

  it('models inventory item as physical package metadata without current content', () => {
    const item: FertilizerInventoryItem = buildPhase7AInventoryItem()

    expect(item.savedProductProfileId).toBeTruthy()
    expect(item.packageSizeValue).toBe(25)
    expect(item.packageSizeUnit).toBe('kg')
    expect(item).not.toHaveProperty('currentQuantity')
    expect(item).not.toHaveProperty('balance')
    expect(item).not.toHaveProperty('officialName')
  })

  it('models inventory movement as the sole quantity mutation contract', () => {
    const movement: FertilizerInventoryMovement = buildPhase7AInventoryMovement({
      quantityDelta: -8,
      movementType: 'fertilization',
    })

    expect(movement.quantityDelta).toBe(-8)
    expect(movement.unit).toBe('kg')
    expect(movement.inventoryItemId).toBeTruthy()
  })

  it('does not import legacy capture inventory modules in the core type module', async () => {
    const source = await import('./fertilizerInventoryCore?raw')
    const sourceText = String(source.default)

    expect(sourceText).not.toMatch(/from '\.\/fertilizerInventory'/)
    expect(sourceText).not.toMatch(/ProductRecognize/)
    expect(sourceText).not.toMatch(/save_fertilizer_capture/)
  })
})
