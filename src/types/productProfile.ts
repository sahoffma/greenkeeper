export type ProductProfileSource = 'packaging_photo'

export type ProductProfileStatus = 'draft' | 'verified'

export type ProductProfileVerificationStatus = 'unverified' | 'verified'

export type ProductProfileForm = 'granular' | 'liquid'

/** Fachliches Produktwissen — getrennt vom persönlichen Recognition Candidate. */
export interface ProductProfile {
  id: string
  userId: string | null
  identityFingerprint: string
  brand: string | null
  manufacturer: string | null
  productLine: string | null
  officialName: string | null
  variant: string | null
  productForm: ProductProfileForm | null
  nitrogen: number | null
  phosphate: number | null
  potash: number | null
  npkDeclaration: string | null
  source: ProductProfileSource
  profileStatus: ProductProfileStatus
  verificationStatus: ProductProfileVerificationStatus
  createdAt: string
  updatedAt: string
}

export interface ProductProfileDraftInput {
  userId: string
  identityFingerprint: string
  brand: string | null
  manufacturer: string | null
  productLine: string | null
  officialName: string | null
  variant: string | null
  productForm: ProductProfileForm | null
  nitrogen: number | null
  phosphate: number | null
  potash: number | null
  npkDeclaration: string | null
  source: ProductProfileSource
  profileStatus: 'draft'
  verificationStatus: 'unverified'
}
