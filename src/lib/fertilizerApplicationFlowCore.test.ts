import { describe, expect, it } from 'vitest'
import type { Area } from '../types/area'
import type { FertilizerStockListItem } from '../types/fertilizerInventory'
import {
  applicationDateInputToIso,
  buildFertilizerApplicationConfirmationRows,
  computePreviewResultingBalance,
  formatFertilizerProductFormLabel,
  getFertilizerApplicationIneligibilityMessage,
  isFertilizerStockListItemApplicationEligible,
  isValidInventoryItemRouteId,
  parseApplicationAmountInput,
  validateFertilizerApplicationDraft,
} from './fertilizerApplicationFlowCore'

const PROFILE_ID = '22222222-2222-4222-8222-222222222222'
const AREA_ID = '33333333-3333-4333-8333-333333333333'

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
    id: AREA_ID,
    name: 'Vorgarten',
    subtitle: '',
    sizeLabel: '120 m²',
    sizeSqm: 120,
    status: 'excellent',
    statusLabel: 'Gut entwickelt',
    summary: null,
    coverImagePath: null,
    ...overrides,
  }
}

describe('fertilizerApplicationFlowCore', () => {
  it('accepts valid inventory item route ids', () => {
    expect(isValidInventoryItemRouteId('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(isValidInventoryItemRouteId('not-a-uuid')).toBe(false)
  })

  it('marks core-bound items as application eligible', () => {
    expect(isFertilizerStockListItemApplicationEligible(buildItem())).toBe(true)
  })

  it('rejects legacy items without core binding', () => {
    expect(
      isFertilizerStockListItemApplicationEligible(
        buildItem({
          savedProductProfileId: null,
          accessKind: null,
          baseUnit: null,
        }),
      ),
    ).toBe(false)
    expect(getFertilizerApplicationIneligibilityMessage(buildItem({ savedProductProfileId: null }))).toContain(
      'noch nicht angewendet',
    )
  })

  it('rejects zero balance items', () => {
    expect(isFertilizerStockListItemApplicationEligible(buildItem({ balance: 0 }))).toBe(false)
    expect(getFertilizerApplicationIneligibilityMessage(buildItem({ balance: 0 }))).toContain('leer')
  })

  it('formats product form labels', () => {
    expect(formatFertilizerProductFormLabel('granular')).toBe('Granulat')
    expect(formatFertilizerProductFormLabel('liquid')).toBe('Flüssig')
  })

  it('parses decimal amounts with comma and dot', () => {
    expect(parseApplicationAmountInput('2,5')).toBe(2.5)
    expect(parseApplicationAmountInput('1.25')).toBe(1.25)
  })

  it('rejects zero, negative and over-precision amounts', () => {
    expect(parseApplicationAmountInput('0')).toBeNull()
    expect(parseApplicationAmountInput('-1')).toBeNull()
    expect(parseApplicationAmountInput('1.12345')).toBeNull()
  })

  it('rejects scientific notation', () => {
    expect(parseApplicationAmountInput('1e3')).toBeNull()
  })

  it('blocks over-application client-side', () => {
    const validation = validateFertilizerApplicationDraft(
      {
        amountInput: '21',
        areaId: AREA_ID,
        appliedAtDate: '2026-08-02',
        note: '',
        idempotencyKey: null,
      },
      buildItem({ balance: 20 }),
    )

    expect(validation.ok).toBe(false)
    expect(validation.errors.amount).toContain('Bestand')
  })

  it('requires an explicit area selection', () => {
    const validation = validateFertilizerApplicationDraft(
      {
        amountInput: '2',
        areaId: null,
        appliedAtDate: '2026-08-02',
        note: '',
        idempotencyKey: null,
      },
      buildItem(),
    )

    expect(validation.ok).toBe(false)
    expect(validation.errors.area).toBeTruthy()
  })

  it('does not expose care groups as targets', () => {
    const validation = validateFertilizerApplicationDraft(
      {
        amountInput: '2',
        areaId: AREA_ID,
        appliedAtDate: '2026-08-02',
        note: '',
        idempotencyKey: null,
      },
      buildItem(),
    )

    expect(validation.ok).toBe(true)
    expect(validation.errors.area).toBeUndefined()
  })

  it('accepts optional notes and validates note length', () => {
    const ok = validateFertilizerApplicationDraft(
      {
        amountInput: '2',
        areaId: AREA_ID,
        appliedAtDate: '2026-08-02',
        note: '  Randstreifen  ',
        idempotencyKey: null,
      },
      buildItem(),
    )
    expect(ok.ok).toBe(true)

    const tooLong = validateFertilizerApplicationDraft(
      {
        amountInput: '2',
        areaId: AREA_ID,
        appliedAtDate: '2026-08-02',
        note: 'x'.repeat(2001),
        idempotencyKey: null,
      },
      buildItem(),
    )
    expect(tooLong.errors.note).toBeTruthy()
  })

  it('builds confirmation rows with preview balance', () => {
    const rows = buildFertilizerApplicationConfirmationRows({
      item: buildItem(),
      area: buildArea(),
      amount: 2,
      appliedAtDate: '2026-08-02',
      note: 'Test',
    })

    expect(rows.some((row) => row.label === 'Produkt')).toBe(true)
    expect(rows.some((row) => row.label === 'Fläche' && row.value === 'Vorgarten')).toBe(true)
    expect(rows.some((row) => row.label === 'Restbestand danach' && row.value === '18 kg')).toBe(true)
  })

  it('computes preview resulting balance locally', () => {
    expect(computePreviewResultingBalance(20, 2)).toBe(18)
  })

  it('rejects future application dates', () => {
    const future = new Date()
    future.setDate(future.getDate() + 2)
    const isoDate = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`
    expect(applicationDateInputToIso(isoDate)).toBeNull()
  })

  it('keeps unit fixed to the inventory item base unit', () => {
    const item = buildItem({ baseUnit: 'ml', unit: 'ml', packageSizeUnit: 'ml' })
    const rows = buildFertilizerApplicationConfirmationRows({
      item,
      area: buildArea(),
      amount: 500,
      appliedAtDate: '2026-08-02',
      note: '',
    })

    expect(rows.find((row) => row.label === 'Menge')?.value).toBe('500 ml')
  })

  it('does not offer g or l as selectable units in confirmation', () => {
    const rows = buildFertilizerApplicationConfirmationRows({
      item: buildItem(),
      area: buildArea(),
      amount: 2,
      appliedAtDate: '2026-08-02',
      note: '',
    })

    const amountRow = rows.find((row) => row.label === 'Menge')
    expect(amountRow?.value.endsWith(' kg')).toBe(true)
    expect(amountRow?.value.includes(' g')).toBe(false)
    expect(amountRow?.value.includes(' l')).toBe(false)
  })
})
