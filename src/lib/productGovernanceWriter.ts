/**
 * Einziger Modul mit direkten Schreibzugriffen auf public.products.
 * Alle Aufrufer müssen über den Product Governance Service laufen.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { toProductUpsertRow } from './productImportCore'
import { mapProductRow, PRODUCT_SELECT, type ProductRow } from './productMapping'
import { ProductGovernanceError } from './productGovernanceCore'
import type {
  FieldConfidence,
  ProductSource,
  ProductSubmissionPayload,
} from '../types/productGovernance'
import type { Product } from '../types/product'

export interface OfficialProductWriteInput {
  payload: ProductSubmissionPayload
  existingProductId?: string | null
  reviewerId: string
  verificationStatus: 'verified' | 'legacy_imported' | 'incomplete'
  aiConfidenceScore: number
  reviewConfidenceScore: number
  aiFieldConfidence: Partial<FieldConfidence>
  reviewFieldConfidence: Partial<FieldConfidence>
  sources: ProductSource[]
  primarySourceType: string | null
  primarySourceUrl: string | null
  versionNumber: number
  lastReviewedAt: string
  hasOpenChangeRequest?: boolean
}

export interface OfficialProductWriteResult {
  product: Product
  snapshot: Record<string, unknown>
}

export async function writeOfficialProductRecord(
  supabase: SupabaseClient,
  input: OfficialProductWriteInput,
): Promise<OfficialProductWriteResult> {
  const productRow = toProductUpsertRow(input.payload)
  const now = input.lastReviewedAt

  const governanceFields = {
    verification_status: input.verificationStatus,
    verified_at: input.verificationStatus === 'verified' ? now : null,
    verified_by: input.verificationStatus === 'verified' ? input.reviewerId : null,
    last_reviewed_at: now,
    current_version: input.versionNumber,
    confidence_score: input.reviewConfidenceScore,
    field_confidence: input.reviewFieldConfidence,
    ai_confidence_score: input.aiConfidenceScore,
    review_confidence_score: input.reviewConfidenceScore,
    ai_field_confidence: input.aiFieldConfidence,
    review_field_confidence: input.reviewFieldConfidence,
    sources: input.sources,
    primary_source_type: input.primarySourceType,
    primary_source_url: input.primarySourceUrl,
    has_open_change_request: input.hasOpenChangeRequest ?? false,
  }

  if (input.existingProductId) {
    const { data: updated, error } = await supabase
      .from('products')
      .update({ ...productRow, ...governanceFields })
      .eq('id', input.existingProductId)
      .select(PRODUCT_SELECT)
      .single()

    if (error || !updated) {
      throw new ProductGovernanceError(error?.message || 'Produkt konnte nicht aktualisiert werden.')
    }

    const snapshot = JSON.parse(JSON.stringify(updated)) as Record<string, unknown>

    return {
      product: mapProductRow(updated as unknown as ProductRow),
      snapshot,
    }
  }

  const { data: inserted, error } = await supabase
    .from('products')
    .insert({
      ...productRow,
      category: 'fertilization',
      default_unit: productRow.recommended_rate_unit ?? 'g/m²',
      ...governanceFields,
    })
    .select(PRODUCT_SELECT)
    .single()

  if (error || !inserted) {
    throw new ProductGovernanceError(error?.message || 'Produkt konnte nicht veröffentlicht werden.')
  }

  const snapshot = JSON.parse(JSON.stringify(inserted)) as Record<string, unknown>

  return {
    product: mapProductRow(inserted as unknown as ProductRow),
    snapshot,
  }
}

export async function setProductOpenChangeRequest(
  supabase: SupabaseClient,
  productId: string,
  hasOpenChangeRequest: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ has_open_change_request: hasOpenChangeRequest })
    .eq('id', productId)

  if (error) {
    throw new ProductGovernanceError(error?.message || 'Produkt-Flag konnte nicht gesetzt werden.')
  }
}

export async function loadPreviousProductSnapshot(
  supabase: SupabaseClient,
  productId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('product_versions')
    .select('snapshot')
    .eq('product_id', productId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new ProductGovernanceError(error.message)
  }

  return (data?.snapshot as Record<string, unknown> | undefined) ?? null
}

export async function loadNextProductVersionNumber(
  supabase: SupabaseClient,
  productId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('products')
    .select('current_version')
    .eq('id', productId)
    .single()

  if (error || !data) {
    throw new ProductGovernanceError('Produktversion konnte nicht ermittelt werden.')
  }

  return Number(data.current_version ?? 0) + 1
}
