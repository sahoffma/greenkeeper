import { describe, expect, it } from 'vitest'
import {
  FertilizerProductStockError,
  areFertilizerProductStockIdentitiesEqual,
  buildFertilizerProductStockIdentity,
  serializeFertilizerProductStockIdentityKey,
  toPersistedProductStockIntakeMovementType,
  validateFertilizerProductStockIntake,
  type FertilizerProductStockIntakeReason,
  type ValidatedFertilizerProductStockIntake,
} from './fertilizerProductStockCore'

const USER_ID = 'user-abc-123'
const OTHER_USER_ID = 'user-xyz-456'
const PROFILE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const OTHER_PROFILE_ID = '11111111-2222-4333-8444-555555555555'

function expectProductStockError(
  action: () => unknown,
  code: FertilizerProductStockError['code'],
): FertilizerProductStockError {
  try {
    action()
    expect.unreachable('Expected FertilizerProductStockError.')
  } catch (error) {
    expect(error).toBeInstanceOf(FertilizerProductStockError)
    expect((error as FertilizerProductStockError).code).toBe(code)
    return error as FertilizerProductStockError
  }
}

function intakeInput(
  overrides: Partial<{
    userId: string
    savedProductProfileId: string
    baseUnit: 'kg' | 'ml'
    quantity: number
    reason: FertilizerProductStockIntakeReason
  }> = {},
) {
  return {
    userId: USER_ID,
    savedProductProfileId: PROFILE_ID,
    baseUnit: 'kg' as const,
    quantity: 12.5,
    reason: 'initial_stock' as const,
    ...overrides,
  }
}

function expectValidIntake(
  result: ValidatedFertilizerProductStockIntake,
  expected: {
    quantity: number
    reason: FertilizerProductStockIntakeReason
    baseUnit: 'kg' | 'ml'
  },
): void {
  expect(result.quantity).toBe(expected.quantity)
  expect(result.quantityDelta).toBe(expected.quantity)
  expect(result.quantityDelta).toBeGreaterThan(0)
  expect(result.reason).toBe(expected.reason)
  expect(result.baseUnit).toBe(expected.baseUnit)
  expect(result.stockIdentity.userId).toBe(USER_ID)
  expect(result.stockIdentity.savedProductProfileId).toBe(PROFILE_ID.toLowerCase())
  expect(result.stockIdentity.baseUnit).toBe(expected.baseUnit)
  expect(result).not.toHaveProperty('currentQuantity')
  expect(result).not.toHaveProperty('packageSizeValue')
  expect(result).not.toHaveProperty('packageSize')
  expect(result).not.toHaveProperty('containerId')
  expect(result).not.toHaveProperty('fifo')
  expect(result).not.toHaveProperty('openingDate')
}

describe('fertilizerProductStockCore — product stock identity', () => {
  it('same three inputs yield the same canonical identity', () => {
    const left = buildFertilizerProductStockIdentity({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID,
      baseUnit: 'kg',
    })
    const right = buildFertilizerProductStockIdentity({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID,
      baseUnit: 'kg',
    })

    expect(areFertilizerProductStockIdentitiesEqual(left, right)).toBe(true)
    expect(serializeFertilizerProductStockIdentityKey(left)).toBe(
      serializeFertilizerProductStockIdentityKey(right),
    )
  })

  it('different user yields different identity', () => {
    const left = buildFertilizerProductStockIdentity({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID,
      baseUnit: 'kg',
    })
    const right = buildFertilizerProductStockIdentity({
      userId: OTHER_USER_ID,
      savedProductProfileId: PROFILE_ID,
      baseUnit: 'kg',
    })

    expect(areFertilizerProductStockIdentitiesEqual(left, right)).toBe(false)
  })

  it('different saved product profile yields different identity', () => {
    const left = buildFertilizerProductStockIdentity({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID,
      baseUnit: 'kg',
    })
    const right = buildFertilizerProductStockIdentity({
      userId: USER_ID,
      savedProductProfileId: OTHER_PROFILE_ID,
      baseUnit: 'kg',
    })

    expect(areFertilizerProductStockIdentitiesEqual(left, right)).toBe(false)
  })

  it('different base unit yields different identity', () => {
    const kgIdentity = buildFertilizerProductStockIdentity({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID,
      baseUnit: 'kg',
    })
    const mlIdentity = buildFertilizerProductStockIdentity({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID,
      baseUnit: 'ml',
    })

    expect(areFertilizerProductStockIdentitiesEqual(kgIdentity, mlIdentity)).toBe(false)
  })

  it('product name does not affect identity', () => {
    const identity = buildFertilizerProductStockIdentity({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID,
      baseUnit: 'kg',
    })

    expect(identity).toEqual({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID.toLowerCase(),
      baseUnit: 'kg',
    })
    expect(identity).not.toHaveProperty('productName')
    expect(identity).not.toHaveProperty('officialName')
  })

  it('manufacturer name does not affect identity', () => {
    const identity = buildFertilizerProductStockIdentity({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID,
      baseUnit: 'kg',
    })

    expect(identity).not.toHaveProperty('manufacturer')
    expect(identity).not.toHaveProperty('manufacturerName')
  })

  it('package size does not affect identity', () => {
    const identity = buildFertilizerProductStockIdentity({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID,
      baseUnit: 'kg',
    })

    expect(identity).not.toHaveProperty('packageSizeValue')
    expect(identity).not.toHaveProperty('packageSize')
  })

  it('rejects empty user id', () => {
    expectProductStockError(
      () =>
        buildFertilizerProductStockIdentity({
          userId: '   ',
          savedProductProfileId: PROFILE_ID,
          baseUnit: 'kg',
        }),
      'product_stock_user_id_invalid',
    )
  })

  it('rejects empty saved profile id', () => {
    expectProductStockError(
      () =>
        buildFertilizerProductStockIdentity({
          userId: USER_ID,
          savedProductProfileId: '',
          baseUnit: 'kg',
        }),
      'product_stock_saved_profile_id_invalid',
    )
  })

  it('rejects invalid base unit', () => {
    expectProductStockError(
      () =>
        buildFertilizerProductStockIdentity({
          userId: USER_ID,
          savedProductProfileId: PROFILE_ID,
          baseUnit: 'l' as 'kg',
        }),
      'product_stock_base_unit_invalid',
    )
  })
})

describe('fertilizerProductStockCore — valid intake', () => {
  it('accepts initial_stock with positive kg quantity', () => {
    const result = validateFertilizerProductStockIntake(
      intakeInput({ reason: 'initial_stock', quantity: 25, baseUnit: 'kg' }),
      { profileSnapshot: { productForm: 'granular' } },
    )

    expectValidIntake(result, { quantity: 25, reason: 'initial_stock', baseUnit: 'kg' })
  })

  it('accepts initial_stock with positive ml quantity', () => {
    const result = validateFertilizerProductStockIntake(
      intakeInput({ reason: 'initial_stock', quantity: 1.5, baseUnit: 'ml' }),
      { profileSnapshot: { productForm: 'liquid' } },
    )

    expectValidIntake(result, { quantity: 1.5, reason: 'initial_stock', baseUnit: 'ml' })
  })

  it('accepts purchase', () => {
    const result = validateFertilizerProductStockIntake(intakeInput({ reason: 'purchase' }))

    expectValidIntake(result, { quantity: 12.5, reason: 'purchase', baseUnit: 'kg' })
  })

  it('accepts gift_received', () => {
    const result = validateFertilizerProductStockIntake(intakeInput({ reason: 'gift_received' }))

    expectValidIntake(result, { quantity: 12.5, reason: 'gift_received', baseUnit: 'kg' })
  })

  it('accepts quantity with up to four decimal places', () => {
    const result = validateFertilizerProductStockIntake(intakeInput({ quantity: 0.1234 }))

    expect(result.quantity).toBe(0.1234)
    expect(result.quantityDelta).toBe(0.1234)
  })

  it('result contains canonical stock identity', () => {
    const result = validateFertilizerProductStockIntake(intakeInput())

    expect(result.stockIdentity).toEqual({
      userId: USER_ID,
      savedProductProfileId: PROFILE_ID.toLowerCase(),
      baseUnit: 'kg',
    })
  })

  it('result is strictly positive', () => {
    const result = validateFertilizerProductStockIntake(intakeInput({ quantity: 0.0001 }))

    expect(result.quantityDelta).toBeGreaterThan(0)
    expect(result.quantity).toBeGreaterThan(0)
  })

  it('different intakes on the same stock share identity', () => {
    const purchase = validateFertilizerProductStockIntake(intakeInput({ reason: 'purchase' }))
    const gift = validateFertilizerProductStockIntake(intakeInput({ reason: 'gift_received' }))

    expect(
      areFertilizerProductStockIdentitiesEqual(
        purchase.stockIdentity,
        gift.stockIdentity,
      ),
    ).toBe(true)
  })
})

describe('fertilizerProductStockCore — invalid quantities', () => {
  it('rejects zero', () => {
    expectProductStockError(
      () => validateFertilizerProductStockIntake(intakeInput({ quantity: 0 })),
      'product_stock_quantity_invalid',
    )
  })

  it('rejects negative quantity', () => {
    expectProductStockError(
      () => validateFertilizerProductStockIntake(intakeInput({ quantity: -1 })),
      'product_stock_quantity_invalid',
    )
  })

  it('rejects NaN', () => {
    expectProductStockError(
      () => validateFertilizerProductStockIntake(intakeInput({ quantity: Number.NaN })),
      'product_stock_quantity_invalid',
    )
  })

  it('rejects positive infinity', () => {
    expectProductStockError(
      () => validateFertilizerProductStockIntake(intakeInput({ quantity: Number.POSITIVE_INFINITY })),
      'product_stock_quantity_invalid',
    )
  })

  it('rejects negative infinity', () => {
    expectProductStockError(
      () => validateFertilizerProductStockIntake(intakeInput({ quantity: Number.NEGATIVE_INFINITY })),
      'product_stock_quantity_invalid',
    )
  })

  it('rejects more than four decimal places', () => {
    expectProductStockError(
      () => validateFertilizerProductStockIntake(intakeInput({ quantity: 1.23456 })),
      'product_stock_quantity_precision_invalid',
    )
  })

  it('does not silently round excessive precision', () => {
    expect(() => validateFertilizerProductStockIntake(intakeInput({ quantity: 2.00001 }))).toThrow(
      FertilizerProductStockError,
    )
  })
})

describe('fertilizerProductStockCore — invalid reasons', () => {
  const rejectedReasons = [
    'application',
    'gift_given',
    'disposed',
    'inventory_correction',
    'sale',
    'unknown_reason',
    'fertilization',
  ] as const

  it.each(rejectedReasons)('rejects %s', (reason) => {
    expectProductStockError(
      () =>
        validateFertilizerProductStockIntake(
          intakeInput({ reason: reason as FertilizerProductStockIntakeReason }),
        ),
      'product_stock_intake_reason_invalid',
    )
  })
})

describe('fertilizerProductStockCore — units and form', () => {
  it('granular + kg is valid', () => {
    const result = validateFertilizerProductStockIntake(intakeInput({ baseUnit: 'kg' }), {
      profileSnapshot: { productForm: 'granular' },
    })

    expect(result.baseUnit).toBe('kg')
  })

  it('granular + ml is invalid', () => {
    expectProductStockError(
      () =>
        validateFertilizerProductStockIntake(intakeInput({ baseUnit: 'ml' }), {
          profileSnapshot: { productForm: 'granular' },
        }),
      'product_stock_form_unit_mismatch',
    )
  })

  it('liquid + ml is valid', () => {
    const result = validateFertilizerProductStockIntake(
      intakeInput({ baseUnit: 'ml', quantity: 3 }),
      { profileSnapshot: { productForm: 'liquid' } },
    )

    expect(result.baseUnit).toBe('ml')
  })

  it('liquid + kg is invalid', () => {
    expectProductStockError(
      () =>
        validateFertilizerProductStockIntake(intakeInput({ baseUnit: 'kg' }), {
          profileSnapshot: { productForm: 'liquid' },
        }),
      'product_stock_form_unit_mismatch',
    )
  })

  it('does not convert mass and volume', () => {
    expectProductStockError(
      () =>
        validateFertilizerProductStockIntake(intakeInput({ baseUnit: 'ml', quantity: 10 }), {
          profileSnapshot: { productForm: 'granular' },
        }),
      'product_stock_form_unit_mismatch',
    )
  })

  it('different profile versions remain different stocks', () => {
    const first = validateFertilizerProductStockIntake(intakeInput())
    const second = validateFertilizerProductStockIntake(
      intakeInput({ savedProductProfileId: OTHER_PROFILE_ID }),
    )

    expect(
      areFertilizerProductStockIdentitiesEqual(first.stockIdentity, second.stockIdentity),
    ).toBe(false)
  })
})

describe('fertilizerProductStockCore — persistence adapter', () => {
  it('maps domain intake reasons to current persisted positive enum names', () => {
    expect(toPersistedProductStockIntakeMovementType('initial_stock')).toBe('initial_stock')
    expect(toPersistedProductStockIntakeMovementType('purchase')).toBe('purchase')
    expect(toPersistedProductStockIntakeMovementType('gift_received')).toBe('gift_received')
  })
})

describe('fertilizerProductStockCore — abgrenzung', () => {
  it('excludes package, container, fifo, and currentQuantity from intake result', () => {
    const result = validateFertilizerProductStockIntake(intakeInput())

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('currentQuantity')
    expect(serialized).not.toContain('packageSize')
    expect(serialized).not.toContain('container')
    expect(serialized).not.toContain('fifo')
    expect(serialized).not.toContain('openingDate')
  })
})
