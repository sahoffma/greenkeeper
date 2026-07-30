import type { SupabaseClient } from '@supabase/supabase-js'
import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import type {
  FertilizerCompositionFingerprintVersion,
  FertilizerSavedProductProfile,
  FertilizerSavedProductProfileAccessKind,
  FertilizerSavedProductProfileProvenance,
} from '../types/fertilizerProductProfile'
import type { FertilizerNutrientMatrix } from '../types/fertilizerReadiness'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import {
  FertilizerProductProfileRepositoryError,
  type FertilizerProductProfileRepository,
  validateFertilizerSavedProductProfileRecord,
} from './fertilizerProductProfileRepositoryCore'

export { validateFertilizerSavedProductProfileRecord }

export const FERTILIZER_SAVED_PRODUCT_PROFILES_TABLE = 'product_profiles'

export const FERTILIZER_SAVED_PRODUCT_PROFILE_ROW_SELECT =
  'id, access_kind, user_id, session_access_hash, product_family_key, identity_fingerprint, manufacturer, product_line, official_name, variant, product_form, nitrogen, phosphate, potash, npk_declaration, nutrient_matrix, composition_fingerprint_version, composition_fingerprint, provenance_json, save_idempotency_key, source, profile_status, verification_status, created_at'

export interface FertilizerSavedProductProfileRow {
  id: string
  access_kind: FertilizerSavedProductProfileAccessKind
  user_id: string | null
  session_access_hash: string | null
  product_family_key: string
  identity_fingerprint: string
  manufacturer: string | null
  product_line: string | null
  official_name: string | null
  variant: string | null
  product_form: 'granular' | 'liquid'
  nitrogen: number
  phosphate: number
  potash: number
  npk_declaration: string
  nutrient_matrix: FertilizerNutrientMatrix
  composition_fingerprint_version: FertilizerCompositionFingerprintVersion
  composition_fingerprint: string
  provenance_json: FertilizerSavedProductProfileProvenance
  save_idempotency_key: string
  source: 'enrichment'
  profile_status: 'saved'
  verification_status: 'verified'
  created_at: string
}

const VERSION_UNIQUE_INDEXES = new Set([
  'product_profiles_saved_auth_version_idx',
  'product_profiles_saved_session_version_idx',
])

const IDEMPOTENCY_UNIQUE_INDEXES = new Set([
  'product_profiles_saved_auth_idempotency_idx',
  'product_profiles_saved_session_idempotency_idx',
])

export function mapRecordToRow(
  profile: FertilizerSavedProductProfile,
): Omit<FertilizerSavedProductProfileRow, 'created_at'> {
  return {
    id: profile.id,
    access_kind: profile.accessKind,
    user_id: profile.userId,
    session_access_hash: profile.sessionAccessHash,
    product_family_key: profile.productFamilyKey,
    identity_fingerprint: profile.identityFingerprint,
    manufacturer: profile.manufacturer,
    product_line: profile.productLine,
    official_name: profile.officialName,
    variant: profile.variant,
    product_form: profile.productForm,
    nitrogen: profile.nitrogen,
    phosphate: profile.phosphate,
    potash: profile.potash,
    npk_declaration: profile.npkDeclaration ?? '',
    nutrient_matrix: profile.nutrientMatrix,
    composition_fingerprint_version: profile.compositionFingerprintVersion,
    composition_fingerprint: profile.compositionFingerprint,
    provenance_json: profile.provenance,
    save_idempotency_key: profile.saveIdempotencyKey,
    source: profile.source,
    profile_status: profile.profileStatus,
    verification_status: profile.verificationStatus,
  }
}

export function mapRowToRecord(row: FertilizerSavedProductProfileRow): FertilizerSavedProductProfile {
  return {
    id: row.id,
    accessKind: row.access_kind,
    userId: row.user_id,
    sessionAccessHash: row.session_access_hash,
    productFamilyKey: row.product_family_key,
    identityFingerprint: row.identity_fingerprint,
    manufacturer: row.manufacturer,
    productLine: row.product_line,
    officialName: row.official_name,
    variant: row.variant,
    productForm: row.product_form,
    nitrogen: row.nitrogen,
    phosphate: row.phosphate,
    potash: row.potash,
    npkDeclaration: row.npk_declaration,
    nutrientMatrix: row.nutrient_matrix,
    compositionFingerprintVersion: row.composition_fingerprint_version,
    compositionFingerprint: row.composition_fingerprint,
    provenance: row.provenance_json,
    saveIdempotencyKey: row.save_idempotency_key,
    source: row.source,
    profileStatus: row.profile_status,
    verificationStatus: row.verification_status,
    createdAt: row.created_at,
  }
}

function mapInsertError(error: {
  code?: string | null
  message?: string | null
  details?: string | null
}): FertilizerProductProfileRepositoryError {
  if (error.code === '23505') {
    const constraintHaystack = `${error.message ?? ''} ${error.details ?? ''}`
    const isKnownUniqueConflict = [...VERSION_UNIQUE_INDEXES, ...IDEMPOTENCY_UNIQUE_INDEXES].some(
      (indexName) => constraintHaystack.includes(indexName),
    )

    if (isKnownUniqueConflict) {
      return new FertilizerProductProfileRepositoryError(
        'version_unique_conflict',
        'Saved product profile version already exists.',
      )
    }
  }

  return new FertilizerProductProfileRepositoryError(
    'persistence_unavailable',
    'Product profile persistence failed.',
  )
}

function applyAccessFilters(
  query: AccessScopedSelectQuery,
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash: DeriveSessionAccessHash,
): AccessScopedSelectQuery {
  if (accessContext.kind === 'authenticated_user') {
    return query
      .eq('access_kind', 'authenticated_user')
      .eq('user_id', accessContext.userId)
      .eq('profile_status', 'saved')
  }

  return query
    .eq('access_kind', 'session')
    .eq('session_access_hash', deriveSessionAccessHash(accessContext.sessionId))
    .eq('profile_status', 'saved')
}

function rowFromQueryResult(data: unknown): FertilizerSavedProductProfile {
  return mapRowToRecord(data as FertilizerSavedProductProfileRow)
}

interface AccessScopedSelectQuery {
  eq(column: string, value: unknown): AccessScopedSelectQuery
  maybeSingle(): Promise<{ data: unknown; error: unknown }>
}

function asAccessScopedSelectQuery(query: unknown): AccessScopedSelectQuery {
  return query as AccessScopedSelectQuery
}

export interface PersistentFertilizerProductProfileRepositoryDependencies {
  supabase: SupabaseClient
  deriveSessionAccessHash: DeriveSessionAccessHash
  validateRecord?: (record: FertilizerSavedProductProfile) => void
}

export function createPersistentFertilizerProductProfileRepository(
  dependencies: PersistentFertilizerProductProfileRepositoryDependencies,
): FertilizerProductProfileRepository {
  const validateRecord =
    dependencies.validateRecord ?? validateFertilizerSavedProductProfileRecord
  const { supabase, deriveSessionAccessHash } = dependencies

  return {
    async findByIdentityAndCompositionFingerprint(lookup, accessContext) {
      const { data, error } = await applyAccessFilters(
        asAccessScopedSelectQuery(
          supabase
            .from(FERTILIZER_SAVED_PRODUCT_PROFILES_TABLE)
            .select(FERTILIZER_SAVED_PRODUCT_PROFILE_ROW_SELECT)
            .eq('product_family_key', lookup.productFamilyKey)
            .eq('composition_fingerprint_version', lookup.compositionFingerprintVersion)
            .eq('composition_fingerprint', lookup.compositionFingerprint),
        ),
        accessContext,
        deriveSessionAccessHash,
      ).maybeSingle()

      if (error) {
        throw new FertilizerProductProfileRepositoryError(
          'persistence_unavailable',
          'Failed to load saved product profile.',
        )
      }

      if (!data) {
        return null
      }

      const record = rowFromQueryResult(data)
      validateRecord(record)
      return record
    },
    async findBySaveIdempotencyKey(saveIdempotencyKey, accessContext) {
      const { data, error } = await applyAccessFilters(
        asAccessScopedSelectQuery(
          supabase
            .from(FERTILIZER_SAVED_PRODUCT_PROFILES_TABLE)
            .select(FERTILIZER_SAVED_PRODUCT_PROFILE_ROW_SELECT)
            .eq('save_idempotency_key', saveIdempotencyKey),
        ),
        accessContext,
        deriveSessionAccessHash,
      ).maybeSingle()

      if (error) {
        throw new FertilizerProductProfileRepositoryError(
          'persistence_unavailable',
          'Failed to load saved product profile.',
        )
      }

      if (!data) {
        return null
      }

      const record = rowFromQueryResult(data)
      validateRecord(record)
      return record
    },
    async getById(id, accessContext) {
      const { data, error } = await applyAccessFilters(
        asAccessScopedSelectQuery(
          supabase
            .from(FERTILIZER_SAVED_PRODUCT_PROFILES_TABLE)
            .select(FERTILIZER_SAVED_PRODUCT_PROFILE_ROW_SELECT)
            .eq('id', id),
        ),
        accessContext,
        deriveSessionAccessHash,
      ).maybeSingle()

      if (error) {
        throw new FertilizerProductProfileRepositoryError(
          'persistence_unavailable',
          'Failed to load saved product profile.',
        )
      }

      if (!data) {
        return null
      }

      const record = rowFromQueryResult(data)
      validateRecord(record)
      return record
    },
    async saveNewVersion(profile, accessContext) {
      validateRecord(profile)

      try {
        const { data, error } = await supabase
          .from(FERTILIZER_SAVED_PRODUCT_PROFILES_TABLE)
          .insert(mapRecordToRow(profile))
          .select(FERTILIZER_SAVED_PRODUCT_PROFILE_ROW_SELECT)
          .single()

        if (error) {
          throw mapInsertError(error)
        }

        const record = mapRowToRecord(data as FertilizerSavedProductProfileRow)
        validateRecord(record)
        return record
      } catch (error) {
        if (
          error instanceof FertilizerProductProfileRepositoryError &&
          error.code === 'version_unique_conflict'
        ) {
          const existingByIdempotency = await this.findBySaveIdempotencyKey(
            profile.saveIdempotencyKey,
            accessContext,
          )
          if (existingByIdempotency) {
            return existingByIdempotency
          }

          const existingByVersion = await this.findByIdentityAndCompositionFingerprint(
            {
              productFamilyKey: profile.productFamilyKey,
              compositionFingerprintVersion: profile.compositionFingerprintVersion,
              compositionFingerprint: profile.compositionFingerprint,
            },
            accessContext,
          )
          if (existingByVersion) {
            return existingByVersion
          }
        }

        if (error instanceof FertilizerProductProfileRepositoryError) {
          throw error
        }

        throw new FertilizerProductProfileRepositoryError(
          'persistence_unavailable',
          'Product profile persistence failed.',
        )
      }
    },
  }
}
