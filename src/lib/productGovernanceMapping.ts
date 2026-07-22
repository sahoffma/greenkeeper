import type {
  FieldConfidence,
  ProductChangePatch,
  ProductChangeRequest,
  ProductChangeRequestStatus,
  ProductFieldChange,
  ProductReviewEvent,
  ProductReviewEventType,
  ProductSource,
  ProductSourceKind,
  ProductSourceSnapshot,
  ProductSourceType,
  ProductSubmission,
  ProductSubmissionChannel,
  ProductSubmissionPayload,
  ProductSubmissionStatus,
  ProductVersion,
} from '../types/productGovernance'
import type { Product } from '../types/product'
import { mapProductRow, type ProductRow } from './productMapping'

function parseNumeric(value: number | string | null | undefined): number | null {
  if (value == null || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function parseSubmissionStatus(value: string): ProductSubmissionStatus {
  const allowed: ProductSubmissionStatus[] = [
    'pending', 'needs_information', 'approved', 'rejected', 'duplicate', 'withdrawn',
  ]
  return allowed.includes(value as ProductSubmissionStatus) ? (value as ProductSubmissionStatus) : 'pending'
}

function parseChangeRequestStatus(value: string): ProductChangeRequestStatus {
  const allowed: ProductChangeRequestStatus[] = [
    'pending', 'needs_information', 'approved', 'rejected', 'withdrawn',
  ]
  return allowed.includes(value as ProductChangeRequestStatus) ? (value as ProductChangeRequestStatus) : 'pending'
}

function parseSubmissionChannel(value: string | null): ProductSubmissionChannel {
  const allowed: ProductSubmissionChannel[] = [
    'user_manual', 'ai_import', 'pdf_import', 'photo_import',
    'manufacturer_import', 'admin_seed', 'legacy_backfill', 'other',
  ]
  return value && allowed.includes(value as ProductSubmissionChannel)
    ? (value as ProductSubmissionChannel)
    : 'user_manual'
}

function parseSourceKind(value: string | null): ProductSourceKind {
  const allowed: ProductSourceKind[] = [
    'manufacturer_website', 'manufacturer_pdf', 'product_label', 'user_photo',
    'retailer_page', 'ai_research', 'internal_note', 'other',
  ]
  return value && allowed.includes(value as ProductSourceKind) ? (value as ProductSourceKind) : 'other'
}

function parseSourceType(value: string | null): ProductSourceType {
  const allowed: ProductSourceType[] = [
    'manufacturer', 'datasheet', 'retailer', 'user_submission', 'ai_research', 'internal', 'other',
  ]
  return value && allowed.includes(value as ProductSourceType) ? (value as ProductSourceType) : 'other'
}

function mapConfidenceFields(row: {
  ai_confidence_score?: number | string | null
  review_confidence_score?: number | string | null
  confidence_score?: number | string | null
  ai_field_confidence?: Partial<FieldConfidence> | null
  review_field_confidence?: Partial<FieldConfidence> | null
  field_confidence?: Partial<FieldConfidence> | null
}) {
  const aiFieldConfidence = row.ai_field_confidence ?? {}
  const reviewFieldConfidence = row.review_field_confidence ?? row.field_confidence ?? {}

  return {
    aiConfidenceScore: parseNumeric(row.ai_confidence_score),
    reviewConfidenceScore: parseNumeric(row.review_confidence_score ?? row.confidence_score),
    aiFieldConfidence,
    reviewFieldConfidence,
    confidenceScore: parseNumeric(row.review_confidence_score ?? row.confidence_score),
    fieldConfidence: reviewFieldConfidence,
  }
}

export interface ProductSubmissionRow {
  id: string
  submitted_by: string
  status: string
  payload: ProductSubmissionPayload
  field_confidence: Partial<FieldConfidence> | null
  ai_field_confidence: Partial<FieldConfidence> | null
  review_field_confidence: Partial<FieldConfidence> | null
  sources: ProductSource[] | null
  confidence_score: number | string | null
  ai_confidence_score: number | string | null
  review_confidence_score: number | string | null
  submission_channel: string | null
  review_priority: number | null
  corroboration_count: number | null
  source_snapshot_ids: string[] | null
  duplicate_of_product_id: string | null
  duplicate_of_submission_id: string | null
  review_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  resulting_product_id: string | null
  withdrawn_at: string | null
  created_at: string
  updated_at: string
}

export interface ProductChangeRequestRow {
  id: string
  product_id: string
  submitted_by: string
  status: string
  proposed_changes: ProductChangePatch
  change_summary: string
  field_confidence: Partial<FieldConfidence> | null
  ai_field_confidence: Partial<FieldConfidence> | null
  review_field_confidence: Partial<FieldConfidence> | null
  sources: ProductSource[] | null
  confidence_score: number | string | null
  ai_confidence_score: number | string | null
  review_confidence_score: number | string | null
  submission_channel: string | null
  review_priority: number | null
  corroboration_count: number | null
  source_snapshot_ids: string[] | null
  duplicate_of_request_id: string | null
  review_notes: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  withdrawn_at: string | null
  created_at: string
  updated_at: string
}

export interface ProductVersionRow {
  id: string
  product_id: string
  version_number: number
  snapshot: Record<string, unknown>
  change_summary: string
  field_changes: ProductFieldChange[] | null
  field_confidence: Partial<FieldConfidence> | null
  ai_field_confidence: Partial<FieldConfidence> | null
  review_field_confidence: Partial<FieldConfidence> | null
  sources: ProductSource[] | null
  source_snapshot_ids: string[] | null
  confidence_score: number | string | null
  ai_confidence_score: number | string | null
  review_confidence_score: number | string | null
  created_by: string | null
  approved_by: string | null
  submission_id: string | null
  change_request_id: string | null
  created_at: string
}

export interface ProductSourceSnapshotRow {
  id: string
  source_type: string
  source_kind: string
  source_name: string
  source_url: string | null
  storage_bucket: string | null
  storage_path: string | null
  content_hash: string
  mime_type: string | null
  file_size_bytes: number | string | null
  extracted_text: string | null
  ai_extraction: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  captured_at: string
  created_by: string | null
  submission_id: string | null
  change_request_id: string | null
  product_id: string | null
  created_at: string
}

export interface ProductReviewEventRow {
  id: string
  event_type: string
  entity_type: string
  entity_id: string
  product_id: string | null
  actor_id: string | null
  payload: Record<string, unknown> | null
  notes: string | null
  created_at: string
}

export function mapProductSubmissionRow(row: ProductSubmissionRow): ProductSubmission {
  return {
    id: row.id,
    submittedBy: row.submitted_by,
    status: parseSubmissionStatus(row.status),
    payload: row.payload,
    sources: row.sources ?? [],
    submissionChannel: parseSubmissionChannel(row.submission_channel),
    reviewPriority: row.review_priority ?? 50,
    corroborationCount: row.corroboration_count ?? 0,
    sourceSnapshotIds: row.source_snapshot_ids ?? [],
    duplicateOfProductId: row.duplicate_of_product_id,
    duplicateOfSubmissionId: row.duplicate_of_submission_id,
    reviewNotes: row.review_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    resultingProductId: row.resulting_product_id,
    withdrawnAt: row.withdrawn_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...mapConfidenceFields(row),
  }
}

export function mapProductChangeRequestRow(row: ProductChangeRequestRow): ProductChangeRequest {
  return {
    id: row.id,
    productId: row.product_id,
    submittedBy: row.submitted_by,
    status: parseChangeRequestStatus(row.status),
    proposedChanges: row.proposed_changes,
    changeSummary: row.change_summary,
    sources: row.sources ?? [],
    submissionChannel: parseSubmissionChannel(row.submission_channel),
    reviewPriority: row.review_priority ?? 50,
    corroborationCount: row.corroboration_count ?? 0,
    sourceSnapshotIds: row.source_snapshot_ids ?? [],
    duplicateOfRequestId: row.duplicate_of_request_id,
    reviewNotes: row.review_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    withdrawnAt: row.withdrawn_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...mapConfidenceFields(row),
  }
}

export function mapProductVersionRow(row: ProductVersionRow): ProductVersion {
  return {
    id: row.id,
    productId: row.product_id,
    versionNumber: row.version_number,
    snapshot: row.snapshot,
    changeSummary: row.change_summary,
    fieldChanges: row.field_changes ?? [],
    sources: row.sources ?? [],
    sourceSnapshotIds: row.source_snapshot_ids ?? [],
    approvedBy: row.approved_by ?? row.created_by,
    createdBy: row.created_by,
    submissionId: row.submission_id,
    changeRequestId: row.change_request_id,
    createdAt: row.created_at,
    ...mapConfidenceFields(row),
  }
}

export function mapProductSourceSnapshotRow(row: ProductSourceSnapshotRow): ProductSourceSnapshot {
  return {
    id: row.id,
    sourceType: parseSourceType(row.source_type),
    sourceKind: parseSourceKind(row.source_kind),
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    contentHash: row.content_hash,
    mimeType: row.mime_type,
    fileSizeBytes: parseNumeric(row.file_size_bytes),
    extractedText: row.extracted_text,
    aiExtraction: row.ai_extraction ?? {},
    metadata: row.metadata ?? {},
    capturedAt: row.captured_at,
    createdBy: row.created_by,
    submissionId: row.submission_id,
    changeRequestId: row.change_request_id,
    productId: row.product_id,
    createdAt: row.created_at,
  }
}

export function mapProductReviewEventRow(row: ProductReviewEventRow): ProductReviewEvent {
  return {
    id: row.id,
    eventType: row.event_type as ProductReviewEventType,
    entityType: row.entity_type as ProductReviewEvent['entityType'],
    entityId: row.entity_id,
    productId: row.product_id,
    actorId: row.actor_id,
    payload: row.payload ?? {},
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export function productToImportInput(product: Product): ProductSubmissionPayload {
  return {
    manufacturer: product.manufacturer,
    officialName: product.officialName,
    aliases: product.aliases,
    npk: product.npk,
    productForm: product.productForm,
    productType: product.productType,
    nPercent: product.nPercent,
    p2o5Percent: product.p2o5Percent,
    k2oPercent: product.k2oPercent,
    mgoPercent: product.mgoPercent,
    so3Percent: product.so3Percent,
    fePercent: product.fePercent,
    mnPercent: product.mnPercent,
    recommendedRateMin: product.recommendedRateMin,
    recommendedRateMax: product.recommendedRateMax,
    recommendedRateUnit: product.recommendedRateUnit,
    densityKgPerL: product.densityKgPerL,
    nutrientBasis: product.nutrientBasis,
    liquidRateMin: product.liquidRateMin,
    liquidRateMax: product.liquidRateMax,
    dilutionMin: product.dilutionMin,
    dilutionMax: product.dilutionMax,
    waterRateMin: product.waterRateMin,
    waterRateMax: product.waterRateMax,
    applicationMethod: product.applicationMethod,
    longevityWeeksMin: product.longevityWeeksMin,
    longevityWeeksMax: product.longevityWeeksMax,
    releaseType: product.releaseType,
    seasonMonths: product.seasonMonths,
    description: product.description,
    manufacturerUrl: product.manufacturerUrl,
    datasheetUrl: product.datasheetUrl,
    sourceName: product.sourceName,
    sourceCheckedAt: product.sourceCheckedAt,
  }
}

export function applyChangePatchToProduct(product: Product, patch: ProductChangePatch): ProductSubmissionPayload {
  const base = productToImportInput(product)
  return {
    ...base,
    ...patch,
    aliases: patch.aliases ?? base.aliases,
    seasonMonths: patch.seasonMonths ?? base.seasonMonths,
  }
}

export type GovernanceProductRow = ProductRow

export function mapGovernanceProductRow(row: GovernanceProductRow): Product {
  return mapProductRow(row)
}
