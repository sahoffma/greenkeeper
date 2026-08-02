import type { FertilizerEnrichmentAccessContext } from '../types/fertilizerEnrichmentOrchestration'
import type {
  FertilizerCompositionFingerprintVersion,
  FertilizerSavedProductProfile,
} from '../types/fertilizerProductProfile'
import type { DeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import { isValidSessionAccessHash } from './fertilizerSessionAccessHashValidationCore'

export const FERTILIZER_PRODUCT_PROFILE_REPOSITORY_ERROR_CODES = [
  'invalid_stored_record',
  'persistence_unavailable',
  'idempotency_conflict',
  'version_unique_conflict',
] as const

export type FertilizerProductProfileRepositoryErrorCode =
  (typeof FERTILIZER_PRODUCT_PROFILE_REPOSITORY_ERROR_CODES)[number]

export class FertilizerProductProfileRepositoryError extends Error {
  readonly code: FertilizerProductProfileRepositoryErrorCode

  constructor(code: FertilizerProductProfileRepositoryErrorCode, message: string) {
    super(message)
    this.name = 'FertilizerProductProfileRepositoryError'
    this.code = code
  }
}

export interface FertilizerProductProfileVersionLookup {
  productFamilyKey: string
  compositionFingerprintVersion: FertilizerCompositionFingerprintVersion
  compositionFingerprint: string
}

export interface FertilizerProductProfileRepository {
  findByIdentityAndCompositionFingerprint(
    lookup: FertilizerProductProfileVersionLookup,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerSavedProductProfile | null>
  findBySaveIdempotencyKey(
    saveIdempotencyKey: string,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerSavedProductProfile | null>
  getById(
    id: string,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerSavedProductProfile | null>
  saveNewVersion(
    profile: FertilizerSavedProductProfile,
    accessContext: FertilizerEnrichmentAccessContext,
  ): Promise<FertilizerSavedProductProfile>
}

export interface InMemoryFertilizerProductProfileRepositoryState {
  byId: Map<string, FertilizerSavedProductProfile>
  byVersionKey: Map<string, string>
  byIdempotencyKey: Map<string, string>
}

function accessScopeKey(
  accessContext: FertilizerEnrichmentAccessContext,
  deriveSessionAccessHash?: DeriveSessionAccessHash,
): string {
  if (accessContext.kind === 'authenticated_user') {
    return `user:${accessContext.userId}`
  }

  if (!deriveSessionAccessHash) {
    throw new FertilizerProductProfileRepositoryError(
      'invalid_stored_record',
      'Session access hash derivation is required for session-scoped lookups.',
    )
  }

  return `session:${deriveSessionAccessHash(accessContext.sessionId)}`
}

function profileAccessScopeKey(profile: FertilizerSavedProductProfile): string {
  if (profile.accessKind === 'authenticated_user') {
    return `user:${profile.userId}`
  }

  return `session:${profile.sessionAccessHash}`
}

function versionLookupKey(
  lookup: FertilizerProductProfileVersionLookup,
  accessScope: string,
): string {
  return `${accessScope}|${lookup.productFamilyKey}|${lookup.compositionFingerprintVersion}|${lookup.compositionFingerprint}`
}

function idempotencyLookupKey(saveIdempotencyKey: string, accessScope: string): string {
  return `${accessScope}|${saveIdempotencyKey}`
}

function cloneProfile(profile: FertilizerSavedProductProfile): FertilizerSavedProductProfile {
  return structuredClone(profile)
}

export function profileMatchesAccessContext(
  profile: FertilizerSavedProductProfile,
  accessContext: FertilizerEnrichmentAccessContext,
  sessionAccessHash?: string | null,
): boolean {
  if (accessContext.kind === 'authenticated_user') {
    return profile.accessKind === 'authenticated_user' && profile.userId === accessContext.userId
  }

  if (profile.accessKind !== 'session' || !profile.sessionAccessHash) {
    return false
  }

  return sessionAccessHash != null && profile.sessionAccessHash === sessionAccessHash
}

export interface InMemoryFertilizerProductProfileRepositoryOptions {
  initialState?: Partial<InMemoryFertilizerProductProfileRepositoryState>
  deriveSessionAccessHash?: DeriveSessionAccessHash
}

export function createInMemoryFertilizerProductProfileRepository(
  options: InMemoryFertilizerProductProfileRepositoryOptions = {},
): FertilizerProductProfileRepository & {
  state: InMemoryFertilizerProductProfileRepositoryState
} {
  const { initialState, deriveSessionAccessHash } = options
  const state: InMemoryFertilizerProductProfileRepositoryState = {
    byId: initialState?.byId ?? new Map(),
    byVersionKey: initialState?.byVersionKey ?? new Map(),
    byIdempotencyKey: initialState?.byIdempotencyKey ?? new Map(),
  }

  return {
    state,
    async findByIdentityAndCompositionFingerprint(lookup, accessContext) {
      const profileId = state.byVersionKey.get(
        versionLookupKey(lookup, accessScopeKey(accessContext, deriveSessionAccessHash)),
      )
      if (!profileId) {
        return null
      }

      const profile = state.byId.get(profileId)
      return profile ? cloneProfile(profile) : null
    },
    async findBySaveIdempotencyKey(saveIdempotencyKey, accessContext) {
      const profileId = state.byIdempotencyKey.get(
        idempotencyLookupKey(
          saveIdempotencyKey,
          accessScopeKey(accessContext, deriveSessionAccessHash),
        ),
      )
      if (!profileId) {
        return null
      }

      const profile = state.byId.get(profileId)
      return profile ? cloneProfile(profile) : null
    },
    async getById(id, accessContext) {
      const profile = state.byId.get(id)
      if (!profile) {
        return null
      }

      if (
        accessScopeKey(accessContext, deriveSessionAccessHash) !== profileAccessScopeKey(profile)
      ) {
        return null
      }

      return cloneProfile(profile)
    },
    async saveNewVersion(profile, accessContext) {
      validateFertilizerSavedProductProfileRecord(profile)

      const accessScope = profileAccessScopeKey(profile)
      const versionKey = versionLookupKey(
        {
          productFamilyKey: profile.productFamilyKey,
          compositionFingerprintVersion: profile.compositionFingerprintVersion,
          compositionFingerprint: profile.compositionFingerprint,
        },
        accessScope,
      )
      const idempotencyKey = idempotencyLookupKey(profile.saveIdempotencyKey, accessScope)

      const existingVersionId = state.byVersionKey.get(versionKey)
      if (existingVersionId) {
        const existing = state.byId.get(existingVersionId)
        if (existing) {
          return cloneProfile(existing)
        }
      }

      const existingIdempotencyId = state.byIdempotencyKey.get(idempotencyKey)
      if (existingIdempotencyId) {
        const existing = state.byId.get(existingIdempotencyId)
        if (existing) {
          return cloneProfile(existing)
        }
      }

      if (state.byId.has(profile.id) || state.byVersionKey.has(versionKey)) {
        const reloaded =
          (await this.findBySaveIdempotencyKey(profile.saveIdempotencyKey, accessContext)) ??
          (await this.findByIdentityAndCompositionFingerprint(
            {
              productFamilyKey: profile.productFamilyKey,
              compositionFingerprintVersion: profile.compositionFingerprintVersion,
              compositionFingerprint: profile.compositionFingerprint,
            },
            accessContext,
          ))

        if (reloaded) {
          return reloaded
        }

        throw new FertilizerProductProfileRepositoryError(
          'version_unique_conflict',
          'Saved product profile version already exists.',
        )
      }

      const snapshot = cloneProfile(profile)
      state.byId.set(snapshot.id, snapshot)
      state.byVersionKey.set(versionKey, snapshot.id)
      state.byIdempotencyKey.set(idempotencyKey, snapshot.id)
      return cloneProfile(snapshot)
    },
  }
}

export function validateFertilizerSavedProductProfileRecord(
  profile: FertilizerSavedProductProfile,
): void {
  if (profile.profileStatus !== 'saved' || profile.source !== 'enrichment') {
    throw new FertilizerProductProfileRepositoryError(
      'invalid_stored_record',
      'Stored product profile is not an enrichment-saved version.',
    )
  }

  if (profile.accessKind === 'session') {
    if (!profile.sessionAccessHash || !isValidSessionAccessHash(profile.sessionAccessHash)) {
      throw new FertilizerProductProfileRepositoryError(
        'invalid_stored_record',
        'Stored session product profile has an invalid session access hash.',
      )
    }

    if (profile.userId != null) {
      throw new FertilizerProductProfileRepositoryError(
        'invalid_stored_record',
        'Stored session product profile must not contain user_id.',
      )
    }
  }

  if (profile.accessKind === 'authenticated_user' && !profile.userId) {
    throw new FertilizerProductProfileRepositoryError(
      'invalid_stored_record',
      'Stored authenticated product profile requires user_id.',
    )
  }
}
