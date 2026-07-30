import { describe, expect, it, vi } from 'vitest'
import type { FertilizerSavedProductProfile } from '../types/fertilizerProductProfile'
import {
  FERTILIZER_COMPOSITION_FINGERPRINT_VERSION,
  FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE,
  FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS,
} from '../types/fertilizerProductProfile'
import {
  FertilizerProductProfileRepositoryError,
  createInMemoryFertilizerProductProfileRepository,
} from './fertilizerProductProfileRepositoryCore'
import {
  FERTILIZER_SAVED_PRODUCT_PROFILES_TABLE,
  createPersistentFertilizerProductProfileRepository,
  mapRecordToRow,
  mapRowToRecord,
  validateFertilizerSavedProductProfileRecord,
} from './fertilizerProductProfileRepositoryMappingCore'
import {
  deriveTestSessionAccessHash,
  PHASE5_SESSION_HASH,
} from './fertilizerProductProfileSaveTestFixtures'

function buildProfile(overrides: Partial<FertilizerSavedProductProfile> = {}): FertilizerSavedProductProfile {
  return {
    id: 'persist-1',
    accessKind: 'authenticated_user',
    userId: 'user-persist',
    sessionAccessHash: null,
    productFamilyKey: 'family',
    identityFingerprint: 'identity',
    manufacturer: 'ICL',
    productLine: null,
    officialName: 'Test',
    variant: null,
    productForm: 'granular',
    npkDeclaration: '15-0-26',
    nitrogen: 15,
    phosphate: 0,
    potash: 26,
    nutrientMatrix: {},
    compositionFingerprintVersion: FERTILIZER_COMPOSITION_FINGERPRINT_VERSION,
    compositionFingerprint: 'fingerprint-a',
    provenance: { confirmedAt: '2026-07-31T10:00:00.000Z' },
    saveIdempotencyKey: 'persist-idem',
    source: FERTILIZER_SAVED_PRODUCT_PROFILE_SOURCE,
    profileStatus: FERTILIZER_SAVED_PRODUCT_PROFILE_STATUS,
    verificationStatus: 'verified',
    createdAt: '2026-07-31T10:00:00.000Z',
    ...overrides,
  }
}

describe('fertilizerProductProfileRepositoryPersistentCore', () => {
  it('maps record to row and back without raw session id in row mapping', () => {
    const profile = buildProfile({
      accessKind: 'session',
      userId: null,
      sessionAccessHash: PHASE5_SESSION_HASH,
    })

    const row = mapRecordToRow(profile)
    expect(row.session_access_hash).toBe(PHASE5_SESSION_HASH)
    expect(JSON.stringify(row).includes('session-phase5')).toBe(false)

    const roundTrip = mapRowToRecord({
      ...row,
      created_at: profile.createdAt,
    })

    expect(roundTrip.id).toBe(profile.id)
  })

  it('validateFertilizerSavedProductProfileRecord rejects invalid session hash', () => {
    expect(() =>
      validateFertilizerSavedProductProfileRecord(
        buildProfile({
          accessKind: 'session',
          userId: null,
          sessionAccessHash: 'short',
        }),
      ),
    ).toThrow(FertilizerProductProfileRepositoryError)
  })

  it('reloads existing version after unique conflict', async () => {
    const existing = buildProfile()
    const insertedRow = {
      ...mapRecordToRow(existing),
      created_at: existing.createdAt,
    }

    function createEqChain(depth: number, terminal: () => Promise<{ data: unknown; error: unknown }>) {
      if (depth <= 0) {
        return {
          maybeSingle: vi.fn(terminal),
        }
      }

      return {
        eq: vi.fn(() => createEqChain(depth - 1, terminal)),
        maybeSingle: vi.fn(terminal),
      }
    }

    const supabase = {
      from: vi.fn((table: string) => {
        expect(table).toBe(FERTILIZER_SAVED_PRODUCT_PROFILES_TABLE)

        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string, value: unknown) => {
              if (column === 'save_idempotency_key' && value === existing.saveIdempotencyKey) {
                return createEqChain(3, async () => ({ data: insertedRow, error: null }))
              }

              if (column === 'product_family_key' && value === existing.productFamilyKey) {
                return createEqChain(5, async () => ({ data: insertedRow, error: null }))
              }

              return createEqChain(3, async () => ({ data: null, error: null }))
            }),
          })),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: null,
                error: {
                  code: '23505',
                  message:
                    'duplicate key value violates unique constraint "product_profiles_saved_auth_version_idx"',
                },
              })),
            })),
          })),
        }
      }),
    }

    const repository = createPersistentFertilizerProductProfileRepository({
      supabase: supabase as never,
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    })

    const saved = await repository.saveNewVersion(existing, {
      kind: 'authenticated_user',
      userId: existing.userId!,
    })

    expect(saved.id).toBe(existing.id)
  })

  it('in-memory repository remains reference implementation for persistent contract', async () => {
    const repository = createInMemoryFertilizerProductProfileRepository({
      deriveSessionAccessHash: deriveTestSessionAccessHash,
    })
    const profile = buildProfile({ id: 'contract-profile' })

    const saved = await repository.saveNewVersion(profile, {
      kind: 'authenticated_user',
      userId: profile.userId!,
    })

    expect(saved.compositionFingerprint).toBe(profile.compositionFingerprint)
  })
})
