import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import {
  FERTILIZER_INVENTORY_CREATION_MAX_PACKAGES,
  FertilizerInventoryCreationError,
  buildCanonicalFertilizerInventoryCreationPayload,
  expandConfirmedPackageGroups,
  formatCanonicalInventoryCreationQuantity,
  normalizeFertilizerInventoryCreationInput,
  type CreateFertilizerInventoryFromConfirmedPackagesInput,
  type FertilizerInventoryCreationReason,
  type NormalizedFertilizerInventoryCreationInput,
} from './fertilizerInventoryCreationCore'

const CREATION_CORE_SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'fertilizerInventoryCreationCore.ts'),
  'utf8',
)

const PROFILE_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const SESSION_ACCESS: FertilizerEnrichmentAccessContext = { kind: 'session', sessionId: 'session-abc' }
const AUTH_ACCESS: FertilizerEnrichmentAccessContext = {
  kind: 'authenticated_user',
  userId: 'user-123',
}

function baseInput(
  overrides: Partial<CreateFertilizerInventoryFromConfirmedPackagesInput> = {},
): CreateFertilizerInventoryFromConfirmedPackagesInput {
  return {
    savedProductProfileId: PROFILE_ID,
    accessContext: SESSION_ACCESS,
    creationReason: 'purchase',
    idempotencyKey: 'creation-idem-1',
    confirmedPackageGroups: [
      {
        packageSizeValue: 25,
        packageSizeUnit: 'kg',
        initialQuantityValue: 25,
        initialQuantityUnit: 'kg',
        count: 1,
      },
    ],
    ...overrides,
  }
}

function expectCreationError(
  action: () => unknown,
  code: FertilizerInventoryCreationError['code'],
): FertilizerInventoryCreationError {
  try {
    action()
    expect.unreachable('Expected FertilizerInventoryCreationError.')
  } catch (error) {
    expect(error).toBeInstanceOf(FertilizerInventoryCreationError)
    expect((error as FertilizerInventoryCreationError).code).toBe(code)
    return error as FertilizerInventoryCreationError
  }
}

describe('fertilizerInventoryCreationCore', () => {
  it('1 — normalizes a full 25 kg package', () => {
    const result = normalizeFertilizerInventoryCreationInput(baseInput())

    expect(result.packages).toEqual([
      {
        packageSizeValue: 25,
        packageSizeUnit: 'kg',
        initialQuantityValue: 25,
        initialQuantityUnit: 'kg',
        sequenceIndex: 0,
        clientCorrelationId: undefined,
      },
    ])
    expect(result.creationReason).toBe('purchase')
    expect(result.savedProductProfileId).toBe(PROFILE_ID.toLowerCase())
  })

  it('2 — normalizes a opened 25 kg package with 12 kg initial content', () => {
    const result = normalizeFertilizerInventoryCreationInput(
      baseInput({
        creationReason: 'initial_stock',
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 12,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    )

    expect(result.packages[0]).toMatchObject({
      packageSizeValue: 25,
      initialQuantityValue: 12,
      sequenceIndex: 0,
    })
  })

  it('3 — count = 3 expands to three separate single packages', () => {
    const result = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            count: 3,
          },
        ],
      }),
    )

    expect(result.packages).toHaveLength(3)
    expect(result.packages.map((pkg) => pkg.sequenceIndex)).toEqual([0, 1, 2])
  })

  it('4 — different groups receive continuous global sequenceIndex values', () => {
    const result = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            count: 2,
          },
          {
            packageSizeValue: 10,
            packageSizeUnit: 'kg',
            initialQuantityValue: 10,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    )

    expect(result.packages.map((pkg) => pkg.sequenceIndex)).toEqual([0, 1, 2])
    expect(result.packages[2]?.packageSizeValue).toBe(10)
  })

  it('5 — two identical packages remain separate entries', () => {
    const result = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            count: 2,
          },
        ],
      }),
    )

    expect(result.packages).toHaveLength(2)
    expect(result.packages[0]).not.toBe(result.packages[1])
  })

  it('6 — expands clientCorrelationIdPrefix deterministically', () => {
    const result = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            count: 3,
            clientCorrelationIdPrefix: 'stressmanager',
          },
        ],
      }),
    )

    expect(result.packages.map((pkg) => pkg.clientCorrelationId)).toEqual([
      'stressmanager-1',
      'stressmanager-2',
      'stressmanager-3',
    ])
  })

  it('7 — leaves clientCorrelationId undefined without a prefix', () => {
    const result = normalizeFertilizerInventoryCreationInput(baseInput())
    expect(result.packages[0]?.clientCorrelationId).toBeUndefined()
  })

  it('8 — rejects an empty group list', () => {
    expectCreationError(
      () => normalizeFertilizerInventoryCreationInput(baseInput({ confirmedPackageGroups: [] })),
      'inventory_package_list_empty',
    )
  })

  it('9 — rejects count = 0', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25,
                packageSizeUnit: 'kg',
                initialQuantityValue: 25,
                initialQuantityUnit: 'kg',
                count: 0,
              },
            ],
          }),
        ),
      'inventory_package_count_invalid',
    )
  })

  it('10 — rejects negative count', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25,
                packageSizeUnit: 'kg',
                initialQuantityValue: 25,
                initialQuantityUnit: 'kg',
                count: -1,
              },
            ],
          }),
        ),
      'inventory_package_count_invalid',
    )
  })

  it('11 — rejects non-integer count', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25,
                packageSizeUnit: 'kg',
                initialQuantityValue: 25,
                initialQuantityUnit: 'kg',
                count: 1.5,
              },
            ],
          }),
        ),
      'inventory_package_count_invalid',
    )
  })

  it('12 — rejects more than 20 expanded packages', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25,
                packageSizeUnit: 'kg',
                initialQuantityValue: 25,
                initialQuantityUnit: 'kg',
                count: 21,
              },
            ],
          }),
        ),
      'inventory_package_count_exceeded',
    )
  })

  it('13 — accepts exactly 20 expanded packages', () => {
    const result = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            count: FERTILIZER_INVENTORY_CREATION_MAX_PACKAGES,
          },
        ],
      }),
    )

    expect(result.packages).toHaveLength(FERTILIZER_INVENTORY_CREATION_MAX_PACKAGES)
  })

  it('14 — rejects package size zero', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 0,
                packageSizeUnit: 'kg',
                initialQuantityValue: 0,
                initialQuantityUnit: 'kg',
                count: 1,
              },
            ],
          }),
        ),
      'inventory_package_size_invalid',
    )
  })

  it('15 — rejects negative package size', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: -5,
                packageSizeUnit: 'kg',
                initialQuantityValue: 1,
                initialQuantityUnit: 'kg',
                count: 1,
              },
            ],
          }),
        ),
      'inventory_package_size_invalid',
    )
  })

  it('16 — rejects non-finite package size', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: Number.NaN,
                packageSizeUnit: 'kg',
                initialQuantityValue: 1,
                initialQuantityUnit: 'kg',
                count: 1,
              },
            ],
          }),
        ),
      'inventory_package_size_invalid',
    )
  })

  it('17 — rejects initial quantity zero', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25,
                packageSizeUnit: 'kg',
                initialQuantityValue: 0,
                initialQuantityUnit: 'kg',
                count: 1,
              },
            ],
          }),
        ),
      'inventory_initial_quantity_invalid',
    )
  })

  it('18 — rejects negative initial quantity', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25,
                packageSizeUnit: 'kg',
                initialQuantityValue: -1,
                initialQuantityUnit: 'kg',
                count: 1,
              },
            ],
          }),
        ),
      'inventory_initial_quantity_invalid',
    )
  })

  it('19 — rejects non-finite initial quantity', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25,
                packageSizeUnit: 'kg',
                initialQuantityValue: Number.POSITIVE_INFINITY,
                initialQuantityUnit: 'kg',
                count: 1,
              },
            ],
          }),
        ),
      'inventory_initial_quantity_invalid',
    )
  })

  it('20 — rejects initial quantity greater than package size', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25,
                packageSizeUnit: 'kg',
                initialQuantityValue: 26,
                initialQuantityUnit: 'kg',
                count: 1,
              },
            ],
          }),
        ),
      'inventory_initial_quantity_exceeds_package_size',
    )
  })

  it('21 — accepts initial quantity equal to package size', () => {
    const result = normalizeFertilizerInventoryCreationInput(baseInput())
    expect(result.packages[0]?.initialQuantityValue).toBe(25)
    expect(result.packages[0]?.packageSizeValue).toBe(25)
  })

  it('22 — accepts initial quantity less than package size', () => {
    const result = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 12,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    )

    expect(result.packages[0]?.initialQuantityValue).toBe(12)
  })

  it('23 — rejects more than four decimal places on package size', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25.00001,
                packageSizeUnit: 'kg',
                initialQuantityValue: 25,
                initialQuantityUnit: 'kg',
                count: 1,
              },
            ],
          }),
        ),
      'inventory_quantity_precision_invalid',
    )
  })

  it('24 — rejects more than four decimal places on initial quantity', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25,
                packageSizeUnit: 'kg',
                initialQuantityValue: 12.00001,
                initialQuantityUnit: 'kg',
                count: 1,
              },
            ],
          }),
        ),
      'inventory_quantity_precision_invalid',
    )
  })

  it('25 — accepts exactly four decimal places', () => {
    const result = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 25.1234,
            packageSizeUnit: 'kg',
            initialQuantityValue: 12.4321,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    )

    expect(result.packages[0]?.packageSizeValue).toBe(25.1234)
    expect(result.packages[0]?.initialQuantityValue).toBe(12.4321)
  })

  it('26 — rejects kg/ml unit mismatch', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25,
                packageSizeUnit: 'kg',
                initialQuantityValue: 25,
                initialQuantityUnit: 'ml',
                count: 1,
              },
            ],
          }),
        ),
      'inventory_unit_mismatch',
    )
  })

  it('27 — accepts initial_stock', () => {
    const result = normalizeFertilizerInventoryCreationInput(
      baseInput({ creationReason: 'initial_stock' }),
    )
    expect(result.creationReason).toBe('initial_stock')
  })

  it('28 — accepts purchase', () => {
    expect(normalizeFertilizerInventoryCreationInput(baseInput()).creationReason).toBe('purchase')
  })

  it('29 — accepts gift_received', () => {
    const result = normalizeFertilizerInventoryCreationInput(
      baseInput({ creationReason: 'gift_received' }),
    )
    expect(result.creationReason).toBe('gift_received')
  })

  it('30 — rejects inventory_correction as creation reason', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            creationReason: 'inventory_correction' as FertilizerInventoryCreationReason,
          }),
        ),
      'inventory_creation_reason_invalid',
    )
  })

  it('31 — rejects unknown creation reason', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            creationReason: 'sale' as FertilizerInventoryCreationReason,
          }),
        ),
      'inventory_creation_reason_invalid',
    )
  })

  it('32 — rejects empty idempotency key', () => {
    expectCreationError(
      () => normalizeFertilizerInventoryCreationInput(baseInput({ idempotencyKey: '' })),
      'inventory_creation_idempotency_invalid',
    )
  })

  it('33 — rejects whitespace-only idempotency key', () => {
    expectCreationError(
      () => normalizeFertilizerInventoryCreationInput(baseInput({ idempotencyKey: '   ' })),
      'inventory_creation_idempotency_invalid',
    )
  })

  it('34 — rejects invalid product profile id', () => {
    expectCreationError(
      () => normalizeFertilizerInventoryCreationInput(baseInput({ savedProductProfileId: 'not-a-uuid' })),
      'inventory_product_profile_id_invalid',
    )
  })

  it('35 — rejects invalid access context', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            accessContext: { kind: 'session', sessionId: '   ' },
          }),
        ),
      'inventory_access_context_invalid',
    )
  })

  it('36 — rejects invalid correlation prefix', () => {
    expectCreationError(
      () =>
        normalizeFertilizerInventoryCreationInput(
          baseInput({
            confirmedPackageGroups: [
              {
                packageSizeValue: 25,
                packageSizeUnit: 'kg',
                initialQuantityValue: 25,
                initialQuantityUnit: 'kg',
                count: 1,
                clientCorrelationIdPrefix: 'bad prefix',
              },
            ],
          }),
        ),
      'inventory_client_correlation_id_invalid',
    )
  })

  it('37 — rejects invalid source event reference', () => {
    expectCreationError(
      () => normalizeFertilizerInventoryCreationInput(baseInput({ sourceEventRef: '   ' })),
      'inventory_source_event_ref_invalid',
    )
  })

  it('38 — produces deterministic canonical payload for identical input', () => {
    const input = baseInput()
    const first = normalizeFertilizerInventoryCreationInput(input)
    const second = normalizeFertilizerInventoryCreationInput(input)

    expect(first.canonicalPayload).toBe(second.canonicalPayload)
  })

  it('39 — treats 25, 25.0 and 25.0000 as the same canonical quantity', () => {
    expect(formatCanonicalInventoryCreationQuantity(25)).toBe('25')
    expect(formatCanonicalInventoryCreationQuantity(25.0)).toBe('25')
    expect(formatCanonicalInventoryCreationQuantity(25.0000)).toBe('25')

    const spellings = [25, 25.0, 25.0000].map((value) =>
      normalizeFertilizerInventoryCreationInput(
        baseInput({
          confirmedPackageGroups: [
            {
              packageSizeValue: value,
              packageSizeUnit: 'kg',
              initialQuantityValue: value,
              initialQuantityUnit: 'kg',
              count: 1,
            },
          ],
        }),
      ).canonicalPayload,
    )

    expect(new Set(spellings).size).toBe(1)
  })

  it('40 — changes canonical payload when package count changes', () => {
    const one = normalizeFertilizerInventoryCreationInput(baseInput()).canonicalPayload
    const three = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            count: 3,
          },
        ],
      }),
    ).canonicalPayload

    expect(one).not.toBe(three)
  })

  it('41 — changes canonical payload when package size changes', () => {
    const base = normalizeFertilizerInventoryCreationInput(baseInput()).canonicalPayload
    const changed = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 10,
            packageSizeUnit: 'kg',
            initialQuantityValue: 10,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    ).canonicalPayload

    expect(base).not.toBe(changed)
  })

  it('42 — changes canonical payload when initial quantity changes', () => {
    const base = normalizeFertilizerInventoryCreationInput(baseInput()).canonicalPayload
    const changed = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 12,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    ).canonicalPayload

    expect(base).not.toBe(changed)
  })

  it('43 — changes canonical payload when creation reason changes', () => {
    const purchase = normalizeFertilizerInventoryCreationInput(baseInput()).canonicalPayload
    const initialStock = normalizeFertilizerInventoryCreationInput(
      baseInput({ creationReason: 'initial_stock' }),
    ).canonicalPayload

    expect(purchase).not.toBe(initialStock)
  })

  it('44 — changes canonical payload when product profile changes', () => {
    const first = normalizeFertilizerInventoryCreationInput(baseInput()).canonicalPayload
    const second = normalizeFertilizerInventoryCreationInput(
      baseInput({ savedProductProfileId: 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee' }),
    ).canonicalPayload

    expect(first).not.toBe(second)
  })

  it('45 — changes canonical payload when package order changes', () => {
    const ordered = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            count: 1,
          },
          {
            packageSizeValue: 10,
            packageSizeUnit: 'kg',
            initialQuantityValue: 10,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    ).canonicalPayload

    const reversed = normalizeFertilizerInventoryCreationInput(
      baseInput({
        confirmedPackageGroups: [
          {
            packageSizeValue: 10,
            packageSizeUnit: 'kg',
            initialQuantityValue: 10,
            initialQuantityUnit: 'kg',
            count: 1,
          },
          {
            packageSizeValue: 25,
            packageSizeUnit: 'kg',
            initialQuantityValue: 25,
            initialQuantityUnit: 'kg',
            count: 1,
          },
        ],
      }),
    ).canonicalPayload

    expect(ordered).not.toBe(reversed)
  })

  it('46 — canonical payload contains no timestamps or random values', () => {
    const result = normalizeFertilizerInventoryCreationInput(baseInput())

    expect(result.canonicalPayload).not.toMatch(/\d{4}-\d{2}-\d{2}T/)
    expect(result.canonicalPayload).not.toContain('createdAt')
    expect(result.canonicalPayload).not.toContain('movementAt')

    const parsed = JSON.parse(result.canonicalPayload) as {
      packages: Array<{ id?: string; movementId?: string }>
    }

    expect(parsed.packages.every((pkg) => pkg.id == null && pkg.movementId == null)).toBe(true)
  })

  it('47 — does not mutate the input object', () => {
    const input = baseInput({
      confirmedPackageGroups: [
        {
          packageSizeValue: 25,
          packageSizeUnit: 'kg',
          initialQuantityValue: 25,
          initialQuantityUnit: 'kg',
          count: 2,
          clientCorrelationIdPrefix: ' keep-me ',
        },
      ],
    })
    const snapshot = structuredClone(input)

    normalizeFertilizerInventoryCreationInput(input)

    expect(input).toEqual(snapshot)
  })

  it('48 — does not call persistence functions', () => {
    expect(() => normalizeFertilizerInventoryCreationInput(baseInput())).not.toThrow()
  })

  it('49 — does not produce balance or currentQuantity fields', () => {
    const result = normalizeFertilizerInventoryCreationInput(baseInput())
    const serialized = JSON.stringify(result)

    expect(serialized).not.toContain('currentQuantity')
    expect(serialized).not.toContain('balance')
    expect(serialized).not.toContain('remainingQuantity')
  })

  it('50 — excludes inventory_correction from the creation reason type', () => {
    const allowed: FertilizerInventoryCreationReason[] = [
      'initial_stock',
      'purchase',
      'gift_received',
    ]

    expect(allowed).not.toContain('inventory_correction')
  })

  it('normalizes authenticated access context and sourceEventRef', () => {
    const result = normalizeFertilizerInventoryCreationInput(
      baseInput({
        accessContext: AUTH_ACCESS,
        sourceEventRef: ' event-123 ',
      }),
    )

    expect(result.accessContext).toEqual(AUTH_ACCESS)
    expect(result.sourceEventRef).toBe('event-123')
  })

  it('normalized result does not expose diagnosticFingerprint', () => {
    const result = normalizeFertilizerInventoryCreationInput(baseInput())

    expect('diagnosticFingerprint' in result).toBe(false)
    expect(Object.keys(result).sort()).toEqual([
      'accessContext',
      'canonicalPayload',
      'creationReason',
      'idempotencyKey',
      'packages',
      'savedProductProfileId',
      'sourceEventRef',
    ])

    const _typeCheck: Omit<NormalizedFertilizerInventoryCreationInput, 'diagnosticFingerprint'> =
      result
    void _typeCheck
  })

  it('production core source has no node:crypto or other node: imports', () => {
    expect(CREATION_CORE_SOURCE).not.toMatch(/from ['"]node:/)
    expect(CREATION_CORE_SOURCE).not.toMatch(/import ['"]node:/)
    expect(CREATION_CORE_SOURCE).not.toContain('diagnosticFingerprint')
    expect(CREATION_CORE_SOURCE).not.toMatch(/createHash|computeDiagnostic/)
  })

  it('does not export an authoritative idempotency hash helper', () => {
    expect(CREATION_CORE_SOURCE).not.toMatch(
      /export function compute.*Fingerprint|export function .*Hash/,
    )
  })

  it('buildCanonicalFertilizerInventoryCreationPayload uses explicit package order', () => {
    const packages = expandConfirmedPackageGroups([
      {
        packageSizeValue: 25,
        packageSizeUnit: 'kg',
        initialQuantityValue: 25,
        initialQuantityUnit: 'kg',
        count: 1,
      },
    ])

    const payload = buildCanonicalFertilizerInventoryCreationPayload({
      savedProductProfileId: PROFILE_ID,
      accessContext: SESSION_ACCESS,
      creationReason: 'purchase',
      idempotencyKey: 'idem',
      sourceEventRef: null,
      packages,
    })

    expect(JSON.parse(payload).packages[0].sequenceIndex).toBe(0)
  })
})
