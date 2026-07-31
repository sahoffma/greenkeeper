import type { FertilizerSavedProductProfilePublic } from './fertilizerProductProfile'

export const FERTILIZER_PRODUCT_PROFILE_SAVE_API_ERROR_CODES = [
  'invalid_request',
  'unconfirmed_save',
  'job_not_found',
  'job_expired',
  'not_save_ready',
  'unsupported_object_category',
  'invalid_declaration',
  'incomplete_projection',
  'idempotency_conflict',
  'persistence_unavailable',
  'internal_server_error',
  'temporarily_unavailable',
] as const

export type FertilizerProductProfileSaveApiErrorCode =
  (typeof FERTILIZER_PRODUCT_PROFILE_SAVE_API_ERROR_CODES)[number]

export interface FertilizerProductProfileSaveApiError {
  code: FertilizerProductProfileSaveApiErrorCode
  message: string
}

export interface SaveFertilizerProductProfileRequest {
  enrichmentJobId: string
  userConfirmed: true
  idempotencyKey: string
}

export interface SaveFertilizerProductProfileResponse {
  profile: FertilizerSavedProductProfilePublic
  reusedExistingVersion: boolean
}
