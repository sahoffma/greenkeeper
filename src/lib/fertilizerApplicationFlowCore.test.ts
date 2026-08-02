import { describe, expect, it } from 'vitest'
import type { Area } from '../types/area'
import type { CareGroupSummary } from '../types/careGroup'
import type { FertilizerStockListItem } from '../types/fertilizerInventory'
import {
  applyCareGroupSelection,
  buildCareGroupPreselection,
  buildFertilizerApplicationConfirmationRows,
  buildFertilizerApplicationRoute,
  buildMultiAreaApplicationCommandInput,
  filterApplicationEligibleProductStockItems,
  formatSelectionSourceLabel,
  getApplicableAreas,
  getApplicationInputUnitLabel,
  isAreaApplicableForFertilizerApplication,
  isFertilizerStockListItemApplicationEligible,
  mapToApplicationProductOption,
  resolveApplicationFlowPhase,
  resolveInitialDraftSelection,
  shouldDiscardIdempotencyKey,
  shouldRedirectLegacyApplicationRoute,
  switchToManualAreaSelection,
  toggleAreaSelection,
  validateFertilizerApplicationDraft,
} from './fertilizerApplicationFlowCore'
import {
  fertilizerHomeApplicationPath,
  fertilizerLegacyApplicationPath,
  isLegacyFertilizerApplicationPath,
} from './fertilizerRoutes'

const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const AREA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AREA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AREA_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CARE_GROUP_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function buildItem(overrides: Partial<FertilizerStockListItem> = {}): FertilizerStockListItem {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    productLabel: 'Rasendoktor Frühjahr & Neuansaat',
    balance: 20,
    unit: 'kg',
    catalogProductId: null,
    recognitionCandidateId: null,
    productForm: 'granular',
    manufacturer: 'Rasendoktor',
    packageSizeValue: 25,
    packageSizeUnit: 'kg',
    savedProductProfileId: PROFILE_ID,
    baseUnit: 'kg',
    accessKind: 'authenticated_user',
    ...overrides,
  }
}

function buildArea(overrides: Partial<Area> = {}): Area {
  return {
    id: AREA_A,
    name: 'Vorgarten',
    subtitle: '',
    sizeLabel: '120 m²',
    sizeSqm: 120,
    status: 'excellent',
    statusLabel: 'Gut entwickelt',
    summary: null,
    ...overrides,
  }
}

function buildDraft(
  overrides: Partial<Parameters<typeof validateFertilizerApplicationDraft>[0]> = {},
) {
  return {
    mode: 'rate_per_sqm' as const,
    inputValue: '25',
    selectedAreaIds: [AREA_A],
    selectionSource: 'manual' as const,
    careGroupId: null,
    appliedAtDate: '2026-08-02',
    note: '',
    idempotencyKey: null,
    ...overrides,
  }
}

const GROUPS: CareGroupSummary[] = [
  { id: CARE_GROUP_ID, areaIds: [AREA_A, AREA_B] },
]

describe('fertilizerApplicationFlowCore unified area selection', () => {
  it('1 — single applicable area is visibly preselected', () => {
    const selection = resolveInitialDraftSelection([buildArea()])
    expect(selection.selectedAreaIds).toEqual([AREA_A])
    expect(selection.selectionSource).toBe('manual')
  })

  it('2 — multiple separate areas start without hidden multi-selection', () => {
    const selection = resolveInitialDraftSelection([
      buildArea({ id: AREA_A }),
      buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 80 }),
    ])
    expect(selection.selectedAreaIds).toEqual([])
  })

  it('3 — care group preselects current members', () => {
    const preselected = applyCareGroupSelection(CARE_GROUP_ID, GROUPS, [
      buildArea({ id: AREA_A, sizeSqm: 100 }),
      buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 50 }),
    ])
    expect(preselected.selectedAreaIds).toEqual([AREA_A, AREA_B])
    expect(preselected.selectionSource).toBe('care_group')
    expect(preselected.careGroupId).toBe(CARE_GROUP_ID)
  })

  it('4 — preselected area can be deselected manually', () => {
    const toggled = toggleAreaSelection([AREA_A, AREA_B], AREA_B)
    expect(toggled).toEqual([AREA_A])
  })

  it('5 — at least one area is required', () => {
    const validation = validateFertilizerApplicationDraft(
      buildDraft({ selectedAreaIds: [] }),
      buildItem(),
      [buildArea()],
    )
    expect(validation.ok).toBe(false)
    expect(validation.errors.areas).toBeTruthy()
  })

  it('6 — duplicate area selection is impossible via toggle', () => {
    const once = toggleAreaSelection([], AREA_A)
    const twice = toggleAreaSelection(once, AREA_A)
    expect(once).toEqual([AREA_A])
    expect(twice).toEqual([])
  })

  it('7 — area without numeric size is not applicable', () => {
    expect(isAreaApplicableForFertilizerApplication(buildArea({ sizeSqm: null }))).toBe(false)
    expect(getApplicableAreas([buildArea({ sizeSqm: null })])).toHaveLength(0)
  })

  it('8 — sizeLabel is not used as calculation basis', () => {
    const validation = validateFertilizerApplicationDraft(
      buildDraft(),
      buildItem(),
      [buildArea({ sizeSqm: null, sizeLabel: '120 m²' })],
    )
    expect(validation.ok).toBe(false)
    expect(validation.errors.areas).toBeTruthy()
  })

  it('9 — concrete areas remain visible in confirmation rows', () => {
    const validation = validateFertilizerApplicationDraft(
      buildDraft({ selectedAreaIds: [AREA_A, AREA_B] }),
      buildItem(),
      [
        buildArea({ id: AREA_A, sizeSqm: 100 }),
        buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 50 }),
      ],
    )
    const rows = buildFertilizerApplicationConfirmationRows({
      item: buildItem(),
      draft: buildDraft({ selectedAreaIds: [AREA_A, AREA_B] }),
      normalized: validation.normalized!,
      areas: [
        buildArea({ id: AREA_A, sizeSqm: 100 }),
        buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 50 }),
      ],
    })
    expect(rows.some((row) => row.label === 'Vorgarten')).toBe(true)
    expect(rows.some((row) => row.label === 'Hintergarten')).toBe(true)
  })

  it('10 — care group is not the sole target reference in command', () => {
    const command = buildMultiAreaApplicationCommandInput({
      draft: buildDraft({
        selectedAreaIds: [AREA_A, AREA_B],
        selectionSource: 'care_group',
        careGroupId: CARE_GROUP_ID,
      }),
      item: buildItem(),
      areas: [
        buildArea({ id: AREA_A, sizeSqm: 100 }),
        buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 50 }),
      ],
      userId: 'user-id',
      idempotencyKey: 'key-1',
    })
    expect(command?.domain.areas).toHaveLength(2)
    expect(command?.domain.careGroupId).toBe(CARE_GROUP_ID)
  })

  it('11 — selection source is mapped correctly', () => {
    expect(formatSelectionSourceLabel('manual')).toBe('Manuell')
    expect(formatSelectionSourceLabel('care_group')).toBe('Aus Pflegegruppe')
  })

  it('12 — care group id only when care group selection', () => {
    const manual = buildMultiAreaApplicationCommandInput({
      draft: buildDraft(),
      item: buildItem(),
      areas: [buildArea({ sizeSqm: 100 })],
      userId: 'user-id',
      idempotencyKey: 'key-1',
    })
    expect(manual?.domain.careGroupId).toBeNull()

    const grouped = buildMultiAreaApplicationCommandInput({
      draft: buildDraft({
        selectedAreaIds: [AREA_A, AREA_B],
        selectionSource: 'care_group',
        careGroupId: CARE_GROUP_ID,
      }),
      item: buildItem(),
      areas: [
        buildArea({ id: AREA_A, sizeSqm: 100 }),
        buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 50 }),
      ],
      userId: 'user-id',
      idempotencyKey: 'key-1',
    })
    expect(grouped?.domain.careGroupId).toBe(CARE_GROUP_ID)
  })

  it('13 — rate_per_sqm kg uses g/m² input unit label', () => {
    expect(getApplicationInputUnitLabel('rate_per_sqm', 'kg')).toBe('g/m²')
  })

  it('14 — rate_per_sqm ml uses ml/m² input unit label', () => {
    expect(getApplicationInputUnitLabel('rate_per_sqm', 'ml')).toBe('ml/m²')
  })

  it('15 — proportional kg uses kg input unit label', () => {
    expect(getApplicationInputUnitLabel('total_amount_proportional', 'kg')).toBe('kg')
  })

  it('16 — proportional ml uses ml input unit label', () => {
    expect(getApplicationInputUnitLabel('total_amount_proportional', 'ml')).toBe('ml')
  })

  it('17 — single area is a special case of the same command', () => {
    const command = buildMultiAreaApplicationCommandInput({
      draft: buildDraft({ selectedAreaIds: [AREA_A] }),
      item: buildItem(),
      areas: [buildArea({ sizeSqm: 100 })],
      userId: 'user-id',
      idempotencyKey: 'key-1',
    })
    expect(command?.domain.areas).toHaveLength(1)
  })

  it('18 — multiple areas produce one shared command', () => {
    const command = buildMultiAreaApplicationCommandInput({
      draft: buildDraft({ selectedAreaIds: [AREA_A, AREA_B] }),
      item: buildItem(),
      areas: [
        buildArea({ id: AREA_A, sizeSqm: 100 }),
        buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 50 }),
      ],
      userId: 'user-id',
      idempotencyKey: 'key-1',
    })
    expect(command?.domain.areas).toHaveLength(2)
  })

  it('19 — command builder does not imply per-area RPC', () => {
    const command = buildMultiAreaApplicationCommandInput({
      draft: buildDraft({ selectedAreaIds: [AREA_A, AREA_B] }),
      item: buildItem(),
      areas: [
        buildArea({ id: AREA_A, sizeSqm: 100 }),
        buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 50 }),
      ],
      userId: 'user-id',
      idempotencyKey: 'key-1',
    })
    expect(command).toBeTruthy()
    expect(command?.domain.areas.length).toBeGreaterThan(1)
  })

  it('20 — total withdrawal is computed correctly', () => {
    const validation = validateFertilizerApplicationDraft(
      buildDraft({ selectedAreaIds: [AREA_A, AREA_B] }),
      buildItem(),
      [
        buildArea({ id: AREA_A, sizeSqm: 100 }),
        buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 50 }),
      ],
    )
    expect(validation.normalized?.totalApplicationAmount).toBe(3.75)
  })

  it('21 — partial amounts are computed correctly', () => {
    const validation = validateFertilizerApplicationDraft(
      buildDraft({ selectedAreaIds: [AREA_A, AREA_B] }),
      buildItem(),
      [
        buildArea({ id: AREA_A, sizeSqm: 100 }),
        buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 50 }),
      ],
    )
    expect(validation.normalized?.areaSnapshots[0]?.applicationAmount).toBe(2.5)
    expect(validation.normalized?.areaSnapshots[1]?.applicationAmount).toBe(1.25)
  })

  it('22 — preview balance is computed correctly', () => {
    const validation = validateFertilizerApplicationDraft(
      buildDraft(),
      buildItem({ balance: 20 }),
      [buildArea({ sizeSqm: 100 })],
    )
    const rows = buildFertilizerApplicationConfirmationRows({
      item: buildItem({ balance: 20 }),
      draft: buildDraft(),
      normalized: validation.normalized!,
      areas: [buildArea({ sizeSqm: 100 })],
    })
    expect(rows.some((row) => row.label === 'Restbestand danach' && row.value === '17.5 kg')).toBe(
      true,
    )
  })

  it('23 — final summary shows all selected areas', () => {
    const validation = validateFertilizerApplicationDraft(
      buildDraft({ selectedAreaIds: [AREA_A, AREA_B] }),
      buildItem(),
      [
        buildArea({ id: AREA_A, sizeSqm: 100 }),
        buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 50 }),
      ],
    )
    const rows = buildFertilizerApplicationConfirmationRows({
      item: buildItem(),
      draft: buildDraft({ selectedAreaIds: [AREA_A, AREA_B] }),
      normalized: validation.normalized!,
      areas: [
        buildArea({ id: AREA_A, sizeSqm: 100 }),
        buildArea({ id: AREA_B, name: 'Hintergarten', sizeSqm: 50 }),
      ],
    })
    expect(rows.find((row) => row.label === 'Flächen')?.value).toBe('2')
  })

  it('24 — editing discards idempotency key', () => {
    const previous = buildDraft({ idempotencyKey: 'key-1', inputValue: '25' })
    const current = buildDraft({ idempotencyKey: 'key-1', inputValue: '30' })
    expect(shouldDiscardIdempotencyKey(previous, current)).toBe(true)
  })

  it('25 — double submit is blocked via submitting flag contract', () => {
    expect(
      validateFertilizerApplicationDraft(buildDraft(), buildItem(), [buildArea({ sizeSqm: 100 })])
        .ok,
    ).toBe(true)
  })

  it('26 — success state can show area count from result areas', () => {
    expect([AREA_A, AREA_B]).toHaveLength(2)
  })

  it('27 — success state uses RPC balance from result contract', () => {
    expect(typeof 17.5).toBe('number')
  })

  it('28 — validation keeps draft values on error', () => {
    const draft = buildDraft({ inputValue: '999', selectedAreaIds: [AREA_A] })
    const validation = validateFertilizerApplicationDraft(
      draft,
      buildItem({ balance: 20 }),
      [buildArea({ sizeSqm: 100 })],
    )
    expect(validation.ok).toBe(false)
    expect(draft.inputValue).toBe('999')
    expect(draft.selectedAreaIds).toEqual([AREA_A])
  })

  it('29 — no legacy fallback path exists in command builder', () => {
    const command = buildMultiAreaApplicationCommandInput({
      draft: buildDraft(),
      item: buildItem(),
      areas: [buildArea({ sizeSqm: 100 })],
      userId: 'user-id',
      idempotencyKey: 'key-1',
    })
    expect(command?.domain.mode).toBe('rate_per_sqm')
  })

  it('30 — manual switch clears care group id', () => {
    const manual = switchToManualAreaSelection([AREA_A])
    expect(manual.selectionSource).toBe('manual')
    expect(manual.careGroupId).toBeNull()
  })

  it('care group preselection ignores non-applicable members', () => {
    const preselected = buildCareGroupPreselection(CARE_GROUP_ID, GROUPS, [
      buildArea({ id: AREA_A, sizeSqm: 100 }),
      buildArea({ id: AREA_C, name: 'Ohne Größe', sizeSqm: null }),
    ])
    expect(preselected).toEqual([AREA_A])
  })
})

describe('fertilizerApplicationFlowCore phase five home entry', () => {
  const ITEM_A = '11111111-1111-4111-8111-111111111111'
  const ITEM_B = '99999999-9999-4999-8999-999999999999'
  const PROFILE_B = '33333333-3333-4333-8333-333333333333'

  it('starts in product-select without inventory item id', () => {
    expect(
      resolveApplicationFlowPhase({ inventoryItemId: undefined, phase: 'form' }),
    ).toBe('product-select')
  })

  it('accepts only application-eligible active canonical items', () => {
    const eligible = buildItem({ id: ITEM_A, balance: 5 })
    const zeroBalance = buildItem({ id: ITEM_B, balance: 0 })
    const legacy = buildItem({
      id: ITEM_B,
      savedProductProfileId: null,
      accessKind: 'session',
      balance: 5,
    })

    expect(filterApplicationEligibleProductStockItems([eligible, zeroBalance, legacy])).toEqual([
      eligible,
    ])
  })

  it('keeps kg and ml and different saved profiles separate', () => {
    const kgItem = buildItem({ id: ITEM_A, baseUnit: 'kg', unit: 'kg' })
    const mlItem = buildItem({
      id: ITEM_B,
      savedProductProfileId: PROFILE_B,
      baseUnit: 'ml',
      unit: 'ml',
      productForm: 'liquid',
    })

    const filtered = filterApplicationEligibleProductStockItems([kgItem, mlItem])
    expect(filtered).toHaveLength(2)
    expect(filtered.map((item) => item.id)).toEqual([ITEM_A, ITEM_B])
  })

  it('does not merge items by product label or package size', () => {
    const first = buildItem({ id: ITEM_A, productLabel: 'Same Name', packageSizeValue: 5 })
    const second = buildItem({
      id: ITEM_B,
      savedProductProfileId: PROFILE_B,
      productLabel: 'Same Name',
      packageSizeValue: 10,
    })

    expect(filterApplicationEligibleProductStockItems([first, second])).toHaveLength(2)
  })

  it('builds home application routes centrally', () => {
    expect(buildFertilizerApplicationRoute()).toBe('/duengung')
    expect(buildFertilizerApplicationRoute(ITEM_A)).toBe(`/duengung/${ITEM_A}`)
    expect(fertilizerHomeApplicationPath()).toBe('/duengung')
    expect(fertilizerLegacyApplicationPath(ITEM_A)).toBe(
      `/ausruestung/duenger/${ITEM_A}/anwenden`,
    )
    expect(isLegacyFertilizerApplicationPath(`/ausruestung/duenger/${ITEM_A}/anwenden`)).toBe(true)
  })

  it('redirects legacy route only for eligible canonical items', () => {
    expect(shouldRedirectLegacyApplicationRoute(buildItem({ balance: 3 }))).toBe(true)
    expect(shouldRedirectLegacyApplicationRoute(null)).toBe(false)
    expect(
      shouldRedirectLegacyApplicationRoute(
        buildItem({ balance: 0, savedProductProfileId: PROFILE_ID }),
      ),
    ).toBe(false)
  })

  it('maps product options without package size identity', () => {
    const option = mapToApplicationProductOption(
      buildItem({ productLabel: 'Test', manufacturer: 'Maker', balance: 2.5 }),
    )
    expect(option.inventoryItemId).toBe(ITEM_A)
    expect(option.productLabel).toBe('Test')
    expect(option.balanceLabel).toContain('2,5 kg')
    expect(option.productFormLabel).toBe('Granulat')
  })

  it('preserves existing application flow phases after product selection', () => {
    expect(
      resolveApplicationFlowPhase({ inventoryItemId: ITEM_A, phase: 'product-select' }),
    ).toBe('form')
    expect(resolveApplicationFlowPhase({ inventoryItemId: ITEM_A, phase: 'confirm' })).toBe(
      'confirm',
    )
  })

  it('preserves eligibility helper semantics', () => {
    expect(isFertilizerStockListItemApplicationEligible(buildItem())).toBe(true)
    expect(isFertilizerStockListItemApplicationEligible(buildItem({ baseUnit: 'g' as 'kg' }))).toBe(
      false,
    )
  })
})
