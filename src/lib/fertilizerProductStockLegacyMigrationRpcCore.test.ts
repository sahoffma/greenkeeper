import { describe, expect, it } from 'vitest'
import {
  buildLegacyMigrationMovementIdempotencyKey,
  mapLegacyMigrationDryRunResult,
  mapLegacyMigrationGroupAnalysis,
  mapMigrateLegacyGroupRpcResult,
} from './fertilizerProductStockLegacyMigrationRpcCore'

describe('fertilizerProductStockLegacyMigrationRpcCore', () => {
  it('builds deterministic movement idempotency key from receipt id', () => {
    const receiptId = '11111111-1111-1111-1111-111111111111'
    expect(buildLegacyMigrationMovementIdempotencyKey(receiptId)).toBe(
      'product-stock-legacy-migration:11111111-1111-1111-1111-111111111111',
    )
  })

  it('maps dry-run payload', () => {
    const mapped = mapLegacyMigrationDryRunResult({
      migrationCutoffAt: '2026-08-02T12:00:00.000Z',
      summary: {
        legacyItemCount: 2,
        migrationGroupCount: 1,
        autoMigratableGroups: 1,
      },
      groups: [
        {
          migrationGroupKey: 'abc',
          userId: 'user-1',
          savedProductProfileId: 'profile-1',
          baseUnit: 'kg',
          legacyContainerIds: ['legacy-1'],
          classification: 'B',
          autoMigratable: true,
          blockingReasons: [],
          expectedTakeoverMovement: true,
        },
      ],
    })

    expect(mapped.summary.legacyItemCount).toBe(2)
    expect(mapped.groups[0]?.classification).toBe('B')
    expect(mapped.groups[0]?.baseUnit).toBe('kg')
  })

  it('maps migrate RPC result', () => {
    const mapped = mapMigrateLegacyGroupRpcResult({
      receipt_id: 'receipt-1',
      idempotency_key: 'key-1',
      migration_group_key: 'group-1',
      classification: 'B',
      canonical_container_id: 'canonical-1',
      legacy_container_ids: ['legacy-1'],
      takeover_movement_id: 'movement-1',
      effective_balance: 5,
      movement_checksum: 'checksum',
      migration_cutoff_at: '2026-08-02T12:00:00.000Z',
      idempotency_replay: false,
    })

    expect(mapped.receipt_id).toBe('receipt-1')
    expect(mapped.takeover_movement_id).toBe('movement-1')
    expect(mapped.effective_balance).toBe(5)
  })

  it('maps group analysis blocking reasons', () => {
    const mapped = mapLegacyMigrationGroupAnalysis({
      migrationGroupKey: 'abc',
      userId: 'user',
      savedProductProfileId: 'profile',
      baseUnit: 'ml',
      legacyContainerIds: [],
      classification: 'H',
      autoMigratable: false,
      blockingReasons: ['negative_balance'],
      expectedTakeoverMovement: false,
    })

    expect(mapped.blockingReasons).toEqual(['negative_balance'])
    expect(mapped.autoMigratable).toBe(false)
  })
})
