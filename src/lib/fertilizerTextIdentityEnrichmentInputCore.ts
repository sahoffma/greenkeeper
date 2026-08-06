import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import { buildRecognitionIdentityFingerprint } from './fertilizerInventoryCore'
import { resolveRecognitionManufacturer } from './fertilizerRecognitionEnrichmentBasisCore'

export interface FertilizerTextIdentityEnrichmentInput {
  manufacturer: string
  productLine?: string | null
  officialName: string
  variant?: string | null
  productForm?: 'granular' | 'liquid' | null
  npk?: {
    nitrogen: number
    phosphate: number
    potash: number
  } | null
  packageSizeValue?: number | null
  packageSizeUnit?: string | null
}

function buildIdentity(input: FertilizerTextIdentityEnrichmentInput): FertilizerEnrichmentIdentity {
  const fingerprint = buildRecognitionIdentityFingerprint({
    brand: input.manufacturer,
    productLine: input.productLine ?? null,
    productName: input.officialName,
    variant: input.variant ?? null,
  })

  if (!fingerprint?.trim()) {
    throw new Error('Das Produkt konnte nicht eindeutig für die Anreicherung bestimmt werden.')
  }

  return {
    manufacturer: resolveRecognitionManufacturer({
      manufacturer: input.manufacturer,
      brand: input.manufacturer,
    }),
    officialName: input.officialName.trim(),
    productLine: input.productLine?.trim() ?? null,
    variant: input.variant?.trim() ?? null,
    identityFingerprint: fingerprint.trim(),
    identityConfidence: 1,
    hasIdentityAmbiguity: false,
  }
}

export function buildFertilizerEnrichmentOrchestrationInputFromTextIdentity(
  input: FertilizerTextIdentityEnrichmentInput,
  options: { enrichmentIdempotencyKey: string },
): FertilizerEnrichmentOrchestrationInput {
  const identity = buildIdentity(input)

  return {
    objectCategory: 'fertilizer',
    identity,
    allowedInputChannels: ['capture_flow'],
    sourceHints: [],
    captureRecognitionPackagingBasis:
      input.npk || input.productForm || input.packageSizeValue != null
        ? {
            sourceId: 'textIdentityBasis',
            manufacturer: identity.manufacturer,
            officialName: identity.officialName,
            productLine: identity.productLine ?? null,
            variant: identity.variant,
            productForm: input.productForm ?? null,
            npk: input.npk ?? null,
            packageSizeValue: input.packageSizeValue ?? null,
            packageSizeUnit: input.packageSizeUnit ?? null,
          }
        : undefined,
    idempotencyKey: options.enrichmentIdempotencyKey,
    captureEnrichmentInputBuilderPath: 'canonical_capture',
  }
}
