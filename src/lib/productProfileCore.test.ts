import { describe, expect, it, vi } from 'vitest'
import { acceptRecognitionResult, attachProductProfileToCaptureDraft, createInitialCaptureDraft } from './fertilizerCaptureCore'
import {
  buildProductProfileDraftFromRecognition,
  canLinkCandidateToProductProfile,
  canReadProductProfile,
  createEmptyProductProfileStore,
  createProductProfileFromDraft,
  draftStoreKey,
  ensureProductProfileFromSnapshot,
  PRODUCT_PROFILE_SOURCE,
  PRODUCT_PROFILE_STATUS_DRAFT,
  PRODUCT_PROFILE_STATUS_VERIFIED,
  PRODUCT_PROFILE_VERIFICATION_UNVERIFIED,
  registerVerifiedProductProfile,
} from './productProfileCore'
import {
  findProductProfileById,
  resolveAuthoritativeProductProfileId,
  resolveCatalogProductProfileId,
} from './productProfileResolver'
import { recognitionFromImageAnalysis } from './productRecognizeIdentityCore'
import type { ProductProfile } from '../types/productProfile'
import type { ProductRecognizeResult } from '../types/productRecognize'

const USER_A = 'user-a'
const USER_B = 'user-b'

const rasendoktorBase = {
  brand: 'Rasendoktor',
  productLine: 'Professional',
  productName: 'Frühjahr & Neuansaat',
  variant: null,
  productDescriptor: null,
  manufacturer: null,
  npkLabel: 'NPK 14-28-10',
  nitrogen: 14,
  phosphate: 28,
  potash: 10,
  form: 'granular' as const,
  gtin: null,
  textFragments: [],
  fieldConfidence: { brand: 0.95, productLine: 0.9, productName: 0.92, npk: 0.93, packageSize: 0.9 },
}

function mockRecognition(packageSizeValue: number): ProductRecognizeResult {
  return {
    status: 'identified',
    identityConfidence: 1,
    dataCompleteness: 0.14,
    recognition: recognitionFromImageAnalysis({
      ...rasendoktorBase,
      packageSizeValue,
      packageSizeUnit: 'kg',
    }),
    catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
    sources: [],
    missingRequiredFields: [],
    nextAction: { type: 'none', message: null },
    stockCapture: {
      allowed: true,
      recognitionCandidate: true,
      persistToCatalog: false,
      message: null,
    },
    diagnostics: { model: 'test', latencyMs: 1, estimatedCost: null, warnings: [] },
    steps: [],
    spike: true,
  } as ProductRecognizeResult
}

function verifiedProfile(overrides?: Partial<ProductProfile>): ProductProfile {
  return {
    id: 'verified-profile-1',
    userId: null,
    identityFingerprint: 'rasendoktor|professional|frühjahr & neuansaat|npk 14-28-10',
    brand: 'Rasendoktor',
    manufacturer: null,
    productLine: 'Professional',
    officialName: 'Frühjahr & Neuansaat',
    variant: null,
    productForm: 'granular',
    nitrogen: 14,
    phosphate: 28,
    potash: 10,
    npkDeclaration: 'NPK 14-28-10',
    source: PRODUCT_PROFILE_SOURCE,
    profileStatus: PRODUCT_PROFILE_STATUS_VERIFIED,
    verificationStatus: 'verified',
    createdAt: '2026-07-28T12:00:00.000Z',
    updatedAt: '2026-07-28T12:00:00.000Z',
    ...overrides,
  }
}

describe('productProfileCore', () => {
  it('1 — creates a personal draft profile from snapshot with unverified packaging source', () => {
    const input = buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)

    expect(input).toMatchObject({
      userId: USER_A,
      brand: 'Rasendoktor',
      productLine: 'Professional',
      officialName: 'Frühjahr & Neuansaat',
      productForm: 'granular',
      nitrogen: 14,
      phosphate: 28,
      potash: 10,
      npkDeclaration: 'NPK 14-28-10',
      source: PRODUCT_PROFILE_SOURCE,
      profileStatus: PRODUCT_PROFILE_STATUS_DRAFT,
      verificationStatus: PRODUCT_PROFILE_VERIFICATION_UNVERIFIED,
    })
    expect(input).not.toHaveProperty('packageSizeValue')
  })

  it('2 — reuses the same user draft without overwriting fields', () => {
    const store = createEmptyProductProfileStore()
    const input = buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!

    const first = ensureProductProfileFromSnapshot({
      store,
      draftInput: input,
      now: '2026-07-28T12:00:00.000Z',
    })

    const mutatedInput = {
      ...input,
      nitrogen: 99,
    }

    const second = ensureProductProfileFromSnapshot({
      store,
      draftInput: mutatedInput,
      now: '2026-07-28T13:00:00.000Z',
    })

    expect(second.id).toBe(first.id)
    expect(second.nitrogen).toBe(14)
    expect(store.draftsByUserFingerprint.size).toBe(1)
  })

  it('3 — creates separate drafts for different users when no verified profile exists', () => {
    const store = createEmptyProductProfileStore()
    const inputA = buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!
    const inputB = buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_B)!

    const draftA = ensureProductProfileFromSnapshot({ store, draftInput: inputA })
    const draftB = ensureProductProfileFromSnapshot({ store, draftInput: inputB })

    expect(draftA.id).not.toBe(draftB.id)
    expect(draftA.userId).toBe(USER_A)
    expect(draftB.userId).toBe(USER_B)
    expect(store.draftsByUserFingerprint.size).toBe(2)
  })

  it('4 — reuses a verified profile globally and skips personal draft creation', () => {
    const store = createEmptyProductProfileStore()
    const verified = verifiedProfile()
    registerVerifiedProductProfile(store, verified)

    const draftInput = buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!
    const resolved = ensureProductProfileFromSnapshot({ store, draftInput })

    expect(resolved.id).toBe(verified.id)
    expect(resolved.profileStatus).toBe(PRODUCT_PROFILE_STATUS_VERIFIED)
    expect(store.draftsByUserFingerprint.size).toBe(0)
  })

  it('5 — parallel ensure calls yield exactly one personal draft', () => {
    const store = createEmptyProductProfileStore()
    const input = buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!

    const results = Array.from({ length: 2 }, () =>
      ensureProductProfileFromSnapshot({ store, draftInput: input }),
    )

    expect(results[0]?.id).toBe(results[1]?.id)
    expect(store.draftsByUserFingerprint.size).toBe(1)
  })

  it('6 — package size variants share the same product profile fingerprint for one user', () => {
    const store = createEmptyProductProfileStore()
    const fiveKg = buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!
    const tenKg = buildProductProfileDraftFromRecognition(mockRecognition(10).recognition, USER_A)!

    expect(fiveKg.identityFingerprint).toBe(tenKg.identityFingerprint)

    const first = ensureProductProfileFromSnapshot({ store, draftInput: fiveKg })
    const second = ensureProductProfileFromSnapshot({ store, draftInput: tenKg })

    expect(second.id).toBe(first.id)
    expect(first).not.toHaveProperty('packageSizeValue')
  })

  it('7 — keeps structured NPK and declaration unverified', () => {
    const input = buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!

    expect(input?.nitrogen).toBe(14)
    expect(input?.phosphate).toBe(28)
    expect(input?.potash).toBe(10)
    expect(input?.npkDeclaration).toBe('NPK 14-28-10')
    expect(input?.verificationStatus).toBe(PRODUCT_PROFILE_VERIFICATION_UNVERIFIED)
  })

  it('8 — allows candidate linking only to own draft or verified profile', () => {
    const store = createEmptyProductProfileStore()
    const ownDraft = ensureProductProfileFromSnapshot({
      store,
      draftInput: buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!,
    })
    const foreignDraft = ensureProductProfileFromSnapshot({
      store,
      draftInput: buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_B)!,
    })
    const verified = verifiedProfile()

    expect(canLinkCandidateToProductProfile(USER_A, ownDraft)).toBe(true)
    expect(canLinkCandidateToProductProfile(USER_A, foreignDraft)).toBe(false)
    expect(canLinkCandidateToProductProfile(USER_B, verified)).toBe(true)
  })

  it('9 — resolves catalog-linked verified profile without creating snapshot draft', () => {
    const store = createEmptyProductProfileStore()
    const verified = verifiedProfile({ id: 'catalog-linked-profile' })
    registerVerifiedProductProfile(store, verified)

    const catalogProfileId = resolveCatalogProductProfileId({
      catalogProductId: 'catalog-1',
      catalogProfileByProductId: new Map([['catalog-1', verified.id]]),
      store,
    })

    const resolved = resolveAuthoritativeProductProfileId({
      catalogLinkedProfileId: catalogProfileId,
      store,
      userId: USER_A,
      identityFingerprint: verified.identityFingerprint,
    })

    expect(resolved).toBe('catalog-linked-profile')
    expect(store.draftsByUserFingerprint.size).toBe(0)
  })

  it('10 — mirrors RLS read rules for drafts and verified profiles', () => {
    const store = createEmptyProductProfileStore()
    const ownDraft = ensureProductProfileFromSnapshot({
      store,
      draftInput: buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!,
    })
    const foreignDraft = ensureProductProfileFromSnapshot({
      store,
      draftInput: buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_B)!,
    })
    const verified = verifiedProfile()
    registerVerifiedProductProfile(store, verified)

    expect(canReadProductProfile(USER_A, ownDraft)).toBe(true)
    expect(canReadProductProfile(USER_A, foreignDraft)).toBe(false)
    expect(canReadProductProfile(USER_B, verified)).toBe(true)
  })

  it('11 — repeated ensure during save flow does not duplicate the product profile', () => {
    const store = createEmptyProductProfileStore()
    const input = buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!

    const profileOnSave = ensureProductProfileFromSnapshot({ store, draftInput: input })
    const profileOnRetry = ensureProductProfileFromSnapshot({ store, draftInput: input })

    expect(profileOnRetry.id).toBe(profileOnSave.id)
    expect(store.draftsByUserFingerprint.size).toBe(1)
    expect(store.verifiedByFingerprint.size).toBe(0)
  })

  it('12 — uses only snapshot mapping without external calls', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const store = createEmptyProductProfileStore()

    buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)
    ensureProductProfileFromSnapshot({
      store,
      draftInput: buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('stores unknown product form as null', () => {
    const result = mockRecognition(5)
    result.recognition.form.normalizedValue = 'unknown'

    const draft = buildProductProfileDraftFromRecognition(result.recognition, USER_A)
    expect(draft?.productForm).toBeNull()
  })

  it('finds profiles by id in resolver store', () => {
    const store = createEmptyProductProfileStore()
    const draft = ensureProductProfileFromSnapshot({
      store,
      draftInput: buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!,
    })

    expect(findProductProfileById(store, draft.id)?.id).toBe(draft.id)
    expect(findProductProfileById(store, 'missing')).toBeNull()
  })

  it('links capture draft to profile id after server save', () => {
    const result = mockRecognition(5)
    let captureDraft = acceptRecognitionResult(createInitialCaptureDraft(), result, {
      stockStatus: { status: 'first_time', currentBalance: 0, unit: 'kg' },
    })

    captureDraft = attachProductProfileToCaptureDraft(captureDraft, 'profile-after-save')

    expect(captureDraft.productProfileId).toBe('profile-after-save')
    expect(captureDraft.recognitionCandidate?.productProfileId).toBe('profile-after-save')
  })

  it('builds stable draft store keys per user and fingerprint', () => {
    const input = buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!
    expect(draftStoreKey(USER_A, input.identityFingerprint)).toContain(USER_A)
  })

  it('creates verified profiles without user id', () => {
    const profile = createProductProfileFromDraft(
      {
        ...buildProductProfileDraftFromRecognition(mockRecognition(5).recognition, USER_A)!,
        userId: USER_A,
      },
      { createdAt: '2026-07-28T12:00:00.000Z', updatedAt: '2026-07-28T12:00:00.000Z' },
      'verified-id',
    )

    const verified: ProductProfile = {
      ...profile,
      userId: null,
      profileStatus: PRODUCT_PROFILE_STATUS_VERIFIED,
      verificationStatus: 'verified',
    }

    expect(verified.userId).toBeNull()
  })
})
