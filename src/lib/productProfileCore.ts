import type { ProductRecognizeRecognition } from '../types/productRecognize'
import type {
  ProductProfile,
  ProductProfileDraftInput,
  ProductProfileForm,
  ProductProfileSource,
} from '../types/productProfile'
import { buildRecognitionIdentityFingerprint } from './fertilizerInventoryCore'
import { createRandomId } from './randomId'

export const PRODUCT_PROFILE_SOURCE: ProductProfileSource = 'packaging_photo'
export const PRODUCT_PROFILE_STATUS_DRAFT = 'draft' as const
export const PRODUCT_PROFILE_STATUS_VERIFIED = 'verified' as const
export const PRODUCT_PROFILE_VERIFICATION_UNVERIFIED = 'unverified' as const
export const PRODUCT_PROFILE_VERIFICATION_VERIFIED = 'verified' as const

export interface ProductProfileStoreState {
  verifiedByFingerprint: Map<string, ProductProfile>
  draftsByUserFingerprint: Map<string, ProductProfile>
}

export function draftStoreKey(userId: string, identityFingerprint: string): string {
  return `${userId}|${identityFingerprint}`
}

function normalizedText(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveNpkDeclaration(recognition: ProductRecognizeRecognition): string | null {
  const { npk } = recognition

  if (normalizedText(npk.rawLabel)) {
    return npk.rawLabel!.trim()
  }

  if (npk.nitrogen != null && npk.phosphate != null && npk.potash != null) {
    return `${npk.nitrogen}-${npk.phosphate}-${npk.potash}`
  }

  return null
}

function resolveOfficialName(recognition: ProductRecognizeRecognition): string | null {
  return (
    normalizedText(recognition.productName.normalizedValue) ??
    normalizedText(recognition.variant.normalizedValue)
  )
}

function resolveProductForm(recognition: ProductRecognizeRecognition): ProductProfileForm | null {
  const form = recognition.form.normalizedValue

  if (form === 'granular' || form === 'liquid') {
    return form
  }

  return null
}

export function buildProductProfileDraftFromRecognition(
  recognition: ProductRecognizeRecognition,
  userId: string,
): ProductProfileDraftInput | null {
  const brand = normalizedText(recognition.brand.normalizedValue)
  const productLine = normalizedText(recognition.productLine.normalizedValue)
  const officialName = resolveOfficialName(recognition)
  const variant = normalizedText(recognition.variant.normalizedValue)
  const npkDeclaration = resolveNpkDeclaration(recognition)

  const identityFingerprint = buildRecognitionIdentityFingerprint({
    brand,
    productLine,
    productName: officialName,
    variant,
    npk: npkDeclaration,
  })

  if (!identityFingerprint) {
    return null
  }

  const { nitrogen, phosphate, potash } = recognition.npk

  return {
    userId,
    identityFingerprint,
    brand,
    manufacturer: normalizedText(recognition.manufacturer.normalizedValue),
    productLine,
    officialName,
    variant,
    productForm: resolveProductForm(recognition),
    nitrogen: nitrogen ?? null,
    phosphate: phosphate ?? null,
    potash: potash ?? null,
    npkDeclaration,
    source: PRODUCT_PROFILE_SOURCE,
    profileStatus: PRODUCT_PROFILE_STATUS_DRAFT,
    verificationStatus: PRODUCT_PROFILE_VERIFICATION_UNVERIFIED,
  }
}

export function createProductProfileFromDraft(
  input: ProductProfileDraftInput,
  timestamps: { createdAt: string; updatedAt: string },
  id: string = createRandomId(),
): ProductProfile {
  return {
    id,
    userId: input.userId,
    identityFingerprint: input.identityFingerprint,
    brand: input.brand,
    manufacturer: input.manufacturer,
    productLine: input.productLine,
    officialName: input.officialName,
    variant: input.variant,
    productForm: input.productForm,
    nitrogen: input.nitrogen,
    phosphate: input.phosphate,
    potash: input.potash,
    npkDeclaration: input.npkDeclaration,
    source: input.source,
    profileStatus: input.profileStatus,
    verificationStatus: input.verificationStatus,
    createdAt: timestamps.createdAt,
    updatedAt: timestamps.updatedAt,
  }
}

export function createEmptyProductProfileStore(): ProductProfileStoreState {
  return {
    verifiedByFingerprint: new Map(),
    draftsByUserFingerprint: new Map(),
  }
}

export function registerVerifiedProductProfile(
  store: ProductProfileStoreState,
  profile: ProductProfile,
): ProductProfile {
  if (profile.profileStatus !== PRODUCT_PROFILE_STATUS_VERIFIED) {
    throw new Error('Nur verifizierte Profile dürfen global registriert werden.')
  }

  store.verifiedByFingerprint.set(profile.identityFingerprint, profile)
  return profile
}

/** Spiegelt ensure_product_profile_from_snapshot — idempotent, ohne Feld-Updates. */
export function ensureProductProfileFromSnapshot(input: {
  store: ProductProfileStoreState
  draftInput: ProductProfileDraftInput
  now?: string
}): ProductProfile {
  const now = input.now ?? new Date().toISOString()
  const { draftInput, store } = input

  const verified = store.verifiedByFingerprint.get(draftInput.identityFingerprint)
  if (verified) {
    return verified
  }

  const draftKey = draftStoreKey(draftInput.userId, draftInput.identityFingerprint)
  const existingDraft = store.draftsByUserFingerprint.get(draftKey)
  if (existingDraft) {
    return existingDraft
  }

  const profile = createProductProfileFromDraft(draftInput, {
    createdAt: now,
    updatedAt: now,
  })

  store.draftsByUserFingerprint.set(draftKey, profile)
  return profile
}

export function isGlobalVerifiedProductProfile(profile: ProductProfile): boolean {
  return (
    profile.profileStatus === PRODUCT_PROFILE_STATUS_VERIFIED &&
    profile.verificationStatus === PRODUCT_PROFILE_VERIFICATION_VERIFIED &&
    profile.userId === null
  )
}

export function canAssignCatalogProductProfile(profile: ProductProfile | null): boolean {
  if (profile === null) {
    return true
  }

  return isGlobalVerifiedProductProfile(profile)
}

export interface CatalogProductLinkState {
  productProfileId: string | null
  softDeletedAt: string | null
}

/** Spiegelt validate_products_product_profile_link — wann die DB prüft. */
export function requiresCatalogProductProfileValidation(input: {
  operation: 'insert' | 'update'
  next: CatalogProductLinkState
  previous?: CatalogProductLinkState
}): boolean {
  if (input.next.productProfileId === null) {
    return false
  }

  if (input.next.softDeletedAt !== null) {
    return false
  }

  if (input.operation === 'insert') {
    return true
  }

  if (!input.previous) {
    return true
  }

  const isReactivation =
    input.previous.softDeletedAt !== null && input.next.softDeletedAt === null

  const profileIdChanged =
    input.next.productProfileId !== input.previous.productProfileId

  return isReactivation || profileIdChanged
}

/** Spiegelt ON DELETE RESTRICT auf products.product_profile_id. */
export function isProductProfileBlockedByCatalogReference(input: {
  profileId: string
  catalogProductsByProfileId: Map<string, readonly string[]>
}): boolean {
  return (input.catalogProductsByProfileId.get(input.profileId)?.length ?? 0) > 0
}

export function wouldBreakCatalogProductProfileLink(
  _previous: ProductProfile,
  next: ProductProfile,
  isReferencedByActiveCatalogProduct: boolean,
): boolean {
  if (!isReferencedByActiveCatalogProduct) {
    return false
  }

  return !isGlobalVerifiedProductProfile(next)
}

export function canReadProductProfile(viewerUserId: string, profile: ProductProfile): boolean {
  if (profile.profileStatus === PRODUCT_PROFILE_STATUS_VERIFIED) {
    return true
  }

  return profile.userId === viewerUserId
}

export function canLinkCandidateToProductProfile(
  userId: string,
  profile: ProductProfile,
): boolean {
  if (profile.profileStatus === PRODUCT_PROFILE_STATUS_VERIFIED) {
    return true
  }

  return profile.profileStatus === PRODUCT_PROFILE_STATUS_DRAFT && profile.userId === userId
}

export function resolveAuthoritativeProductProfileId(input: {
  catalogLinkedProfileId: string | null
  store: ProductProfileStoreState
  userId: string
  identityFingerprint: string | null
}): string | null {
  if (input.catalogLinkedProfileId) {
    return input.catalogLinkedProfileId
  }

  if (!input.identityFingerprint) {
    return null
  }

  const verified = input.store.verifiedByFingerprint.get(input.identityFingerprint)
  if (verified) {
    return verified.id
  }

  const draft = input.store.draftsByUserFingerprint.get(
    draftStoreKey(input.userId, input.identityFingerprint),
  )

  return draft?.id ?? null
}
