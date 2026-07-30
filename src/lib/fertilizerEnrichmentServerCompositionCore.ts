import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { FertilizerEnrichmentAuthValidator } from './fertilizerEnrichmentAccessContextResolverCore'
import { createFertilizerEnrichmentOrchestrationDependencies } from './fertilizerEnrichmentAdapterCompositionCore'
import type { FertilizerEnrichmentAdapterCompositionDependencies } from './fertilizerEnrichmentAdapterCompositionCore'
import { createPersistentFertilizerEnrichmentJobRepository } from './fertilizerEnrichmentJobRepositoryPersistentCore'
import { createFertilizerEnrichmentRetentionPolicy } from './fertilizerEnrichmentRetentionPolicyCore'
import { createDeriveSessionAccessHash } from './fertilizerEnrichmentSessionAccessHashCore'
import { createFertilizerEnrichmentSessionCookieManager } from './fertilizerEnrichmentSessionCookieCore'
import { createFertilizerEnrichmentSupabaseSourceStorage } from './fertilizerEnrichmentSupabaseSourceStorageCore'
import { createFertilizerEnrichmentStoredSourceAdapterDependencies } from './fertilizerEnrichmentStoredSourceResolverCore'
import {
  loadFertilizerEnrichmentServerEnvironment,
  type FertilizerEnrichmentServerEnvironment,
} from './fertilizerEnrichmentServerEnvironmentCore'
import { createFertilizerEnrichmentProductionHttpHandlers } from './fertilizerEnrichmentServerTransportCore'
import { createFertilizerEnrichmentServerService } from './fertilizerEnrichmentServerServiceCore'

export interface FertilizerEnrichmentServerRuntime {
  handlers: ReturnType<typeof createFertilizerEnrichmentProductionHttpHandlers>
  isCompositionEnabled: () => boolean
  environment: FertilizerEnrichmentServerEnvironment
}

export interface FertilizerEnrichmentServerRuntimeDependencies {
  environment?: FertilizerEnrichmentServerEnvironment
  supabase?: SupabaseClient
  authValidator?: FertilizerEnrichmentAuthValidator
  adapterDependencies?: Partial<FertilizerEnrichmentAdapterCompositionDependencies>
  now?: () => string
}

export function createSupabaseServiceRoleClientFromEnvironment(
  environment: Pick<FertilizerEnrichmentServerEnvironment, 'supabaseUrl' | 'supabaseServiceRoleKey'>,
): SupabaseClient {
  return createClient(environment.supabaseUrl, environment.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export function createSupabaseAuthValidator(
  supabase: SupabaseClient,
): FertilizerEnrichmentAuthValidator {
  return {
    async validateBearerToken(token: string): Promise<string | null> {
      const { data, error } = await supabase.auth.getUser(token)
      if (error || !data.user) {
        return null
      }

      return data.user.id
    },
  }
}

export function createFertilizerEnrichmentServerRuntime(
  overrides: FertilizerEnrichmentServerRuntimeDependencies = {},
): FertilizerEnrichmentServerRuntime {
  const environment = overrides.environment ?? loadFertilizerEnrichmentServerEnvironment()
  const supabase =
    overrides.supabase ??
    createSupabaseServiceRoleClientFromEnvironment(environment)
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
  const repository = createPersistentFertilizerEnrichmentJobRepository({
    supabase,
    deriveSessionAccessHash,
  })
  const resolveExpiresAt = createFertilizerEnrichmentRetentionPolicy(environment.retention)
  const adapterDependencies =
    overrides.adapterDependencies ??
    (environment.sourceStorage
      ? createFertilizerEnrichmentStoredSourceAdapterDependencies(
          createFertilizerEnrichmentSupabaseSourceStorage(supabase, environment.sourceStorage),
        )
      : {})
  const orchestrationDependencies = createFertilizerEnrichmentOrchestrationDependencies(
    adapterDependencies,
  )

  const service = createFertilizerEnrichmentServerService({
    repository,
    resolveOrchestrationDependencies: () => orchestrationDependencies,
    resolveExpiresAt,
    now: overrides.now,
  })

  const handlers = createFertilizerEnrichmentProductionHttpHandlers({
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
