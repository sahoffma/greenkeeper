import type {
  RateLimitCheckResult,
  SpamCheckResult,
} from '../types/productGovernance'
import { DEFAULT_ABUSE_CONFIG } from '../types/productGovernance'
import { normalizeProductLookupKey } from './productGovernanceCore'

export interface UserSubmissionProfile {
  reputationScore: number
  isBlacklisted: boolean
}

export interface RateLimitWindow {
  submissionCount: number
  changeRequestCount: number
}

const SPAM_PATTERNS = [
  /https?:\/\//i,
  /\b(casino|viagra|crypto|nft)\b/i,
  /(.)\1{6,}/,
]

export function checkUserCanSubmit(profile: UserSubmissionProfile, config = DEFAULT_ABUSE_CONFIG): {
  allowed: boolean
  reason: string | null
} {
  if (profile.isBlacklisted) {
    return { allowed: false, reason: 'Der Account ist gesperrt.' }
  }

  if (profile.reputationScore < config.minReputationScore) {
    return {
      allowed: false,
      reason: `Reputation zu niedrig (${profile.reputationScore}). Mindestens ${config.minReputationScore} erforderlich.`,
    }
  }

  return { allowed: true, reason: null }
}

export function checkRateLimit(
  window: RateLimitWindow,
  kind: 'submission' | 'change_request',
  config = DEFAULT_ABUSE_CONFIG,
): RateLimitCheckResult {
  const submissionsInWindow = window.submissionCount
  const changeRequestsInWindow = window.changeRequestCount

  if (kind === 'submission' && submissionsInWindow >= config.maxSubmissionsPerHour) {
    return {
      allowed: false,
      reason: `Stündliches Limit für Produktvorschläge erreicht (${config.maxSubmissionsPerHour}).`,
      submissionsInWindow,
      changeRequestsInWindow,
    }
  }

  if (kind === 'change_request' && changeRequestsInWindow >= config.maxChangeRequestsPerHour) {
    return {
      allowed: false,
      reason: `Stündliches Limit für Änderungsvorschläge erreicht (${config.maxChangeRequestsPerHour}).`,
      submissionsInWindow,
      changeRequestsInWindow,
    }
  }

  return {
    allowed: true,
    reason: null,
    submissionsInWindow,
    changeRequestsInWindow,
  }
}

export function detectSpamText(text: string): SpamCheckResult {
  const reasons: string[] = []
  let score = 0

  const trimmed = text.trim()

  if (trimmed.length < 3) {
    reasons.push('Text zu kurz.')
    score += 30
  }

  if (trimmed.length > 5000) {
    reasons.push('Text ungewöhnlich lang.')
    score += 20
  }

  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(trimmed)) {
      reasons.push(`Verdächtiges Muster: ${pattern.source}`)
      score += 25
    }
  }

  const words = normalizeProductLookupKey(trimmed).split(' ').filter(Boolean)
  const uniqueRatio = words.length === 0 ? 0 : new Set(words).size / words.length

  if (words.length >= 8 && uniqueRatio < 0.35) {
    reasons.push('Viele wiederholte Wörter.')
    score += 20
  }

  return {
    flagged: score >= 40,
    score: Math.min(100, score),
    reasons,
  }
}

export function getRateLimitWindowStart(now = new Date()): string {
  const start = new Date(now)
  start.setMinutes(0, 0, 0)
  return start.toISOString()
}
