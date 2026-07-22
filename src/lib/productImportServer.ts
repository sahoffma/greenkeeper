import { importProductViaGovernance } from './productGovernanceService'
import { createSupabaseAdminClient } from './supabaseAdmin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProductImportInput, ProductImportResult } from '../types/product'
import { ProductGovernanceError } from './productGovernanceCore'

function resolveGovernanceActorId(explicitActorId?: string): string {
  const actorId =
    explicitActorId?.trim() ||
    process.env.GOVERNANCE_SYSTEM_ACTOR_ID?.trim() ||
    process.env.GOVERNANCE_ADMIN_USER_ID?.trim()

  if (!actorId) {
    throw new ProductGovernanceError(
      'Für Admin-Imports ist GOVERNANCE_ADMIN_USER_ID (oder actorId) erforderlich.',
    )
  }

  return actorId
}

/**
 * @deprecated Nutze importProductViaGovernance() aus productGovernanceService.
 * Leitet auf den zentralen Governance-Pfad um (autoApprove für Admin-Seeds).
 */
export async function importProductWithServiceRole(
  input: ProductImportInput,
  supabase: SupabaseClient = createSupabaseAdminClient(),
  options?: { actorId?: string; autoApprove?: boolean },
): Promise<ProductImportResult> {
  const actorId = resolveGovernanceActorId(options?.actorId)
  const result = await importProductViaGovernance(
    {
      payload: input,
      actorId,
      autoApprove: options?.autoApprove ?? true,
      submissionChannel: 'admin_seed',
      reviewNotes: 'Admin-Seed über Governance-Service.',
    },
    supabase,
  )

  if (!result.approved || !result.product) {
    throw new ProductGovernanceError(
      'Produkt konnte nicht über den Governance-Workflow veröffentlicht werden.',
    )
  }

  return {
    product: result.product,
    created: (result.version?.versionNumber ?? 1) === 1,
  }
}
