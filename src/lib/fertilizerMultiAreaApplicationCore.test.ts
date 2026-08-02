import { describe, expect, it } from 'vitest'
import {
  buildCanonicalFertilizerMultiAreaApplicationPayload,
  deriveSingleAreaApplicationAmount,
  FertilizerMultiAreaApplicationError,
  normalizeFertilizerMultiAreaApplication,
  type FertilizerMultiAreaApplicationInput,
} from './fertilizerMultiAreaApplicationCore'

const AREA_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AREA_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const AREA_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const CARE_GROUP_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function buildInput(
  overrides: Partial<FertilizerMultiAreaApplicationInput> = {},
): FertilizerMultiAreaApplicationInput {
  return {
    baseUnit: 'kg',
    mode: 'rate_per_sqm',
    selectionSource: 'manual',
    areas: [
      { areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: 100 },
      { areaId: AREA_B, areaName: 'Hintergarten', areaSizeSqm: 50 },
    ],
    rateValue: 25,
    ...overrides,
  }
}

describe('fertilizerMultiAreaApplicationCore', () => {
  it('1 — single area remains a valid special case', () => {
    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        areas: [{ areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: 100 }],
        rateValue: 25,
      }),
    )

    expect(result.areaSnapshots).toHaveLength(1)
    expect(result.totalApplicationAmount).toBe(2.5)
    expect(deriveSingleAreaApplicationAmount(result)).toBe(2.5)
  })

  it('2 — two areas at 25 g/m² produce 2.5 kg, 1.25 kg and 3.75 kg total', () => {
    const result = normalizeFertilizerMultiAreaApplication(buildInput())

    expect(result.areaSnapshots).toHaveLength(2)
    expect(result.areaSnapshots[0]).toMatchObject({
      areaId: AREA_A,
      applicationAmount: 2.5,
      effortRate: 25,
      effortRateUnit: 'g_per_sqm',
    })
    expect(result.areaSnapshots[1]).toMatchObject({
      areaId: AREA_B,
      applicationAmount: 1.25,
      effortRate: 25,
      effortRateUnit: 'g_per_sqm',
    })
    expect(result.totalApplicationAmount).toBe(3.75)
  })

  it('3 — two areas with 3 kg total distribute to 2 kg and 1 kg at 20 g/m²', () => {
    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        mode: 'total_amount_proportional',
        rateValue: null,
        totalAmount: 3,
      }),
    )

    expect(result.areaSnapshots[0]?.applicationAmount).toBe(2)
    expect(result.areaSnapshots[1]?.applicationAmount).toBe(1)
    expect(result.areaSnapshots[0]?.effortRate).toBe(20)
    expect(result.areaSnapshots[1]?.effortRate).toBe(20)
    expect(result.totalApplicationAmount).toBe(3)
  })

  it('4 — liquid rate_per_sqm uses ml/m² without kg conversion', () => {
    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        baseUnit: 'ml',
        areas: [
          { areaId: AREA_A, areaName: 'Beet', areaSizeSqm: 10 },
          { areaId: AREA_B, areaName: 'Terrasse', areaSizeSqm: 5 },
        ],
        rateValue: 50,
      }),
    )

    expect(result.effortRateUnit).toBe('ml_per_sqm')
    expect(result.areaSnapshots[0]?.applicationAmount).toBe(500)
    expect(result.areaSnapshots[1]?.applicationAmount).toBe(250)
    expect(result.totalApplicationAmount).toBe(750)
  })

  it('5 — liquid total_amount_proportional distributes in ml', () => {
    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        baseUnit: 'ml',
        mode: 'total_amount_proportional',
        rateValue: null,
        totalAmount: 300,
      }),
    )

    expect(result.areaSnapshots[0]?.applicationAmount).toBe(200)
    expect(result.areaSnapshots[1]?.applicationAmount).toBe(100)
    expect(result.totalApplicationAmount).toBe(300)
  })

  it('6 — rejects kg base unit with ml-only semantics in rate mode', () => {
    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        baseUnit: 'kg',
        rateValue: 25,
      }),
    )

    expect(result.effortRateUnit).toBe('g_per_sqm')
    expect(result.baseUnit).toBe('kg')
  })

  it('7 — rejects l as base unit', () => {
    expect(() =>
      normalizeFertilizerMultiAreaApplication(
        buildInput({
          baseUnit: 'l' as 'kg',
        }),
      ),
    ).toThrow(FertilizerMultiAreaApplicationError)
  })

  it('8 — rejects direct g total amount', () => {
    expect(() =>
      normalizeFertilizerMultiAreaApplication(
        buildInput({
          mode: 'total_amount_proportional',
          rateValue: null,
          totalAmount: 2500,
          baseUnit: 'g' as 'kg',
        }),
      ),
    ).toThrow(FertilizerMultiAreaApplicationError)
  })

  it('9 — rejects no areas selected', () => {
    expect(() =>
      normalizeFertilizerMultiAreaApplication(
        buildInput({
          areas: [],
        }),
      ),
    ).toThrow(FertilizerMultiAreaApplicationError)

    try {
      normalizeFertilizerMultiAreaApplication(buildInput({ areas: [] }))
    } catch (error) {
      expect((error as FertilizerMultiAreaApplicationError).code).toBe('NO_AREAS_SELECTED')
    }
  })

  it('10 — rejects duplicate area ids', () => {
    expect(() =>
      normalizeFertilizerMultiAreaApplication(
        buildInput({
          areas: [
            { areaId: AREA_A, areaName: 'A', areaSizeSqm: 100 },
            { areaId: AREA_A, areaName: 'A duplicate', areaSizeSqm: 50 },
          ],
        }),
      ),
    ).toThrow(FertilizerMultiAreaApplicationError)
  })

  it('11 — rejects missing numeric area size', () => {
    expect(() =>
      normalizeFertilizerMultiAreaApplication(
        buildInput({
          areas: [{ areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: null }],
        }),
      ),
    ).toThrow(FertilizerMultiAreaApplicationError)

    try {
      normalizeFertilizerMultiAreaApplication(
        buildInput({
          areas: [{ areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: null }],
        }),
      )
    } catch (error) {
      expect((error as FertilizerMultiAreaApplicationError).code).toBe('AREA_SIZE_MISSING')
    }
  })

  it('12 — rejects zero area size', () => {
    expect(() =>
      normalizeFertilizerMultiAreaApplication(
        buildInput({
          areas: [{ areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: 0 }],
        }),
      ),
    ).toThrow(FertilizerMultiAreaApplicationError)
  })

  it('13 — rejects negative area size', () => {
    expect(() =>
      normalizeFertilizerMultiAreaApplication(
        buildInput({
          areas: [{ areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: -10 }],
        }),
      ),
    ).toThrow(FertilizerMultiAreaApplicationError)
  })

  it('14 — rejects zero rate', () => {
    expect(() =>
      normalizeFertilizerMultiAreaApplication(
        buildInput({
          rateValue: 0,
        }),
      ),
    ).toThrow(FertilizerMultiAreaApplicationError)
  })

  it('15 — rejects negative total amount', () => {
    expect(() =>
      normalizeFertilizerMultiAreaApplication(
        buildInput({
          mode: 'total_amount_proportional',
          rateValue: null,
          totalAmount: -3,
        }),
      ),
    ).toThrow(FertilizerMultiAreaApplicationError)
  })

  it('16 — rejects amounts below storable inventory precision', () => {
    expect(() =>
      normalizeFertilizerMultiAreaApplication(
        buildInput({
          areas: [{ areaId: AREA_A, areaName: 'Mini', areaSizeSqm: 0.01 }],
          rateValue: 0.0001,
        }),
      ),
    ).toThrow(FertilizerMultiAreaApplicationError)
  })

  it('17 — distributes rounding remainder across three differently sized areas', () => {
    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        mode: 'total_amount_proportional',
        rateValue: null,
        totalAmount: 1,
        areas: [
          { areaId: AREA_A, areaName: 'A', areaSizeSqm: 100 },
          { areaId: AREA_B, areaName: 'B', areaSizeSqm: 100 },
          { areaId: AREA_C, areaName: 'C', areaSizeSqm: 100 },
        ],
      }),
    )

    const amounts = result.areaSnapshots.map((snapshot) => snapshot.applicationAmount)
    expect(amounts.reduce((sum, amount) => sum + amount, 0)).toBe(1)
    expect(amounts.filter((amount) => amount === 0.3334)).toHaveLength(1)
    expect(amounts.filter((amount) => amount === 0.3333)).toHaveLength(2)
  })

  it('18 — partial amounts sum exactly to the confirmed total', () => {
    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        mode: 'total_amount_proportional',
        rateValue: null,
        totalAmount: 3,
      }),
    )

    const sum = result.areaSnapshots.reduce((total, snapshot) => total + snapshot.applicationAmount, 0)
    expect(sum).toBe(3)
    expect(result.totalApplicationAmount).toBe(3)
  })

  it('19 — stable area order independent of input order', () => {
    const forward = normalizeFertilizerMultiAreaApplication(buildInput())
    const reverse = normalizeFertilizerMultiAreaApplication(
      buildInput({
        areas: [
          { areaId: AREA_B, areaName: 'Hintergarten', areaSizeSqm: 50 },
          { areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: 100 },
        ],
      }),
    )

    expect(forward.areaSnapshots.map((snapshot) => snapshot.areaId)).toEqual([
      AREA_A,
      AREA_B,
    ])
    expect(reverse.areaSnapshots.map((snapshot) => snapshot.areaId)).toEqual([
      AREA_A,
      AREA_B,
    ])
  })

  it('20 — identical input yields identical normalized result', () => {
    const first = normalizeFertilizerMultiAreaApplication(buildInput())
    const second = normalizeFertilizerMultiAreaApplication(buildInput())

    expect(first).toEqual(second)
    expect(first.canonicalPayload).toBe(second.canonicalPayload)
  })

  it('21 — does not mutate input areas', () => {
    const input = buildInput()
    const areasCopy = input.areas.map((area) => ({ ...area }))

    normalizeFertilizerMultiAreaApplication(input)

    expect(input.areas).toEqual(areasCopy)
  })

  it('22 — never produces negative partial amounts', () => {
    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        mode: 'total_amount_proportional',
        rateValue: null,
        totalAmount: 1,
        areas: [
          { areaId: AREA_A, areaName: 'A', areaSizeSqm: 100 },
          { areaId: AREA_B, areaName: 'B', areaSizeSqm: 100 },
          { areaId: AREA_C, areaName: 'C', areaSizeSqm: 100 },
        ],
      }),
    )

    expect(result.areaSnapshots.every((snapshot) => snapshot.applicationAmount > 0)).toBe(true)
  })

  it('23 — selected areas never silently disappear', () => {
    const input = buildInput()
    const result = normalizeFertilizerMultiAreaApplication(input)

    expect(result.areaSnapshots).toHaveLength(input.areas.length)
    expect(new Set(result.areaSnapshots.map((snapshot) => snapshot.areaId))).toEqual(
      new Set(input.areas.map((area) => area.areaId.toLowerCase())),
    )
  })

  it('24 — effort rates are derivable from snapshots', () => {
    const result = normalizeFertilizerMultiAreaApplication(buildInput())

    for (const snapshot of result.areaSnapshots) {
      const derived =
        snapshot.effortRateUnit === 'g_per_sqm'
          ? (snapshot.applicationAmount * 1000) / snapshot.areaSizeSqmSnapshot
          : snapshot.applicationAmount / snapshot.areaSizeSqmSnapshot
      expect(snapshot.effortRate).toBeCloseTo(derived, 4)
    }
  })

  it('25 — care group is only tracked as selection origin', () => {
    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        selectionSource: 'care_group',
        careGroupId: CARE_GROUP_ID,
      }),
    )

    expect(result.selectionSource).toBe('care_group')
    expect(result.careGroupId).toBe(CARE_GROUP_ID)
    expect(result.areaSnapshots.every((snapshot) => snapshot.areaId !== CARE_GROUP_ID)).toBe(true)
  })

  it('26 — later group changes do not affect snapshot data', () => {
    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        selectionSource: 'care_group',
        careGroupId: CARE_GROUP_ID,
      }),
    )

    const payload = JSON.parse(result.canonicalPayload) as {
      careGroupId: string
      areas: Array<{ areaSizeSqmSnapshot: number }>
    }

    expect(payload.careGroupId).toBe(CARE_GROUP_ID)
    expect(payload.areas[0]?.areaSizeSqmSnapshot).toBe(100)
  })

  it('27 — fingerprint data uses stable sorted area snapshots', () => {
    const result = normalizeFertilizerMultiAreaApplication(buildInput())
    const payload = JSON.parse(result.canonicalPayload) as {
      areas: Array<{ areaId: string; sortOrder: number }>
    }

    expect(payload.areas.map((area) => area.areaId)).toEqual([AREA_A, AREA_B])
    expect(payload.areas.map((area) => area.sortOrder)).toEqual([0, 1])
    expect(buildCanonicalFertilizerMultiAreaApplicationPayload(result)).toBe(result.canonicalPayload)
  })

  it('28 — sorts area ids by normalized lowercase ordinal order', () => {
    const earlier = '00000000-0000-4000-8000-000000000001'
    const laterMixedCase = '00000000-0000-4000-8000-000000000002'.toUpperCase()

    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        areas: [
          { areaId: laterMixedCase, areaName: 'Later', areaSizeSqm: 50 },
          { areaId: earlier, areaName: 'Earlier', areaSizeSqm: 100 },
        ],
      }),
    )

    expect(result.areaSnapshots.map((snapshot) => snapshot.areaId)).toEqual([earlier, laterMixedCase])
    expect(result.areaSnapshots.map((snapshot) => snapshot.sortOrder)).toEqual([0, 1])
  })

  it('29 — single-area mode matches the existing absolute amount contract', () => {
    const result = normalizeFertilizerMultiAreaApplication(
      buildInput({
        areas: [{ areaId: AREA_A, areaName: 'Vorgarten', areaSizeSqm: 120 }],
        mode: 'total_amount_proportional',
        rateValue: null,
        totalAmount: 2.5,
      }),
    )

    expect(result.areaSnapshots).toHaveLength(1)
    expect(result.areaSnapshots[0]?.applicationAmount).toBe(2.5)
    expect(result.totalApplicationAmount).toBe(2.5)
  })
})
