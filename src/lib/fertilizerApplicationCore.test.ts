import { describe, expect, it } from 'vitest'
import {
  buildCanonicalFertilizerApplicationPayload,
  FERTILIZER_APPLICATION_ERROR_CODES,
  FertilizerApplicationError,
  normalizeFertilizerApplicationCommand,
  validateApplicationAmount,
  validateApplicationTargetKind,
  validateApplicationUnit,
  validateAppliedAt,
  assertApplicationUnitMatchesInventoryBaseUnit,
} from './fertilizerApplicationCore'

const BASE_INPUT = {
  inventoryItemId: '11111111-1111-4111-8111-111111111111',
  savedProductProfileId: '22222222-2222-4222-8222-222222222222',
  targetKind: 'area' as const,
  targetId: '33333333-3333-4333-8333-333333333333',
  applicationAmount: 2.5,
  applicationUnit: 'kg',
  appliedAt: '2026-08-02T10:00:00.000Z',
  idempotencyKey: 'apply-test-key',
  userId: '44444444-4444-4444-8444-444444444444',
}

describe('fertilizerApplicationCore', () => {
  it('accepts a valid kg application', () => {
    const result = normalizeFertilizerApplicationCommand(BASE_INPUT)
    expect(result.applicationUnit).toBe('kg')
    expect(result.applicationAmount).toBe(2.5)
    expect(result.targetKind).toBe('area')
  })

  it('accepts a valid ml application', () => {
    const result = normalizeFertilizerApplicationCommand({
      ...BASE_INPUT,
      applicationAmount: 750,
      applicationUnit: 'ml',
    })
    expect(result.applicationUnit).toBe('ml')
    expect(result.applicationAmount).toBe(750)
  })

  it('rejects amount zero', () => {
    expect(() =>
      validateApplicationAmount(0),
    ).toThrow(FertilizerApplicationError)
    expect(() => validateApplicationAmount(0)).toThrow(/greater than zero/)
  })

  it('rejects negative amount', () => {
    expect(() => validateApplicationAmount(-1)).toThrow(FertilizerApplicationError)
  })

  it('rejects more than four decimal places', () => {
    expect(() => validateApplicationAmount(1.12345)).toThrow(FertilizerApplicationError)
    try {
      validateApplicationAmount(1.12345)
    } catch (error) {
      expect(error).toBeInstanceOf(FertilizerApplicationError)
      expect((error as FertilizerApplicationError).code).toBe('APPLICATION_AMOUNT_PRECISION_INVALID')
    }
  })

  it('rejects g as application unit', () => {
    expect(() => validateApplicationUnit('g')).toThrow(FertilizerApplicationError)
    try {
      validateApplicationUnit('g')
    } catch (error) {
      expect((error as FertilizerApplicationError).code).toBe('APPLICATION_UNIT_INVALID')
    }
  })

  it('rejects l as application unit', () => {
    expect(() => validateApplicationUnit('l')).toThrow(FertilizerApplicationError)
  })

  it('rejects kg/ml mismatch against inventory base unit', () => {
    expect(() =>
      assertApplicationUnitMatchesInventoryBaseUnit('kg', 'ml'),
    ).toThrow(FertilizerApplicationError)
    try {
      assertApplicationUnitMatchesInventoryBaseUnit('ml', 'kg')
    } catch (error) {
      expect((error as FertilizerApplicationError).code).toBe('APPLICATION_UNIT_MISMATCH')
    }
  })

  it('rejects missing target kind', () => {
    expect(() => validateApplicationTargetKind('care_group')).toThrow(FertilizerApplicationError)
  })

  it('rejects invalid appliedAt', () => {
    expect(() => validateAppliedAt('')).toThrow(FertilizerApplicationError)
    expect(() => validateAppliedAt('not-a-date')).toThrow(FertilizerApplicationError)
  })

  it('normalizes appliedAt to ISO string', () => {
    const result = normalizeFertilizerApplicationCommand({
      ...BASE_INPUT,
      appliedAt: '2026-08-02T12:00:00+02:00',
    })
    expect(result.appliedAt).toBe('2026-08-02T10:00:00.000Z')
  })

  it('builds stable canonical idempotency payload', () => {
    const normalized = normalizeFertilizerApplicationCommand({
      ...BASE_INPUT,
      note: '  Randstreifen  ',
      sourceEventRef: ' ui:apply:1 ',
    })
    const payload = buildCanonicalFertilizerApplicationPayload(normalized)
    expect(JSON.parse(payload)).toEqual({
      inventoryItemId: BASE_INPUT.inventoryItemId,
      savedProductProfileId: BASE_INPUT.savedProductProfileId,
      targetKind: 'area',
      targetId: BASE_INPUT.targetId,
      applicationAmount: 2.5,
      applicationUnit: 'kg',
      appliedAt: BASE_INPUT.appliedAt,
      sourceEventRef: 'ui:apply:1',
      note: 'Randstreifen',
      userId: BASE_INPUT.userId,
    })
    expect(
      normalizeFertilizerApplicationCommand({
        ...BASE_INPUT,
        note: '  Randstreifen  ',
        sourceEventRef: ' ui:apply:1 ',
      }).canonicalPayload,
    ).toBe(payload)
  })

  it('does not mutate the input object', () => {
    const input = {
      ...BASE_INPUT,
      note: ' original ',
      sourceEventRef: ' ref ',
    }
    const snapshot = structuredClone(input)
    normalizeFertilizerApplicationCommand(input)
    expect(input).toEqual(snapshot)
  })

  it('models exactly one inventory item per command', () => {
    const result = normalizeFertilizerApplicationCommand(BASE_INPUT)
    expect(result.inventoryItemId).toBe(BASE_INPUT.inventoryItemId)
    expect(result).not.toHaveProperty('inventoryItemIds')
  })

  it('exposes the documented error codes', () => {
    expect(FERTILIZER_APPLICATION_ERROR_CODES).toContain('INSUFFICIENT_STOCK')
    expect(FERTILIZER_APPLICATION_ERROR_CODES).toContain('IDEMPOTENCY_CONFLICT')
    expect(FERTILIZER_APPLICATION_ERROR_CODES).not.toContain('inventory_correction')
  })
})
