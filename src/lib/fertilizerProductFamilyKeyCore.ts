const UNICODE_DASH_PATTERN = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D-]/g

export function normalizeProductFamilyKeyComponent(value: string | null | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(UNICODE_DASH_PATTERN, ' ')
    .replace(/\s+/g, ' ')
}

export function normalizeProductFamilyKey(value: string | null | undefined): string | null {
  const normalized = (value ?? '')
    .split('|')
    .map((part) => normalizeProductFamilyKeyComponent(part))
    .filter(Boolean)
    .join('|')

  return normalized.length > 0 ? normalized : null
}

export function productFamilyKeysEquivalent(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeProductFamilyKey(left)
  const normalizedRight = normalizeProductFamilyKey(right)

  if (!normalizedLeft || !normalizedRight) {
    return false
  }

  return normalizedLeft === normalizedRight
}
