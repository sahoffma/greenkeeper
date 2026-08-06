import { describe, expect, it } from 'vitest'
import {
  stressManagerDetailRpcItemPayload,
  STRESS_MANAGER_SAVED_NUTRIENT_MATRIX,
} from './fertilizerProductDetailStressManagerFixtures'
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

  it('skips invalid rows instead of failing the entire list', () => {
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
        {
          inventoryItemId: ITEM_B,
          savedProductProfileId: PROFILE_B,
          baseUnit: 'lb',
          balance: 1,
        },
      ],
    })

    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]?.inventoryItemId).toBe(ITEM_A)
  })

  it('parses JSON string payloads from rpc responses', () => {
    const payload = parseActiveProductStockListPayload(
      JSON.stringify({
        items: [
          {
            inventoryItemId: ITEM_A,
            savedProductProfileId: PROFILE_A,
            baseUnit: 'kg',
            balance: 2,
            manufacturer: null,
            officialName: 'Frühjahr',
            productForm: 'granular',
            movementCount: 1,
            lastMovementAt: null,
          },
        ],
      }),
    )

    expect(payload.items).toHaveLength(1)
    expect(payload.items[0]?.balance).toBe(2)
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

  it('maps active rows to stock list items with npk summary', () => {
    const item = mapActiveProductStockRowToListItem(
      activeRow({
        nitrogen: 12,
        phosphate: 5,
        potash: 8,
      }),
    )

    expect(item.npkSummary).toBe('NPK 12-5-8')
  })

  it('parses detail fields from rpc rows', () => {
    const row = parseActiveProductStockReadRow({
      inventoryItemId: ITEM_A,
      savedProductProfileId: PROFILE_A,
      baseUnit: 'kg',
      balance: 3,
      manufacturer: 'Hersteller',
      officialName: 'Produkt',
      productLine: 'Linie',
      variant: 'Variante',
      productForm: 'granular',
      npkDeclaration: '10-5-8',
      nitrogen: 10,
      phosphate: 5,
      potash: 8,
      nutrientMatrix: { iron: { value: 1, unit: '%', declarationBasis: 'Fe' } },
      packageSizeValue: 25,
      packageSizeUnit: 'kg',
      movementCount: 1,
      lastMovementAt: null,
    })

    expect(row.productLine).toBe('Linie')
    expect(row.nutrientMatrix?.iron?.value).toBe(1)
    expect(row.packageSizeValue).toBe(25)
  })

  it('parses the live Stress-Manager nutrient matrix without loss', () => {
    const row = parseActiveProductStockReadRow(stressManagerDetailRpcItemPayload())

    expect(row.nutrientMatrix?.iron?.value).toBe(0)
    expect(row.nutrientMatrix?.potash?.value).toBe(30)
    expect(row.nutrientMatrix?.manganese?.declarationBasis).toBe('Mn')
    expect(Object.keys(row.nutrientMatrix ?? {}).sort()).toEqual(
      Object.keys(STRESS_MANAGER_SAVED_NUTRIENT_MATRIX).sort(),
    )
  })

  it('returns null nutrientMatrix when rpc omits it (pre-50815 shape)', () => {
    const row = parseActiveProductStockReadRow({
      inventoryItemId: ITEM_A,
      savedProductProfileId: PROFILE_A,
      baseUnit: 'kg',
      balance: 5,
      manufacturer: 'Rasendoktor',
      officialName: 'Stress-Manager',
      productForm: 'granular',
      movementCount: 1,
      lastMovementAt: null,
    })

    expect(row.nutrientMatrix).toBeNull()
  })
})
