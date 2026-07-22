import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from './supabaseAdmin'
import {
  mapProductRow,
  PRODUCT_SELECT,
  type ProductRow,
} from './productMapping'
import {
  applyChangePatchToProduct,
  mapProductChangeRequestRow,
  mapProductSourceSnapshotRow,
  mapProductSubmissionRow,
  mapProductVersionRow,
  productToImportInput,
  type ProductChangeRequestRow,
  type ProductSourceSnapshotRow,
  type ProductSubmissionRow,
  type ProductVersionRow,
} from './productGovernanceMapping'
import {
  calculateConfidence,
  calculateReviewPriority,
  computeFieldChanges,
  detectDuplicate,
  inferChannelFromSources,
  inferFieldConfidenceFromPayload,
  mergeChangePatch,
  mergeSources,
  mergeSubmissionPayload,
  pickPrimarySource,
  ProductGovernanceError,
  resolveConfidenceScores,
  validateChangeRequestInput,
  validateSubmissionPayload,
  type DuplicateCandidate,
  type DuplicateDetectionResult,
} from './productGovernanceCore'
import {
  loadNextProductVersionNumber,
  loadPreviousProductSnapshot,
  setProductOpenChangeRequest,
  writeOfficialProductRecord,
} from './productGovernanceWriter'
import {
  checkRateLimit,
  checkUserCanSubmit,
  detectSpamText,
  getRateLimitWindowStart,
} from './productAbuseProtection'
import type {
  ApproveChangeRequestInput,
  ApproveSubmissionInput,
  AppUserRole,
  CreateChangeRequestInput,
  CreateSourceSnapshotInput,
  CreateSubmissionInput,
  FieldConfidence,
  ProductChangeRequest,
  ProductDomainEventName,
  ProductReviewEventType,
  ProductSource,
  ProductSourceSnapshot,
  ProductSubmission,
  ProductVersion,
  ReviewDecisionInput,
} from '../types/productGovernance'
import type { Product } from '../types/product'

export { calculateConfidence, detectDuplicate }
export { ProductGovernanceError }

interface ProfileRow {
  id: string
  role: AppUserRole
  reputation_score: number | string
  is_blacklisted: boolean
}

async function loadProfile(supabase: SupabaseClient, userId: string): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, role, reputation_score, is_blacklisted')
    .eq('id', userId)
    .single()

  if (error || !data) {
    throw new ProductGovernanceError('Benutzerprofil konnte nicht geladen werden.')
  }

  return data as ProfileRow
}

async function requireReviewer(supabase: SupabaseClient, reviewerId: string): Promise<ProfileRow> {
  const profile = await loadProfile(supabase, reviewerId)

  if (profile.role !== 'reviewer' && profile.role !== 'admin') {
    throw new ProductGovernanceError('Nur Reviewer oder Admins dürfen diese Aktion ausführen.')
  }

  return profile
}

async function assertUserCanSubmit(supabase: SupabaseClient, userId: string): Promise<ProfileRow> {
  const profile = await loadProfile(supabase, userId)
  const reputationScore =
    typeof profile.reputation_score === 'number'
      ? profile.reputation_score
      : Number(profile.reputation_score)

  const check = checkUserCanSubmit({
    reputationScore: Number.isFinite(reputationScore) ? reputationScore : 0,
    isBlacklisted: profile.is_blacklisted,
  })

  if (!check.allowed) {
    throw new ProductGovernanceError(check.reason ?? 'Einreichen nicht erlaubt.')
  }

  return profile
}

async function loadRateLimitWindow(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ submissionCount: number; changeRequestCount: number }> {
  const windowStart = getRateLimitWindowStart()
  const { data } = await supabase
    .from('product_submission_rate_limits')
    .select('submission_count, change_request_count')
    .eq('user_id', userId)
    .eq('window_start', windowStart)
    .maybeSingle()

  return {
    submissionCount: data?.submission_count ?? 0,
    changeRequestCount: data?.change_request_count ?? 0,
  }
}

async function incrementRateLimitCounter(
  supabase: SupabaseClient,
  userId: string,
  kind: 'submission' | 'change_request',
): Promise<void> {
  const windowStart = getRateLimitWindowStart()
  const current = await loadRateLimitWindow(supabase, userId)

  const next = {
    user_id: userId,
    window_start: windowStart,
    submission_count: current.submissionCount + (kind === 'submission' ? 1 : 0),
    change_request_count: current.changeRequestCount + (kind === 'change_request' ? 1 : 0),
  }

  const { error } = await supabase
    .from('product_submission_rate_limits')
    .upsert(next, { onConflict: 'user_id,window_start' })

  if (error) {
    throw new ProductGovernanceError(error.message || 'Rate-Limit konnte nicht aktualisiert werden.')
  }
}

async function emitDomainEvent(
  supabase: SupabaseClient,
  input: {
    eventName: ProductDomainEventName
    aggregateType: 'product' | 'submission' | 'change_request' | 'version' | 'source_snapshot'
    aggregateId: string
    productId?: string | null
    actorId?: string | null
    payload?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await supabase.from('product_domain_events').insert({
    event_name: input.eventName,
    aggregate_type: input.aggregateType,
    aggregate_id: input.aggregateId,
    product_id: input.productId ?? null,
    actor_id: input.actorId ?? null,
    payload: input.payload ?? {},
  })

  if (error) {
    throw new ProductGovernanceError(error.message || 'Domain Event konnte nicht geschrieben werden.')
  }
}

async function countCorroboration(
  supabase: SupabaseClient,
  manufacturer: string,
  officialName: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('product_submissions')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'needs_information'])
    .is('soft_deleted_at', null)
    .filter('payload->>manufacturer', 'eq', manufacturer)
    .filter('payload->>officialName', 'eq', officialName)

  if (error) {
    return 0
  }

  return count ?? 0
}

export async function createSourceSnapshot(
  input: CreateSourceSnapshotInput,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<ProductSourceSnapshot> {
  const { data, error } = await supabase
    .from('product_source_snapshots')
    .insert({
      source_type: input.sourceType,
      source_kind: input.sourceKind,
      source_name: input.sourceName,
      source_url: input.sourceUrl ?? null,
      storage_bucket: input.storageBucket ?? null,
      storage_path: input.storagePath ?? null,
      content_hash: input.contentHash,
      mime_type: input.mimeType ?? null,
      file_size_bytes: input.fileSizeBytes ?? null,
      extracted_text: input.extractedText ?? null,
      ai_extraction: input.aiExtraction ?? {},
      metadata: input.metadata ?? {},
      captured_at: input.capturedAt,
      created_by: input.createdBy ?? null,
      submission_id: input.submissionId ?? null,
      change_request_id: input.changeRequestId ?? null,
      product_id: input.productId ?? null,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new ProductGovernanceError(error?.message || 'Quellen-Snapshot konnte nicht erstellt werden.')
  }

  await emitDomainEvent(supabase, {
    eventName: 'product.source_snapshot_created',
    aggregateType: 'source_snapshot',
    aggregateId: data.id,
    productId: input.productId ?? null,
    actorId: input.createdBy ?? null,
    payload: { sourceKind: input.sourceKind, contentHash: input.contentHash },
  })

  return mapProductSourceSnapshotRow(data as ProductSourceSnapshotRow)
}

async function persistSourceSnapshots(
  supabase: SupabaseClient,
  snapshots: CreateSourceSnapshotInput[] | undefined,
  context: {
    createdBy: string
    submissionId?: string | null
    changeRequestId?: string | null
    productId?: string | null
  },
): Promise<string[]> {
  if (!snapshots?.length) {
    return []
  }

  const ids: string[] = []

  for (const snapshot of snapshots) {
    const created = await createSourceSnapshot(
      {
        ...snapshot,
        createdBy: snapshot.createdBy ?? context.createdBy,
        submissionId: snapshot.submissionId ?? context.submissionId ?? null,
        changeRequestId: snapshot.changeRequestId ?? context.changeRequestId ?? null,
        productId: snapshot.productId ?? context.productId ?? null,
      },
      supabase,
    )
    ids.push(created.id)
  }

  return ids
}

async function logReviewEvent(
  supabase: SupabaseClient,
  input: {
    eventType: ProductReviewEventType
    entityType: 'submission' | 'change_request' | 'product' | 'version' | 'user'
    entityId: string
    productId?: string | null
    actorId?: string | null
    payload?: Record<string, unknown>
    notes?: string | null
  },
): Promise<void> {
  const { error } = await supabase.from('product_review_events').insert({
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId,
    product_id: input.productId ?? null,
    actor_id: input.actorId ?? null,
    payload: input.payload ?? {},
    notes: input.notes ?? null,
  })

  if (error) {
    throw new ProductGovernanceError(error.message || 'Audit-Log konnte nicht geschrieben werden.')
  }
}

async function loadDuplicateCandidates(supabase: SupabaseClient): Promise<DuplicateCandidate[]> {
  const [productsResult, submissionsResult] = await Promise.all([
    supabase
      .from('products')
      .select('id, manufacturer, official_name, aliases')
      .is('soft_deleted_at', null),
    supabase
      .from('product_submissions')
      .select('id, payload')
      .in('status', ['pending', 'needs_information'])
      .is('soft_deleted_at', null),
  ])

  if (productsResult.error) {
    throw new ProductGovernanceError(productsResult.error.message)
  }

  if (submissionsResult.error) {
    throw new ProductGovernanceError(submissionsResult.error.message)
  }

  const fromProducts: DuplicateCandidate[] = (productsResult.data ?? []).map((row) => ({
    id: row.id as string,
    manufacturer: row.manufacturer as string,
    officialName: row.official_name as string,
    aliases: (row.aliases as string[] | null) ?? [],
  }))

  const fromSubmissions: DuplicateCandidate[] = (submissionsResult.data ?? []).flatMap((row) => {
    const payload = row.payload as { manufacturer?: string; officialName?: string; aliases?: string[] }

    if (!payload.manufacturer || !payload.officialName) {
      return []
    }

    return [{
      id: row.id as string,
      manufacturer: payload.manufacturer,
      officialName: payload.officialName,
      aliases: payload.aliases ?? [],
    }]
  })

  return [...fromProducts, ...fromSubmissions]
}

export async function detectDuplicateInCatalog(
  payload: Pick<CreateSubmissionInput['payload'], 'manufacturer' | 'officialName' | 'aliases'>,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<DuplicateDetectionResult> {
  const candidates = await loadDuplicateCandidates(supabase)
  return detectDuplicate(payload, candidates)
}

async function loadProductById(supabase: SupabaseClient, productId: string): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('id', productId)
    .is('soft_deleted_at', null)
    .single()

  if (error || !data) {
    throw new ProductGovernanceError('Produkt wurde nicht gefunden.')
  }

  return mapProductRow(data as unknown as ProductRow)
}

async function loadSubmissionById(
  supabase: SupabaseClient,
  submissionId: string,
): Promise<ProductSubmissionRow> {
  const { data, error } = await supabase
    .from('product_submissions')
    .select('*')
    .eq('id', submissionId)
    .is('soft_deleted_at', null)
    .single()

  if (error || !data) {
    throw new ProductGovernanceError('Produktvorschlag wurde nicht gefunden.')
  }

  return data as ProductSubmissionRow
}

async function loadChangeRequestById(
  supabase: SupabaseClient,
  changeRequestId: string,
): Promise<ProductChangeRequestRow> {
  const { data, error } = await supabase
    .from('product_change_requests')
    .select('*')
    .eq('id', changeRequestId)
    .is('soft_deleted_at', null)
    .single()

  if (error || !data) {
    throw new ProductGovernanceError('Änderungsvorschlag wurde nicht gefunden.')
  }

  return data as ProductChangeRequestRow
}

export async function createSubmission(
  input: CreateSubmissionInput,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<ProductSubmission> {
  validateSubmissionPayload(input.payload)
  await assertUserCanSubmit(supabase, input.submittedBy)

  const rateWindow = await loadRateLimitWindow(supabase, input.submittedBy)
  const rateCheck = checkRateLimit(rateWindow, 'submission')

  if (!rateCheck.allowed) {
    await logReviewEvent(supabase, {
      eventType: 'rate_limit_triggered',
      entityType: 'user',
      entityId: input.submittedBy,
      actorId: input.submittedBy,
      payload: { kind: 'submission', reason: rateCheck.reason },
    })
    throw new ProductGovernanceError(rateCheck.reason ?? 'Rate-Limit erreicht.')
  }

  const spamCheck = detectSpamText(
    [input.payload.description, input.payload.officialName, input.payload.manufacturer]
      .filter(Boolean)
      .join(' '),
  )

  const sources = input.sources ?? []
  const submissionChannel =
    input.submissionChannel ?? inferChannelFromSources(sources, 'user_manual')
  const corroborationCount = await countCorroboration(
    supabase,
    input.payload.manufacturer,
    input.payload.officialName,
  )
  const reviewPriority = calculateReviewPriority(sources, submissionChannel, corroborationCount)

  const aiFieldConfidence = inferFieldConfidenceFromPayload(
    input.payload,
    input.aiFieldConfidence ?? {},
  )
  if (sources.length > 0) {
    aiFieldConfidence.sources = input.aiFieldConfidence?.sources ?? 70
  }

  const reviewFieldConfidence = input.reviewFieldConfidence ?? {}
  const scores = resolveConfidenceScores({ aiFieldConfidence, reviewFieldConfidence })
  const duplicateResult = await detectDuplicateInCatalog(input.payload, supabase)

  const insertRow: Record<string, unknown> = {
    submitted_by: input.submittedBy,
    status: duplicateResult.isDuplicate ? 'duplicate' : 'pending',
    payload: input.payload,
    field_confidence: scores.reviewFieldConfidence,
    ai_field_confidence: scores.aiFieldConfidence,
    review_field_confidence: scores.reviewFieldConfidence,
    sources,
    confidence_score: scores.reviewConfidenceScore,
    ai_confidence_score: scores.aiConfidenceScore,
    review_confidence_score: scores.reviewConfidenceScore,
    submission_channel: submissionChannel,
    review_priority: reviewPriority,
    corroboration_count: corroborationCount,
    source_snapshot_ids: [],
    duplicate_of_product_id: null,
    duplicate_of_submission_id: null,
    review_notes: duplicateResult.isDuplicate ? duplicateResult.bestMatch?.reason ?? null : null,
  }

  // duplicate_of: distinguish product vs submission by checking products table
  if (duplicateResult.isDuplicate && duplicateResult.bestMatch) {
    const { data: productMatch } = await supabase
      .from('products')
      .select('id')
      .eq('id', duplicateResult.bestMatch.id)
      .maybeSingle()

    if (productMatch) {
      insertRow.duplicate_of_product_id = duplicateResult.bestMatch.id
    } else {
      insertRow.duplicate_of_submission_id = duplicateResult.bestMatch.id
    }
  }

  const { data, error } = await supabase
    .from('product_submissions')
    .insert(insertRow)
    .select('*')
    .single()

  if (error || !data) {
    throw new ProductGovernanceError(error?.message || 'Produktvorschlag konnte nicht erstellt werden.')
  }

  const snapshotIds = await persistSourceSnapshots(supabase, input.sourceSnapshots, {
    createdBy: input.submittedBy,
    submissionId: data.id,
  })

  if (snapshotIds.length > 0) {
    await supabase
      .from('product_submissions')
      .update({ source_snapshot_ids: snapshotIds })
      .eq('id', data.id)
  }

  await incrementRateLimitCounter(supabase, input.submittedBy, 'submission')

  await logReviewEvent(supabase, {
    eventType: 'submission_created',
    entityType: 'submission',
    entityId: data.id,
    actorId: input.submittedBy,
    payload: {
      reviewPriority,
      aiConfidenceScore: scores.aiConfidenceScore,
      reviewConfidenceScore: scores.reviewConfidenceScore,
      duplicateDetected: duplicateResult.isDuplicate,
      duplicateMatch: duplicateResult.bestMatch,
    },
  })

  await emitDomainEvent(supabase, {
    eventName: 'product.submission_created',
    aggregateType: 'submission',
    aggregateId: data.id,
    actorId: input.submittedBy,
    payload: { submissionChannel, reviewPriority },
  })

  if (duplicateResult.isDuplicate) {
    await logReviewEvent(supabase, {
      eventType: 'duplicate_detected',
      entityType: 'submission',
      entityId: data.id,
      actorId: input.submittedBy,
      payload: { match: duplicateResult.bestMatch },
    })
  }

  if (spamCheck.flagged) {
    await supabase.from('product_spam_flags').insert({
      user_id: input.submittedBy,
      entity_type: 'submission',
      entity_id: data.id,
      reason: spamCheck.reasons.join('; '),
      score: spamCheck.score,
    })

    await logReviewEvent(supabase, {
      eventType: 'spam_flagged',
      entityType: 'submission',
      entityId: data.id,
      actorId: input.submittedBy,
      payload: { score: spamCheck.score, reasons: spamCheck.reasons },
    })
  }

  return mapProductSubmissionRow(data as ProductSubmissionRow)
}

export async function createChangeRequest(
  input: CreateChangeRequestInput,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<ProductChangeRequest> {
  validateChangeRequestInput(input.changeSummary, input.proposedChanges)
  await assertUserCanSubmit(supabase, input.submittedBy)

  const { data: productExists, error: productError } = await supabase
    .from('products')
    .select('id')
    .eq('id', input.productId)
    .is('soft_deleted_at', null)
    .maybeSingle()

  if (productError) {
    throw new ProductGovernanceError(productError.message)
  }

  if (!productExists) {
    throw new ProductGovernanceError('Produkt wurde nicht gefunden.')
  }

  const { data: openRequests, error: openError } = await supabase
    .from('product_change_requests')
    .select('id')
    .eq('product_id', input.productId)
    .in('status', ['pending', 'needs_information'])
    .is('soft_deleted_at', null)
    .limit(1)

  if (openError) {
    throw new ProductGovernanceError(openError.message)
  }

  if ((openRequests?.length ?? 0) > 0) {
    throw new ProductGovernanceError('Für dieses Produkt existiert bereits ein offener Änderungsvorschlag.')
  }

  const rateWindow = await loadRateLimitWindow(supabase, input.submittedBy)
  const rateCheck = checkRateLimit(rateWindow, 'change_request')

  if (!rateCheck.allowed) {
    await logReviewEvent(supabase, {
      eventType: 'rate_limit_triggered',
      entityType: 'user',
      entityId: input.submittedBy,
      actorId: input.submittedBy,
      productId: input.productId,
      payload: { kind: 'change_request', reason: rateCheck.reason },
    })
    throw new ProductGovernanceError(rateCheck.reason ?? 'Rate-Limit erreicht.')
  }

  const sources = input.sources ?? []
  const submissionChannel =
    input.submissionChannel ?? inferChannelFromSources(sources, 'user_manual')
  const corroborationCount = await countCorroboration(
    supabase,
    input.proposedChanges.manufacturer ?? '',
    input.proposedChanges.officialName ?? '',
  )
  const reviewPriority = calculateReviewPriority(sources, submissionChannel, corroborationCount)

  const aiFieldConfidence = inferFieldConfidenceFromPayload(
    input.proposedChanges,
    input.aiFieldConfidence ?? {},
  )
  const reviewFieldConfidence = input.reviewFieldConfidence ?? {}
  const scores = resolveConfidenceScores({ aiFieldConfidence, reviewFieldConfidence })

  const { data, error } = await supabase
    .from('product_change_requests')
    .insert({
      product_id: input.productId,
      submitted_by: input.submittedBy,
      status: 'pending',
      proposed_changes: input.proposedChanges,
      change_summary: input.changeSummary.trim(),
      field_confidence: scores.reviewFieldConfidence,
      ai_field_confidence: scores.aiFieldConfidence,
      review_field_confidence: scores.reviewFieldConfidence,
      sources,
      confidence_score: scores.reviewConfidenceScore,
      ai_confidence_score: scores.aiConfidenceScore,
      review_confidence_score: scores.reviewConfidenceScore,
      submission_channel: submissionChannel,
      review_priority: reviewPriority,
      corroboration_count: corroborationCount,
      source_snapshot_ids: [],
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new ProductGovernanceError(error?.message || 'Änderungsvorschlag konnte nicht erstellt werden.')
  }

  const snapshotIds = await persistSourceSnapshots(supabase, input.sourceSnapshots, {
    createdBy: input.submittedBy,
    changeRequestId: data.id,
    productId: input.productId,
  })

  if (snapshotIds.length > 0) {
    await supabase
      .from('product_change_requests')
      .update({ source_snapshot_ids: snapshotIds })
      .eq('id', data.id)
  }

  await setProductOpenChangeRequest(supabase, input.productId, true)

  await incrementRateLimitCounter(supabase, input.submittedBy, 'change_request')

  await logReviewEvent(supabase, {
    eventType: 'change_request_created',
    entityType: 'change_request',
    entityId: data.id,
    productId: input.productId,
    actorId: input.submittedBy,
    payload: {
      changeSummary: input.changeSummary,
      reviewPriority,
      aiConfidenceScore: scores.aiConfidenceScore,
      reviewConfidenceScore: scores.reviewConfidenceScore,
    },
  })

  await emitDomainEvent(supabase, {
    eventName: 'product.change_requested',
    aggregateType: 'change_request',
    aggregateId: data.id,
    productId: input.productId,
    actorId: input.submittedBy,
    payload: { reviewPriority },
  })

  return mapProductChangeRequestRow(data as ProductChangeRequestRow)
}

export async function createProductVersion(
  input: {
    productId: string
    versionNumber: number
    snapshot: Record<string, unknown>
    previousSnapshot?: Record<string, unknown> | null
    changeSummary: string
    aiFieldConfidence: Partial<FieldConfidence>
    reviewFieldConfidence: Partial<FieldConfidence>
    aiConfidenceScore: number
    reviewConfidenceScore: number
    sources: ProductSource[]
    sourceSnapshotIds?: string[]
    approvedBy: string | null
    submissionId?: string | null
    changeRequestId?: string | null
  },
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<ProductVersion> {
  const fieldChanges = computeFieldChanges(input.previousSnapshot ?? null, input.snapshot)

  const { data, error } = await supabase
    .from('product_versions')
    .insert({
      product_id: input.productId,
      version_number: input.versionNumber,
      snapshot: input.snapshot,
      change_summary: input.changeSummary,
      field_changes: fieldChanges,
      field_confidence: input.reviewFieldConfidence,
      ai_field_confidence: input.aiFieldConfidence,
      review_field_confidence: input.reviewFieldConfidence,
      sources: input.sources,
      source_snapshot_ids: input.sourceSnapshotIds ?? [],
      confidence_score: input.reviewConfidenceScore,
      ai_confidence_score: input.aiConfidenceScore,
      review_confidence_score: input.reviewConfidenceScore,
      created_by: input.approvedBy,
      approved_by: input.approvedBy,
      submission_id: input.submissionId ?? null,
      change_request_id: input.changeRequestId ?? null,
    })
    .select('*')
    .single()

  if (error || !data) {
    throw new ProductGovernanceError(error?.message || 'Produktversion konnte nicht erstellt werden.')
  }

  await logReviewEvent(supabase, {
    eventType: 'product_version_created',
    entityType: 'version',
    entityId: data.id,
    productId: input.productId,
    actorId: input.approvedBy,
    payload: {
      versionNumber: input.versionNumber,
      changeSummary: input.changeSummary,
      fieldChanges,
    },
  })

  await emitDomainEvent(supabase, {
    eventName: input.versionNumber === 1 ? 'product.published' : 'product.updated',
    aggregateType: 'version',
    aggregateId: data.id,
    productId: input.productId,
    actorId: input.approvedBy,
    payload: { versionNumber: input.versionNumber, fieldChanges },
  })

  return mapProductVersionRow(data as ProductVersionRow)
}

async function publishProductFromPayload(
  supabase: SupabaseClient,
  payload: CreateSubmissionInput['payload'],
  governance: {
    reviewerId: string
    aiFieldConfidence: Partial<FieldConfidence>
    reviewFieldConfidence: Partial<FieldConfidence>
    sources: ProductSource[]
    sourceSnapshotIds?: string[]
    changeSummary: string
    submissionId?: string | null
    changeRequestId?: string | null
    existingProductId?: string | null
  },
): Promise<{ product: Product; version: ProductVersion; versionNumber: number }> {
  const primary = pickPrimarySource(governance.sources)
  const now = new Date().toISOString()
  const scores = resolveConfidenceScores({
    aiFieldConfidence: governance.aiFieldConfidence,
    reviewFieldConfidence: governance.reviewFieldConfidence,
  })

  const existingProductId = governance.existingProductId ?? null
  const previousSnapshot = existingProductId
    ? await loadPreviousProductSnapshot(supabase, existingProductId)
    : null
  const versionNumber = existingProductId
    ? await loadNextProductVersionNumber(supabase, existingProductId)
    : 1

  const { product, snapshot } = await writeOfficialProductRecord(supabase, {
    payload,
    existingProductId,
    reviewerId: governance.reviewerId,
    verificationStatus: 'verified',
    aiConfidenceScore: scores.aiConfidenceScore,
    reviewConfidenceScore: scores.reviewConfidenceScore,
    aiFieldConfidence: scores.aiFieldConfidence,
    reviewFieldConfidence: scores.reviewFieldConfidence,
    sources: governance.sources,
    primarySourceType: primary.primarySourceType,
    primarySourceUrl: primary.primarySourceUrl,
    versionNumber,
    lastReviewedAt: now,
    hasOpenChangeRequest: false,
  })

  const version = await createProductVersion(
    {
      productId: product.id,
      versionNumber,
      snapshot,
      previousSnapshot,
      changeSummary: governance.changeSummary,
      aiFieldConfidence: scores.aiFieldConfidence,
      reviewFieldConfidence: scores.reviewFieldConfidence,
      aiConfidenceScore: scores.aiConfidenceScore,
      reviewConfidenceScore: scores.reviewConfidenceScore,
      sources: governance.sources,
      sourceSnapshotIds: governance.sourceSnapshotIds,
      approvedBy: governance.reviewerId,
      submissionId: governance.submissionId,
      changeRequestId: governance.changeRequestId,
    },
    supabase,
  )

  await logReviewEvent(supabase, {
    eventType: 'product_published',
    entityType: 'product',
    entityId: product.id,
    productId: product.id,
    actorId: governance.reviewerId,
    payload: { versionNumber },
  })

  return { product, version, versionNumber }
}

export async function approveSubmission(
  submissionId: string,
  input: ApproveSubmissionInput,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<{ submission: ProductSubmission; product: Product; version: ProductVersion }> {
  await requireReviewer(supabase, input.reviewerId)

  const row = await loadSubmissionById(supabase, submissionId)

  if (row.status !== 'pending' && row.status !== 'needs_information') {
    throw new ProductGovernanceError('Nur offene Vorschläge können angenommen werden.')
  }

  const payload = mergeSubmissionPayload(row.payload, input.payloadOverride)
  validateSubmissionPayload(payload)

  const aiFieldConfidence = (row.ai_field_confidence as Partial<FieldConfidence>) ??
    (row.field_confidence as Partial<FieldConfidence>) ??
    inferFieldConfidenceFromPayload(payload, {})
  const reviewFieldConfidence = inferFieldConfidenceFromPayload(
    payload,
    input.reviewFieldConfidence ?? (row.review_field_confidence as Partial<FieldConfidence>) ?? {},
  )
  const sources = mergeSources((row.sources as ProductSource[]) ?? [], [])
  const scores = resolveConfidenceScores({ aiFieldConfidence, reviewFieldConfidence })
  const now = new Date().toISOString()

  const published = await publishProductFromPayload(supabase, payload, {
    reviewerId: input.reviewerId,
    aiFieldConfidence: scores.aiFieldConfidence,
    reviewFieldConfidence: scores.reviewFieldConfidence,
    sources,
    sourceSnapshotIds: (row.source_snapshot_ids as string[] | null) ?? [],
    changeSummary: `Neues Produkt aus Vorschlag ${submissionId}`,
    submissionId,
  })

  const { data: updatedSubmission, error } = await supabase
    .from('product_submissions')
    .update({
      status: 'approved',
      review_notes: input.reviewNotes?.trim() ?? null,
      reviewed_by: input.reviewerId,
      reviewed_at: now,
      resulting_product_id: published.product.id,
      confidence_score: scores.reviewConfidenceScore,
      ai_confidence_score: scores.aiConfidenceScore,
      review_confidence_score: scores.reviewConfidenceScore,
      field_confidence: scores.reviewFieldConfidence,
      ai_field_confidence: scores.aiFieldConfidence,
      review_field_confidence: scores.reviewFieldConfidence,
    })
    .eq('id', submissionId)
    .select('*')
    .single()

  if (error || !updatedSubmission) {
    throw new ProductGovernanceError(error?.message || 'Vorschlagsstatus konnte nicht aktualisiert werden.')
  }

  await logReviewEvent(supabase, {
    eventType: 'submission_approved',
    entityType: 'submission',
    entityId: submissionId,
    productId: published.product.id,
    actorId: input.reviewerId,
    notes: input.reviewNotes ?? null,
    payload: { versionNumber: published.versionNumber },
  })

  await emitDomainEvent(supabase, {
    eventName: 'product.submission_approved',
    aggregateType: 'submission',
    aggregateId: submissionId,
    productId: published.product.id,
    actorId: input.reviewerId,
    payload: { versionNumber: published.versionNumber },
  })

  return {
    submission: mapProductSubmissionRow(updatedSubmission as ProductSubmissionRow),
    product: published.product,
    version: published.version,
  }
}

export async function rejectSubmission(
  submissionId: string,
  input: ReviewDecisionInput,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<ProductSubmission> {
  await requireReviewer(supabase, input.reviewerId)

  const row = await loadSubmissionById(supabase, submissionId)

  if (row.status !== 'pending' && row.status !== 'needs_information') {
    throw new ProductGovernanceError('Nur offene Vorschläge können abgelehnt werden.')
  }

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('product_submissions')
    .update({
      status: 'rejected',
      review_notes: input.reviewNotes?.trim() ?? null,
      reviewed_by: input.reviewerId,
      reviewed_at: now,
    })
    .eq('id', submissionId)
    .select('*')
    .single()

  if (error || !data) {
    throw new ProductGovernanceError(error?.message || 'Vorschlag konnte nicht abgelehnt werden.')
  }

  await logReviewEvent(supabase, {
    eventType: 'submission_rejected',
    entityType: 'submission',
    entityId: submissionId,
    actorId: input.reviewerId,
    notes: input.reviewNotes ?? null,
  })

  await emitDomainEvent(supabase, {
    eventName: 'product.submission_rejected',
    aggregateType: 'submission',
    aggregateId: submissionId,
    actorId: input.reviewerId,
  })

  return mapProductSubmissionRow(data as ProductSubmissionRow)
}

export async function approveChangeRequest(
  changeRequestId: string,
  input: ApproveChangeRequestInput,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<{ changeRequest: ProductChangeRequest; product: Product; version: ProductVersion }> {
  await requireReviewer(supabase, input.reviewerId)

  const row = await loadChangeRequestById(supabase, changeRequestId)

  if (row.status !== 'pending' && row.status !== 'needs_information') {
    throw new ProductGovernanceError('Nur offene Änderungsvorschläge können angenommen werden.')
  }

  const product = await loadProductById(supabase, row.product_id)
  const proposedChanges = mergeChangePatch(row.proposed_changes, input.proposedChangesOverride)
  const mergedPayload = applyChangePatchToProduct(product, proposedChanges)

  const aiFieldConfidence = (row.ai_field_confidence as Partial<FieldConfidence>) ??
    (row.field_confidence as Partial<FieldConfidence>) ??
    inferFieldConfidenceFromPayload(proposedChanges, {})
  const reviewFieldConfidence = inferFieldConfidenceFromPayload(
    proposedChanges,
    input.reviewFieldConfidence ?? (row.review_field_confidence as Partial<FieldConfidence>) ?? {},
  )
  const sources = mergeSources(product.sources, (row.sources as ProductSource[]) ?? [])
  const scores = resolveConfidenceScores({ aiFieldConfidence, reviewFieldConfidence })
  const now = new Date().toISOString()

  const published = await publishProductFromPayload(supabase, mergedPayload, {
    reviewerId: input.reviewerId,
    aiFieldConfidence: scores.aiFieldConfidence,
    reviewFieldConfidence: scores.reviewFieldConfidence,
    sources,
    sourceSnapshotIds: (row.source_snapshot_ids as string[] | null) ?? [],
    changeSummary: row.change_summary,
    changeRequestId,
    existingProductId: row.product_id,
  })

  const { data: updatedRequest, error } = await supabase
    .from('product_change_requests')
    .update({
      status: 'approved',
      review_notes: input.reviewNotes?.trim() ?? null,
      reviewed_by: input.reviewerId,
      reviewed_at: now,
      confidence_score: scores.reviewConfidenceScore,
      ai_confidence_score: scores.aiConfidenceScore,
      review_confidence_score: scores.reviewConfidenceScore,
      field_confidence: scores.reviewFieldConfidence,
      ai_field_confidence: scores.aiFieldConfidence,
      review_field_confidence: scores.reviewFieldConfidence,
    })
    .eq('id', changeRequestId)
    .select('*')
    .single()

  if (error || !updatedRequest) {
    throw new ProductGovernanceError(error?.message || 'Änderungsvorschlag konnte nicht abgeschlossen werden.')
  }

  await logReviewEvent(supabase, {
    eventType: 'change_request_approved',
    entityType: 'change_request',
    entityId: changeRequestId,
    productId: row.product_id,
    actorId: input.reviewerId,
    notes: input.reviewNotes ?? null,
    payload: { versionNumber: published.versionNumber },
  })

  await emitDomainEvent(supabase, {
    eventName: 'product.change_approved',
    aggregateType: 'change_request',
    aggregateId: changeRequestId,
    productId: row.product_id,
    actorId: input.reviewerId,
    payload: { versionNumber: published.versionNumber },
  })

  return {
    changeRequest: mapProductChangeRequestRow(updatedRequest as ProductChangeRequestRow),
    product: published.product,
    version: published.version,
  }
}

export async function rejectChangeRequest(
  changeRequestId: string,
  input: ReviewDecisionInput,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<ProductChangeRequest> {
  await requireReviewer(supabase, input.reviewerId)

  const row = await loadChangeRequestById(supabase, changeRequestId)

  if (row.status !== 'pending' && row.status !== 'needs_information') {
    throw new ProductGovernanceError('Nur offene Änderungsvorschläge können abgelehnt werden.')
  }

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('product_change_requests')
    .update({
      status: 'rejected',
      review_notes: input.reviewNotes?.trim() ?? null,
      reviewed_by: input.reviewerId,
      reviewed_at: now,
    })
    .eq('id', changeRequestId)
    .select('*')
    .single()

  if (error || !data) {
    throw new ProductGovernanceError(error?.message || 'Änderungsvorschlag konnte nicht abgelehnt werden.')
  }

  await setProductOpenChangeRequest(supabase, row.product_id, false)

  await logReviewEvent(supabase, {
    eventType: 'change_request_rejected',
    entityType: 'change_request',
    entityId: changeRequestId,
    productId: row.product_id,
    actorId: input.reviewerId,
    notes: input.reviewNotes ?? null,
  })

  await emitDomainEvent(supabase, {
    eventName: 'product.change_rejected',
    aggregateType: 'change_request',
    aggregateId: changeRequestId,
    productId: row.product_id,
    actorId: input.reviewerId,
  })

  return mapProductChangeRequestRow(data as ProductChangeRequestRow)
}

export { productToImportInput }
