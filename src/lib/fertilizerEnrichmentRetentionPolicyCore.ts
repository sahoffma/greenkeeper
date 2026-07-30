import type { FertilizerEnrichmentJob } from '../types/fertilizerEnrichmentOrchestration'

/** GA-014 §14.12 default retention parameters (explicit configuration required in production). */
export interface FertilizerEnrichmentRetentionPolicyConfig {
  continuableDays: number
  sessionMaxHours: number
  terminalDays: number
  intakeReadyDays: number
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new Error('Timestamp must be a valid ISO-8601 string.')
  }

  return parsed
}

function addMilliseconds(isoTimestamp: string, milliseconds: number): string {
  return new Date(parseTimestamp(isoTimestamp) + milliseconds).toISOString()
}

function minIsoTimestamp(left: string, right: string): string {
  return parseTimestamp(left) <= parseTimestamp(right) ? left : right
}

export function createFertilizerEnrichmentRetentionPolicy(
  config: FertilizerEnrichmentRetentionPolicyConfig,
) {
  return function resolveExpiresAt(job: FertilizerEnrichmentJob, now: string): string {
    if (job.expiresAt && parseTimestamp(job.expiresAt) <= parseTimestamp(now)) {
      return job.expiresAt
    }

    const status = job.result.status
    let candidate: string

    if (status === 'needs_input') {
      candidate = addMilliseconds(now, config.continuableDays * 24 * 60 * 60 * 1000)
    } else if (status === 'intake_ready') {
      candidate = addMilliseconds(job.updatedAt, config.intakeReadyDays * 24 * 60 * 60 * 1000)
    } else if (status === 'failed' || status === 'cancelled' || status === 'timed_out') {
      candidate = addMilliseconds(job.updatedAt, config.terminalDays * 24 * 60 * 60 * 1000)
    } else {
      candidate = addMilliseconds(job.createdAt, config.continuableDays * 24 * 60 * 60 * 1000)
    }

    if (job.accessContext.kind === 'session') {
      const sessionCap = addMilliseconds(
        job.createdAt,
        config.sessionMaxHours * 60 * 60 * 1000,
      )
      candidate = minIsoTimestamp(candidate, sessionCap)
    }

    return candidate
  }
}
