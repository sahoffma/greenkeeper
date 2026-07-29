import { describe, expect, it } from 'vitest'
import type { ProductProfile } from '../types/productProfile'
import {
  canAssignCatalogProductProfile,
  isGlobalVerifiedProductProfile,
  isProductProfileBlockedByCatalogReference,
  PRODUCT_PROFILE_STATUS_DRAFT,
  PRODUCT_PROFILE_STATUS_VERIFIED,
  PRODUCT_PROFILE_VERIFICATION_UNVERIFIED,
  PRODUCT_PROFILE_VERIFICATION_VERIFIED,
  registerVerifiedProductProfile,
  requiresCatalogProductProfileValidation,
  type ProductProfileStoreState,
  wouldBreakCatalogProductProfileLink,
} from './productProfileCore'
import {
  findProductProfileById,
  resolveCatalogProductProfileId,
} from './productProfileResolver'

function verifiedProfile(overrides?: Partial<ProductProfile>): ProductProfile {
  return {
    id: 'verified-profile-1',
    userId: null,
    identityFingerprint: 'brand|line|name|npk',
    brand: 'Brand',
    manufacturer: null,
    productLine: 'Line',
    officialName: 'Name',
    variant: null,
    productForm: 'granular',
    nitrogen: 14,
    phosphate: 28,
    potash: 10,
    npkDeclaration: '14-28-10',
    source: 'packaging_photo',
    profileStatus: PRODUCT_PROFILE_STATUS_VERIFIED,
    verificationStatus: PRODUCT_PROFILE_VERIFICATION_VERIFIED,
    createdAt: '2026-07-28T12:00:00.000Z',
    updatedAt: '2026-07-28T12:00:00.000Z',
    ...overrides,
  }
}

function draftProfile(userId: string, overrides?: Partial<ProductProfile>): ProductProfile {
  return {
    ...verifiedProfile(),
    id: 'draft-profile-1',
    userId,
    profileStatus: PRODUCT_PROFILE_STATUS_DRAFT,
    verificationStatus: PRODUCT_PROFILE_VERIFICATION_UNVERIFIED,
    ...overrides,
  }
}

describe('productProfileCatalogLink', () => {
  it('1 — allows active catalog product linked to verified global profile', () => {
    const profile = verifiedProfile()

    expect(
      requiresCatalogProductProfileValidation({
        operation: 'insert',
        next: { productProfileId: profile.id, softDeletedAt: null },
      }),
    ).toBe(true)
    expect(canAssignCatalogProductProfile(profile)).toBe(true)
  })

  it('2 — allows soft-deleted catalog product with invalid profile link at rest', () => {
    const invalidProfile = draftProfile('user-a')

    expect(
      requiresCatalogProductProfileValidation({
        operation: 'update',
        next: {
          productProfileId: invalidProfile.id,
          softDeletedAt: '2026-07-28T12:00:00.000Z',
        },
        previous: {
          productProfileId: invalidProfile.id,
          softDeletedAt: '2026-07-28T12:00:00.000Z',
        },
      }),
    ).toBe(false)

    expect(
      wouldBreakCatalogProductProfileLink(
        verifiedProfile(),
        {
          ...verifiedProfile(),
          profileStatus: PRODUCT_PROFILE_STATUS_DRAFT,
          verificationStatus: PRODUCT_PROFILE_VERIFICATION_UNVERIFIED,
          userId: 'user-a',
        },
        false,
      ),
    ).toBe(false)
  })

  it('3 — rejects reactivation when linked profile is no longer verified global', () => {
    const invalidProfile = draftProfile('user-a')

    expect(
      requiresCatalogProductProfileValidation({
        operation: 'update',
        next: { productProfileId: invalidProfile.id, softDeletedAt: null },
        previous: {
          productProfileId: invalidProfile.id,
          softDeletedAt: '2026-07-28T12:00:00.000Z',
        },
      }),
    ).toBe(true)
    expect(canAssignCatalogProductProfile(invalidProfile)).toBe(false)
  })

  it('4 — allows reactivation when linked profile remains verified global', () => {
    const profile = verifiedProfile()

    expect(
      requiresCatalogProductProfileValidation({
        operation: 'update',
        next: { productProfileId: profile.id, softDeletedAt: null },
        previous: {
          productProfileId: profile.id,
          softDeletedAt: '2026-07-28T12:00:00.000Z',
        },
      }),
    ).toBe(true)
    expect(canAssignCatalogProductProfile(profile)).toBe(true)
  })

  it('5 — skips validation for unrelated updates on active catalog products', () => {
    expect(
      requiresCatalogProductProfileValidation({
        operation: 'update',
        next: { productProfileId: 'verified-profile-1', softDeletedAt: null },
        previous: { productProfileId: 'verified-profile-1', softDeletedAt: null },
      }),
    ).toBe(false)
  })

  it('6 — allows deleting unreferenced product profiles', () => {
    expect(
      isProductProfileBlockedByCatalogReference({
        profileId: 'verified-profile-1',
        catalogProductsByProfileId: new Map(),
      }),
    ).toBe(false)
  })

  it('7 — blocks deleting product profiles referenced by catalog products', () => {
    expect(
      isProductProfileBlockedByCatalogReference({
        profileId: 'verified-profile-1',
        catalogProductsByProfileId: new Map([['verified-profile-1', ['catalog-1']]]),
      }),
    ).toBe(true)
  })

  it('8 — allows deletion after explicit catalog unlink', () => {
    expect(
      isProductProfileBlockedByCatalogReference({
        profileId: 'verified-profile-1',
        catalogProductsByProfileId: new Map(),
      }),
    ).toBe(false)

    expect(
      requiresCatalogProductProfileValidation({
        operation: 'update',
        next: { productProfileId: null, softDeletedAt: null },
        previous: {
          productProfileId: 'verified-profile-1',
          softDeletedAt: null,
        },
      }),
    ).toBe(false)
  })

  it('9 — resolver returns only verified global profiles', () => {
    const store: ProductProfileStoreState = {
      verifiedByFingerprint: new Map(),
      draftsByUserFingerprint: new Map(),
    }

    const verified = verifiedProfile({ id: 'verified-catalog-profile' })
    registerVerifiedProductProfile(store, verified)

    const draft = draftProfile('user-a', { id: 'draft-catalog-profile' })
    store.draftsByUserFingerprint.set('user-a|brand|line|name|npk', draft)

    expect(
      resolveCatalogProductProfileId({
        catalogProductId: 'catalog-verified',
        catalogProfileByProductId: new Map([['catalog-verified', verified.id]]),
        store,
      }),
    ).toBe('verified-catalog-profile')

    expect(
      resolveCatalogProductProfileId({
        catalogProductId: 'catalog-draft',
        catalogProfileByProductId: new Map([['catalog-draft', draft.id]]),
        store,
      }),
    ).toBeNull()

    expect(isGlobalVerifiedProductProfile(verified)).toBe(true)
    expect(isGlobalVerifiedProductProfile(draft)).toBe(false)
    expect(findProductProfileById(store, verified.id)?.id).toBe(verified.id)
  })

  it('allows catalog product without profile link', () => {
    expect(canAssignCatalogProductProfile(null)).toBe(true)
    expect(
      requiresCatalogProductProfileValidation({
        operation: 'insert',
        next: { productProfileId: null, softDeletedAt: null },
      }),
    ).toBe(false)
  })

  it('rejects active catalog product linked to personal draft', () => {
    expect(canAssignCatalogProductProfile(draftProfile('user-a'))).toBe(false)
  })

  it('rejects downgrade while referenced by active catalog product', () => {
    const previous = verifiedProfile()

    expect(
      wouldBreakCatalogProductProfileLink(
        previous,
        {
          ...previous,
          verificationStatus: PRODUCT_PROFILE_VERIFICATION_UNVERIFIED,
        },
        true,
      ),
    ).toBe(true)
  })
})
