export type FertilizerEnrichmentSourceAccessScope =
  | {
      kind: 'authenticated_user'
      userId: string
    }
  | {
      kind: 'session'
      sessionAccessHash: string
    }

let activeScope: FertilizerEnrichmentSourceAccessScope | null = null

export function runWithFertilizerEnrichmentSourceAccessScope<T>(
  scope: FertilizerEnrichmentSourceAccessScope,
  fn: () => T,
): T {
  const previous = activeScope
  activeScope = scope
  try {
    return fn()
  } finally {
    activeScope = previous
  }
}

export async function runWithFertilizerEnrichmentSourceAccessScopeAsync<T>(
  scope: FertilizerEnrichmentSourceAccessScope,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = activeScope
  activeScope = scope
  try {
    return await fn()
  } finally {
    activeScope = previous
  }
}

export function getFertilizerEnrichmentSourceAccessScope(): FertilizerEnrichmentSourceAccessScope | null {
  return activeScope
}

export function buildFertilizerEnrichmentSourceAccessScope(input: {
  userId?: string | null
  sessionId?: string | null
  deriveSessionAccessHash?: (sessionId: string) => string
}): FertilizerEnrichmentSourceAccessScope | null {
  const userId = input.userId?.trim()
  if (userId) {
    return { kind: 'authenticated_user', userId }
  }

  const sessionId = input.sessionId?.trim()
  if (!sessionId || !input.deriveSessionAccessHash) {
    return null
  }

  return {
    kind: 'session',
    sessionAccessHash: input.deriveSessionAccessHash(sessionId),
  }
}
