function normalizedText(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function normalizePackageSizeUnit(unit: string | null | undefined): string | null {
  const normalized = normalizedText(unit)?.toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized === 'kilogram' || normalized === 'kilogramm' || normalized === 'kg') {
    return 'kg'
  }

  if (normalized === 'gram' || normalized === 'gramm' || normalized === 'g') {
    return 'g'
  }

  if (normalized === 'liter' || normalized === 'litre' || normalized === 'l') {
    return 'l'
  }

  if (normalized === 'milliliter' || normalized === 'millilitre' || normalized === 'ml') {
    return 'ml'
  }

  return normalized
}

export function parsePackageSizeFromRawText(raw: string | null | undefined): {
  value: number | null
  unit: string | null
} {
  const trimmed = normalizedText(raw)
  if (!trimmed) {
    return { value: null, unit: null }
  }

  const match = /^(\d+(?:[.,]\d+)?)\s*([a-zA-ZäöüÄÖÜ]+)?/u.exec(trimmed)
  if (!match) {
    return { value: null, unit: null }
  }

  const parsed = Number(match[1].replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { value: null, unit: null }
  }

  const unitToken = match[2]?.trim().toLowerCase() ?? null
  if (!unitToken) {
    return { value: parsed, unit: null }
  }

  return {
    value: parsed,
    unit: normalizePackageSizeUnit(unitToken) ?? unitToken,
  }
}

const PACKAGE_SIZE_FRAGMENT_PATTERN =
  /\b(\d+(?:[.,]\d+)?)\s*(kg|g|kilogramm?|gramm?|l|liter|litre|ml|milliliter)\b/giu

export function extractPackageSizeFromTextFragments(fragments: string[]): {
  value: number | null
  unit: string | null
} {
  for (const fragment of fragments) {
    if (typeof fragment !== 'string') {
      continue
    }

    const matches = [...fragment.matchAll(PACKAGE_SIZE_FRAGMENT_PATTERN)]
    if (matches.length === 0) {
      continue
    }

    const lastMatch = matches[matches.length - 1]
    const parsed = parsePackageSizeFromRawText(`${lastMatch[1]} ${lastMatch[2]}`)
    if (parsed.value != null) {
      return parsed
    }
  }

  return { value: null, unit: null }
}
