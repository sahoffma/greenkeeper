import type { SupabaseClient } from '@supabase/supabase-js'
import type { FertilizerEnrichmentAuthValidator } from './fertilizerEnrichmentAccessContextResolverCore'
import { createPersistentFertilizerEnrichmentJobRepository } from './fertilizerEnrichmentJobRepositoryPersistentCore'
import { createDeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import { createFertilizerEnrichmentSessionCookieManager } from './fertilizerEnrichmentSessionCookieCore'
import {
  createSupabaseAuthValidator,
  createSupabaseServiceRoleClientFromEnvironment,
} from './fertilizerEnrichmentServerCompositionCore'
import {
  loadFertilizerEnrichmentServerEnvironment,
  type FertilizerEnrichmentServerEnvironment,
} from './fertilizerEnrichmentServerEnvironmentCore'
import { createPersistentFertilizerProductProfileRepository } from './fertilizerProductProfileRepositoryMappingCore'
import { createFertilizerProductProfileSaveProductionHttpHandlers } from './fertilizerProductProfileSaveTransportCore'
import { createFertilizerProductProfileSaveServerService } from './fertilizerProductProfileSaveServerServiceCore'

export interface FertilizerProductProfileSaveServerRuntime {
  handlers: ReturnType<typeof createFertilizerProductProfileSaveProductionHttpHandlers>
  isCompositionEnabled: () => boolean
  environment: FertilizerEnrichmentServerEnvironment
}

export interface FertilizerProductProfileSaveServerRuntimeDependencies {
  environment?: FertilizerEnrichmentServerEnvironment
  supabase?: SupabaseClient
  authValidator?: FertilizerEnrichmentAuthValidator
  now?: () => string
}

export function createFertilizerProductProfileSaveServerRuntime(
  overrides: FertilizerProductProfileSaveServerRuntimeDependencies = {},
): FertilizerProductProfileSaveServerRuntime {
  const environment = overrides.environment ?? loadFertilizerEnrichmentServerEnvironment()
  const supabase =
    overrides.supabase ?? createSupabaseServiceRoleClientFromEnvironment(environment)
  const authValidator =
    overrides.authValidator ?? createSupabaseAuthValidator(supabase)
  const deriveSessionAccessHash = createDeriveSessionAccessHash(
    environment.sessionAccessHmacSecret,
  )
  const sessionCookieManager = createFertilizerEnrichmentSessionCookieManager(
    environment.sessionCookieSigningSecret,
    {
      maxAgeSeconds: environment.sessionMaxAgeSeconds,
      secure: environment.sessionCookieSecure,
    },
  )
  const enrichmentJobRepository = createPersistentFertilizerEnrichmentJobRepository({
    supabase,
    deriveSessionAccessHash,
  })
  const productProfileRepository = createPersistentFertilizerProductProfileRepository({
    supabase,
    deriveSessionAccessHash,
  })

  const service = createFertilizerProductProfileSaveServerService({
    enrichmentJobRepository,
    productProfileRepository,
    deriveSessionAccessHash,
    now: overrides.now,
  })

  const handlers = createFertilizerProductProfileSaveProductionHttpHandlers({
    service,
    accessContextResolver: {
      authValidator,
      sessionCookieManager,
    },
    deriveSessionAccessHash,
    isCompositionEnabled: () => true,
  })

  return {
    handlers,
    isCompositionEnabled: () => true,
    environment,
  }
}
