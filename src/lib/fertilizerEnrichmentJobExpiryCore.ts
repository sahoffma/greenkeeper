import type { FertilizerEnrichmentJob } from '../types/fertilizerEnrichmentOrchestration'

export class FertilizerEnrichmentJobExpiryError extends Error {
  readonly kind: 'invalid_expires_at' | 'expired'

  constructor(kind: 'invalid_expires_at' | 'expired', message: string) {
    super(message)
    this.name = 'FertilizerEnrichmentJobExpiryError'
    this.kind = kind
  }
}

export function assertFertilizerEnrichmentJobNotExpired(
  job: FertilizerEnrichmentJob,
  now: string,
): void {
  const expiresAt = job.expiresAt
  if (typeof expiresAt !== 'string' || !expiresAt.trim()) {
    throw new FertilizerEnrichmentJobExpiryError(
      'invalid_expires_at',
      'job.expiresAt is missing or invalid.',
    )
  }

  const expiresAtMs = Date.parse(expiresAt)
  const nowMs = Date.parse(now)
  if (!Number.isFinite(expiresAtMs) || !Number.isFinite(nowMs)) {
    throw new FertilizerEnrichmentJobExpiryError(
      'invalid_expires_at',
      'job.expiresAt is missing or invalid.',
    )
  }

  if (expiresAtMs <= nowMs) {
    throw new FertilizerEnrichmentJobExpiryError('expired', 'Enrichment job has expired.')
  }
}
