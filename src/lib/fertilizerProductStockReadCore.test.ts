import { describe, expect, it } from 'vitest'
import {
  findActiveProductStockRowByInventoryItemId,
  groupActiveProductStockRowsByIdentity,
  isActiveCanonicalProductStockCandidate,
  mapActiveProductStockRowToListItem,
  mapActiveProductStockRowsToListItems,
  parseActiveProductStockItemPayload,
  parseActiveProductStockListPayload,
  parseActiveProductStockReadRow,
  type ActiveCanonicalProductStockCandidate,
  type ActiveProductStockReadRow,
} from './fertilizerProductStockReadCore'

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const PROFILE_A = '11111111-1111-4111-8111-111111111111'
const PROFILE_B = '22222222-2222-4222-8222-222222222222'
const ITEM_A = '33333333-3333-4333-8333-333333333333'
const ITEM_B = '44444444-4444-4444-8444-444444444444'

function activeCandidate(
  overrides: Partial<ActiveCanonicalProductStockCandidate> = {},
): ActiveCanonicalProductStockCandidate {
  return {
    stockKind: 'product_stock',
    archivedAt: null,
    supersededByContainerId: null,
    savedProductProfileId: PROFILE_A,
    baseUnit: 'kg',
    accessKind: 'authenticated_user',
    userId: USER_ID,
    ownerUserId: USER_ID,
    profileStatus: 'saved',
    profileSource: 'enrichment',
    ...overrides,
  }
}

function activeRow(overrides: Partial<ActiveProductStockReadRow> = {}): ActiveProductStockReadRow {
  return {
    inventoryItemId: ITEM_A,
    savedProductProfileId: PROFILE_A,
    baseUnit: 'kg',
    balance: 12.3456,
    manufacturer: 'Rasendoktor',
    officialName: 'Frühjahr',
    productForm: 'granular',
    movementCount: 2,
    lastMovementAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('fertilizerProductStockReadCore', () => {
  it('accepts active canonical product stock candidates', () => {
    expect(isActiveCanonicalProductStockCandidate(activeCandidate(), USER_ID)).toBe(true)
  })

  it('excludes legacy rows without product_stock stock_kind', () => {
    expect(isActiveCanonicalProductStockCandidate(activeCandidate({ stockKind: null }), USER_ID)).toBe(
      false,
    )
    expect(
      isActiveCanonicalProductStockCandidate(activeCandidate({ stockKind: 'legacy_container' }), USER_ID),
    ).toBe(false)
  })

  it('excludes archived canonical rows', () => {
    expect(
      isActiveCanonicalProductStockCandidate(
        activeCandidate({ archivedAt: '2026-08-01T00:00:00.000Z' }),
        USER_ID,
      ),
    ).toBe(false)
  })

  it('excludes superseded rows', () => {
    expect(
      isActiveCanonicalProductStockCandidate(
        activeCandidate({ supersededByContainerId: ITEM_B }),
        USER_ID,
      ),
    ).toBe(false)
  })

  it('excludes rows without saved product profile', () => {
    expect(
      isActiveCanonicalProductStockCandidate(activeCandidate({ savedProductProfileId: null }), USER_ID),
    ).toBe(false)
  })

  it('rejects invalid base units', () => {
    expect(isActiveCanonicalProductStockCandidate(activeCandidate({ baseUnit: 'lb' }), USER_ID)).toBe(
      false,
    )
    expect(isActiveCanonicalProductStockCandidate(activeCandidate({ baseUnit: null }), USER_ID)).toBe(
      false,
    )
  })

  it('keeps kg and ml separate by identity grouping', () => {
    const rows = [
      activeRow({ inventoryItemId: ITEM_A, baseUnit: 'kg' }),
      activeRow({ inventoryItemId: ITEM_B, baseUnit: 'ml', balance: 500 }),
    ]

    const groups = groupActiveProductStockRowsByIdentity(rows)
    expect(groups.size).toBe(2)
    expect(groups.get(`${PROFILE_A}:kg`)).toHaveLength(1)
    expect(groups.get(`${PROFILE_A}:ml`)).toHaveLength(1)
  })

  it('keeps different saved product profiles separate', () => {
    const rows = [
      activeRow({ inventoryItemId: ITEM_A, savedProductProfileId: PROFILE_A }),
      activeRow({ inventoryItemId: ITEM_B, savedProductProfileId: PROFILE_B }),
    ]

    const groups = groupActiveProductStockRowsByIdentity(rows)
    expect(groups.size).toBe(2)
  })

  it('does not use product name as identity key', () => {
    const rows = [
      activeRow({
        inventoryItemId: ITEM_A,
        officialName: 'Same Name',
        manufacturer: 'Brand A',
      }),
      activeRow({
        inventoryItemId: ITEM_B,
        savedProductProfileId: PROFILE_B,
        officialName: 'Same Name',
        manufacturer: 'Brand A',
      }),
    ]

    const groups = groupActiveProductStockRowsByIdentity(rows)
    expect(groups.size).toBe(2)
  })

  it('maps balance without changing negative values', () => {
    const item = mapActiveProductStockRowToListItem(activeRow({ balance: -1.25 }))
    expect(item.balance).toBe(-1.25)
  })

  it('preserves up to four decimal places', () => {
    const item = mapActiveProductStockRowToListItem(activeRow({ balance: 3.4567 }))
    expect(item.balance).toBe(3.4567)
  })

  it('uses base unit for display and does not expose package size identity', () => {
    const item = mapActiveProductStockRowToListItem(activeRow())
    expect(item.unit).toBe('kg')
    expect(item.baseUnit).toBe('kg')
    expect(item.packageSizeValue).toBeNull()
    expect(item.packageSizeUnit).toBeNull()
  })

  it('parses list payload and maps rows to stock list items', () => {
    const payload = parseActiveProductStockListPayload({
      items: [
        {
          inventoryItemId: ITEM_A,
          savedProductProfileId: PROFILE_A,
          baseUnit: 'kg',
          balance: 7.5,
          manufacturer: 'Rasendoktor',
          officialName: 'Frühjahr',
          productForm: 'granular',
          movementCount: 1,
          lastMovementAt: '2026-08-01T10:00:00.000Z',
        },
      ],
    })

    const items = mapActiveProductStockRowsToListItems(payload.items)
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe(ITEM_A)
    expect(items[0]?.savedProductProfileId).toBe(PROFILE_A)
    expect(items[0]?.productLabel).toBe('Rasendoktor Frühjahr')
  })

  it('parses single item payload and returns null when missing', () => {
    expect(parseActiveProductStockItemPayload(null)).toBeNull()
    expect(parseActiveProductStockItemPayload({ item: null })).toBeNull()

    const row = parseActiveProductStockItemPayload({
      item: {
        inventoryItemId: ITEM_A,
        savedProductProfileId: PROFILE_A,
        baseUnit: 'ml',
        balance: 0,
        manufacturer: null,
        officialName: 'Liquid',
        productForm: 'liquid',
        movementCount: 0,
        lastMovementAt: null,
      },
    })

    expect(row?.baseUnit).toBe('ml')
    expect(row?.balance).toBe(0)
  })

  it('rejects invalid base unit in parsed rows', () => {
    expect(() =>
      parseActiveProductStockReadRow({
        inventoryItemId: ITEM_A,
        savedProductProfileId: PROFILE_A,
        baseUnit: 'lb',
        balance: 1,
      }),
    ).toThrow(/INVALID_BASE_UNIT/)
  })

  it('finds rows by inventory item id', () => {
    const rows = [activeRow(), activeRow({ inventoryItemId: ITEM_B, baseUnit: 'ml' })]
    expect(findActiveProductStockRowByInventoryItemId(rows, ITEM_B)?.baseUnit).toBe('ml')
    expect(findActiveProductStockRowByInventoryItemId(rows, 'missing')).toBeNull()
  })

  it('excludes foreign user candidates when current user is provided', () => {
    expect(
      isActiveCanonicalProductStockCandidate(
        activeCandidate({ userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
        USER_ID,
      ),
    ).toBe(false)
  })
})
