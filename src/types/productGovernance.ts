import type {
  ApplicationMethod,
  NutrientBasis,
  ProductForm,
  ProductImportInput,
} from './product'

/** Governance-Status eines veröffentlichten Produkts. */
export type ProductVerificationStatus =
  | 'draft'
  | 'pending_review'
  | 'verified'
  | 'incomplete'
  | 'disputed'
  | 'archived'
  | 'legacy_imported'

/** Status eines Produktvorschlags. */
export type ProductSubmissionStatus =
  | 'pending'
  | 'needs_information'
  | 'approved'
  | 'rejected'
  | 'duplicate'
  | 'withdrawn'

/** Status eines Änderungsvorschlags. */
export type ProductChangeRequestStatus =
  | 'pending'
  | 'needs_information'
  | 'approved'
  | 'rejected'
  | 'withdrawn'

/** Quellentyp für Produktinformationen. */
export type ProductSourceType =
  | 'manufacturer'
  | 'datasheet'
  | 'retailer'
  | 'user_submission'
  | 'ai_research'
  | 'internal'
  | 'other'

/** Art der Quellenmomentaufnahme. */
export type ProductSourceKind =
  | 'manufacturer_website'
  | 'manufacturer_pdf'
  | 'product_label'
  | 'user_photo'
  | 'retailer_page'
  | 'ai_research'
  | 'internal_note'
  | 'other'

/** Eingabekanal für den Governance-Workflow. */
export type ProductSubmissionChannel =
  | 'user_manual'
  | 'ai_import'
  | 'pdf_import'
  | 'photo_import'
  | 'manufacturer_import'
  | 'admin_seed'
  | 'legacy_backfill'
  | 'other'

/** App-Rollen für den Review-Workflow. */
export type AppUserRole = 'user' | 'reviewer' | 'admin'

/** Domain-Event-Namen (Vorbereitung Event-Engine). */
export type ProductDomainEventName =
  | 'product.submission_created'
  | 'product.submission_approved'
  | 'product.submission_rejected'
  | 'product.change_requested'
  | 'product.change_approved'
  | 'product.change_rejected'
  | 'product.published'
  | 'product.updated'
  | 'product.archived'
  | 'product.legacy_marked'
  | 'product.source_snapshot_created'

/** Audit-Log-Ereignistypen. */
export type ProductReviewEventType =
  | 'submission_created'
  | 'submission_updated'
  | 'submission_withdrawn'
  | 'submission_needs_information'
  | 'submission_approved'
  | 'submission_rejected'
  | 'submission_marked_duplicate'
  | 'change_request_created'
  | 'change_request_updated'
  | 'change_request_withdrawn'
  | 'change_request_needs_information'
  | 'change_request_approved'
  | 'change_request_rejected'
  | 'product_version_created'
  | 'product_published'
  | 'product_archived'
  | 'confidence_recalculated'
  | 'duplicate_detected'
  | 'rate_limit_triggered'
  | 'spam_flagged'

/** Feldweise Vertrauenswerte (0–100, intern – nicht für Endnutzer). */
export interface FieldConfidence {
  manufacturer: number
  officialName: number
  aliases: number
  npk: number
  nPercent: number
  p2o5Percent: number
  k2oPercent: number
  mgoPercent: number
  so3Percent: number
  iron: number
  manganese: number
  dosage: number
  longevity: number
  density: number
  nutrientBasis: number
  liquidApplication: number
  description: number
  sources: number
}

export type FieldConfidenceKey = keyof FieldConfidence

/** Getrennte Vertrauensbewertung (intern). */
export interface ProductConfidenceScores {
  aiConfidenceScore: number | null
  reviewConfidenceScore: number | null
  aiFieldConfidence: Partial<FieldConfidence>
  reviewFieldConfidence: Partial<FieldConfidence>
}

/** Einzelne Quellenangabe. */
export interface ProductSource {
  sourceType: ProductSourceType
  sourceName: string
  sourceUrl: string | null
  retrievedAt: string
  evidence: string | null
  sourceKind?: ProductSourceKind
  snapshotId?: string
  fields?: string[]
}

/** Eingabe für unveränderlichen Quellen-Snapshot. */
export interface CreateSourceSnapshotInput {
  sourceType: ProductSourceType
  sourceKind: ProductSourceKind
  sourceName: string
  sourceUrl?: string | null
  storageBucket?: string | null
  storagePath?: string | null
  contentHash: string
  mimeType?: string | null
  fileSizeBytes?: number | null
  extractedText?: string | null
  aiExtraction?: Record<string, unknown>
  metadata?: Record<string, unknown>
  capturedAt: string
  createdBy?: string | null
  submissionId?: string | null
  changeRequestId?: string | null
  productId?: string | null
}

export interface ProductSourceSnapshot {
  id: string
  sourceType: ProductSourceType
  sourceKind: ProductSourceKind
  sourceName: string
  sourceUrl: string | null
  storageBucket: string | null
  storagePath: string | null
  contentHash: string
  mimeType: string | null
  fileSizeBytes: number | null
  extractedText: string | null
  aiExtraction: Record<string, unknown>
  metadata: Record<string, unknown>
  capturedAt: string
  createdBy: string | null
  submissionId: string | null
  changeRequestId: string | null
  productId: string | null
  createdAt: string
}

/** Strukturierte Feldänderung zwischen Versionen. */
export interface ProductFieldChange {
  field: string
  previousValue: unknown
  newValue: unknown
}

/** Nutzer-sichtbare Vertrauensinformation (ohne Prozentwerte). */
export interface ProductUserTrustDisplay {
  verificationLabel: string
  lastReviewedLabel: string | null
  hasSourceEvidence: boolean
  changeUnderReview: boolean
  isLegacyImported: boolean
}

export type ProductSubmissionPayload = ProductImportInput
export type ProductChangePatch = Partial<ProductImportInput>

export interface ProductGovernanceMeta extends ProductConfidenceScores {
  verificationStatus: ProductVerificationStatus
  verifiedAt: string | null
  verifiedBy: string | null
  lastReviewedAt: string | null
  currentVersion: number
  sources: ProductSource[]
  primarySourceType: ProductSourceType | null
  primarySourceUrl: string | null
  hasOpenChangeRequest: boolean
  legacyImportedAt: string | null
  legacyImportNote: string | null
}

export interface GovernanceSubmissionContext {
  submissionChannel?: ProductSubmissionChannel
  sourceSnapshots?: CreateSourceSnapshotInput[]
  aiFieldConfidence?: Partial<FieldConfidence>
  reviewFieldConfidence?: Partial<FieldConfidence>
}

export interface CreateSubmissionInput extends GovernanceSubmissionContext {
  submittedBy: string
  payload: ProductSubmissionPayload
  sources?: ProductSource[]
}

export interface CreateChangeRequestInput extends GovernanceSubmissionContext {
  productId: string
  submittedBy: string
  proposedChanges: ProductChangePatch
  changeSummary: string
  sources?: ProductSource[]
}

export interface ReviewDecisionInput {
  reviewerId: string
  reviewNotes?: string | null
  reviewFieldConfidence?: Partial<FieldConfidence>
}

export interface ApproveSubmissionInput extends ReviewDecisionInput {
  payloadOverride?: Partial<ProductSubmissionPayload>
}

export interface ApproveChangeRequestInput extends ReviewDecisionInput {
  proposedChangesOverride?: ProductChangePatch
}

/** Einheitlicher Import über den Governance-Service. */
export interface GovernanceImportInput extends GovernanceSubmissionContext {
  payload: ProductSubmissionPayload
  actorId: string
  sources?: ProductSource[]
  /** Nur Admin/Reviewer: sofortige Freigabe nach Validierung. */
  autoApprove?: boolean
  reviewNotes?: string | null
}

export interface GovernanceImportResult {
  submission: ProductSubmission
  product?: Product
  version?: ProductVersion
  approved: boolean
}

export interface ReviewQueueItem {
  queueKind: 'submission' | 'change_request'
  itemId: string
  submittedBy: string
  status: string
  reviewPriority: number
  corroborationCount: number
  submissionChannel: ProductSubmissionChannel
  manufacturer: string | null
  officialName: string | null
  productId: string | null
  createdAt: string
}

export interface ProductSubmission extends ProductConfidenceScores {
  id: string
  submittedBy: string
  status: ProductSubmissionStatus
  payload: ProductSubmissionPayload
  sources: ProductSource[]
  submissionChannel: ProductSubmissionChannel
  reviewPriority: number
  corroborationCount: number
  sourceSnapshotIds: string[]
  duplicateOfProductId: string | null
  duplicateOfSubmissionId: string | null
  reviewNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  resultingProductId: string | null
  withdrawnAt: string | null
  createdAt: string
  updatedAt: string
  /** @deprecated Nutze reviewConfidenceScore */
  confidenceScore: number | null
  /** @deprecated Nutze reviewFieldConfidence */
  fieldConfidence: Partial<FieldConfidence>
}

export interface ProductChangeRequest extends ProductConfidenceScores {
  id: string
  productId: string
  submittedBy: string
  status: ProductChangeRequestStatus
  proposedChanges: ProductChangePatch
  changeSummary: string
  sources: ProductSource[]
  submissionChannel: ProductSubmissionChannel
  reviewPriority: number
  corroborationCount: number
  sourceSnapshotIds: string[]
  duplicateOfRequestId: string | null
  reviewNotes: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  withdrawnAt: string | null
  createdAt: string
  updatedAt: string
  confidenceScore: number | null
  fieldConfidence: Partial<FieldConfidence>
}

export interface ProductVersion extends ProductConfidenceScores {
  id: string
  productId: string
  versionNumber: number
  snapshot: Record<string, unknown>
  changeSummary: string
  fieldChanges: ProductFieldChange[]
  sources: ProductSource[]
  sourceSnapshotIds: string[]
  approvedBy: string | null
  createdBy: string | null
  submissionId: string | null
  changeRequestId: string | null
  createdAt: string
  confidenceScore: number | null
  fieldConfidence: Partial<FieldConfidence>
}

export interface ProductReviewEvent {
  id: string
  eventType: ProductReviewEventType
  entityType: 'submission' | 'change_request' | 'product' | 'version' | 'user'
  entityId: string
  productId: string | null
  actorId: string | null
  payload: Record<string, unknown>
  notes: string | null
  createdAt: string
}

export interface ProductDomainEvent {
  id: string
  eventName: ProductDomainEventName
  aggregateType: 'product' | 'submission' | 'change_request' | 'version' | 'source_snapshot'
  aggregateId: string
  productId: string | null
  actorId: string | null
  payload: Record<string, unknown>
  occurredAt: string
  dispatchedAt: string | null
  createdAt: string
}

export interface RateLimitCheckResult {
  allowed: boolean
  reason: string | null
  submissionsInWindow: number
  changeRequestsInWindow: number
}

export interface SpamCheckResult {
  flagged: boolean
  score: number
  reasons: string[]
}

export interface AbuseProtectionConfig {
  maxSubmissionsPerHour: number
  maxChangeRequestsPerHour: number
  minReputationScore: number
  duplicateNameThreshold: number
}

export const DEFAULT_ABUSE_CONFIG: AbuseProtectionConfig = {
  maxSubmissionsPerHour: 5,
  maxChangeRequestsPerHour: 10,
  minReputationScore: 20,
  duplicateNameThreshold: 0.85,
}

export const FIELD_CONFIDENCE_KEYS: FieldConfidenceKey[] = [
  'manufacturer',
  'officialName',
  'aliases',
  'npk',
  'nPercent',
  'p2o5Percent',
  'k2oPercent',
  'mgoPercent',
  'so3Percent',
  'iron',
  'manganese',
  'dosage',
  'longevity',
  'density',
  'nutrientBasis',
  'liquidApplication',
  'description',
  'sources',
]

export const PAYLOAD_FIELD_TO_CONFIDENCE: Record<string, FieldConfidenceKey> = {
  manufacturer: 'manufacturer',
  officialName: 'officialName',
  aliases: 'aliases',
  npk: 'npk',
  nPercent: 'nPercent',
  p2o5Percent: 'p2o5Percent',
  k2oPercent: 'k2oPercent',
  mgoPercent: 'mgoPercent',
  so3Percent: 'so3Percent',
  fePercent: 'iron',
  mnPercent: 'manganese',
  recommendedRateMin: 'dosage',
  recommendedRateMax: 'dosage',
  recommendedRateUnit: 'dosage',
  liquidRateMin: 'dosage',
  liquidRateMax: 'dosage',
  dilutionMin: 'dosage',
  dilutionMax: 'dosage',
  waterRateMin: 'dosage',
  waterRateMax: 'dosage',
  longevityWeeksMin: 'longevity',
  longevityWeeksMax: 'longevity',
  densityKgPerL: 'density',
  nutrientBasis: 'nutrientBasis',
  applicationMethod: 'liquidApplication',
  description: 'description',
}

/** Prioritäts-Basiswerte nach Quellentyp (höher = wichtiger). */
export const SOURCE_TYPE_PRIORITY: Record<ProductSourceType, number> = {
  manufacturer: 90,
  datasheet: 75,
  internal: 70,
  retailer: 55,
  ai_research: 45,
  user_submission: 35,
  other: 30,
}

export type { ProductForm, NutrientBasis, ApplicationMethod }

// Forward refs for import result – avoid circular import at runtime
import type { Product } from './product'

export type { Product }
