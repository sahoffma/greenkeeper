import type { ProductProfile } from '../types/productProfile'
import {
  canLinkCandidateToProductProfile,
  canReadProductProfile,
  isGlobalVerifiedProductProfile,
  resolveAuthoritativeProductProfileId,
  type ProductProfileStoreState,
} from './productProfileCore'

export {
  canLinkCandidateToProductProfile,
  canReadProductProfile,
  isGlobalVerifiedProductProfile,
  resolveAuthoritativeProductProfileId,
}

export function resolveCatalogProductProfileId(input: {
  catalogProductId: string
  catalogProfileByProductId: Map<string, string>
  store: ProductProfileStoreState
}): string | null {
  const profileId = input.catalogProfileByProductId.get(input.catalogProductId)

  if (!profileId) {
    return null
  }

  const profile = findProductProfileById(input.store, profileId)

  if (!profile || !isGlobalVerifiedProductProfile(profile)) {
    return null
  }

  return profileId
}

export function findProductProfileById(
  store: ProductProfileStoreState,
  profileId: string,
): ProductProfile | null {
  for (const profile of store.verifiedByFingerprint.values()) {
    if (profile.id === profileId) {
      return profile
    }
  }

  for (const profile of store.draftsByUserFingerprint.values()) {
    if (profile.id === profileId) {
      return profile
    }
  }

  return null
}
