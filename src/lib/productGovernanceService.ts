/**
 * Product Governance Service – einziger offizieller Schreibpfad für Produktdaten.
 *
 * Alle Änderungen (Nutzer, KI, PDF/Foto-Import, Admin-Seed) laufen über diesen Service.
 * Direkte Schreibzugriffe auf public.products sind verboten.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from './supabaseAdmin'
import type { ProductImportInput, ProductImportResult } from '../types/product'
import type {
  ApproveChangeRequestInput,
  ApproveSubmissionInput,
  CreateChangeRequestInput,
  CreateSourceSnapshotInput,
  CreateSubmissionInput,
  GovernanceImportInput,
  GovernanceImportResult,
  ReviewDecisionInput,
  ReviewQueueItem,
} from '../types/productGovernance'
import {
  approveChangeRequest,
  approveSubmission,
  createChangeRequest,
  createSourceSnapshot,
  createSubmission,
  detectDuplicateInCatalog,
  rejectChangeRequest,
  rejectSubmission,
} from './productGovernanceServer'
import {
  calculateConfidence,
  computeContentHash,
  detectDuplicate,
  ProductGovernanceError,
} from './productGovernanceCore'

export {
  approveChangeRequest,
  approveSubmission,
  createChangeRequest,
  createSourceSnapshot,
  createSubmission,
  detectDuplicateInCatalog,
  rejectChangeRequest,
  rejectSubmission,
  calculateConfidence,
  computeContentHash,
  detectDuplicate,
  ProductGovernanceError,
}

/** @deprecated Direktimport – nutze importProductViaGovernance(). */
export type { ProductImportInput, ProductImportResult }

/**
 * Einheitlicher Import-/Publish-Pfad für alle Kanäle.
 * Mit autoApprove nur für Reviewer/Admin (Service Role + Rollenprüfung im Server).
 */
export async function importProductViaGovernance(
  input: GovernanceImportInput,
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<GovernanceImportResult> {
  const submission = await createSubmission(
    {
      submittedBy: input.actorId,
      payload: input.payload,
      sources: input.sources,
      submissionChannel: input.submissionChannel ?? 'ai_import',
      sourceSnapshots: input.sourceSnapshots,
      aiFieldConfidence: input.aiFieldConfidence,
      reviewFieldConfidence: input.reviewFieldConfidence,
    },
    supabase,
  )

  if (!input.autoApprove) {
    return { submission, approved: false }
  }

  const result = await approveSubmission(
    submission.id,
    {
      reviewerId: input.actorId,
      reviewNotes: input.reviewNotes ?? 'Automatische Freigabe über Governance-Import.',
      reviewFieldConfidence: input.reviewFieldConfidence,
    },
    supabase,
  )

  return {
    submission: result.submission,
    product: result.product,
    version: result.version,
    approved: true,
  }
}

/**
 * Legacy-kompatibler Wrapper – leitet auf den Governance-Import um.
 */
export async function importProductWithGovernance(
  input: ProductImportInput,
  options: {
    actorId: string
    autoApprove?: boolean
    submissionChannel?: GovernanceImportInput['submissionChannel']
    reviewNotes?: string | null
  },
  supabase: SupabaseClient = createSupabaseAdminClient(),
): Promise<ProductImportResult> {
  const result = await importProductViaGovernance(
    {
      payload: input,
      actorId: options.actorId,
      autoApprove: options.autoApprove ?? false,
      submissionChannel: options.submissionChannel ?? 'admin_seed',
      reviewNotes: options.reviewNotes,
    },
    supabase,
  )

  if (!result.approved || !result.product) {
    throw new ProductGovernanceError(
      'Produktimport erfordert autoApprove=true und Reviewer-Berechtigung, oder manuelles Review.',
    )
  }

  return {
    product: result.product,
    created: result.version?.versionNumber === 1,
  }
}

export async function submitNewProduct(
  input: CreateSubmissionInput,
  supabase?: SupabaseClient,
): Promise<Awaited<ReturnType<typeof createSubmission>>> {
  return createSubmission(input, supabase)
}

export async function submitChangeRequest(
  input: CreateChangeRequestInput,
  supabase?: SupabaseClient,
): Promise<Awaited<ReturnType<typeof createChangeRequest>>> {
  return createChangeRequest(input, supabase)
}

export async function registerSourceSnapshot(
  input: CreateSourceSnapshotInput,
  supabase?: SupabaseClient,
): Promise<Awaited<ReturnType<typeof createSourceSnapshot>>> {
  return createSourceSnapshot(input, supabase)
}

export async function fetchReviewQueue(
  supabase: SupabaseClient = createSupabaseAdminClient(),
  limit = 50,
): Promise<ReviewQueueItem[]> {
  const { data, error } = await supabase
    .from('product_review_queue')
    .select('*')
    .order('review_priority', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    throw new ProductGovernanceError(error.message || 'Review-Warteschlange konnte nicht geladen werden.')
  }

  return (data ?? []).map((row) => ({
    queueKind: row.queue_kind as ReviewQueueItem['queueKind'],
    itemId: row.item_id as string,
    submittedBy: row.submitted_by as string,
    status: row.status as string,
    reviewPriority: Number(row.review_priority ?? 0),
    corroborationCount: Number(row.corroboration_count ?? 0),
    submissionChannel: row.submission_channel as ReviewQueueItem['submissionChannel'],
    manufacturer: (row.manufacturer as string | null) ?? null,
    officialName: (row.official_name as string | null) ?? null,
    productId: (row.product_id as string | null) ?? null,
    createdAt: row.created_at as string,
  }))
}

export type {
  ApproveChangeRequestInput,
  ApproveSubmissionInput,
  CreateChangeRequestInput,
  CreateSourceSnapshotInput,
  CreateSubmissionInput,
  GovernanceImportInput,
  GovernanceImportResult,
  ReviewDecisionInput,
  ReviewQueueItem,
}
