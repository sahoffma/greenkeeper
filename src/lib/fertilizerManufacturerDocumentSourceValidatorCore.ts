export type FertilizerManufacturerDocumentSourceInvalidReason =
  | 'invalid_url'
  | 'unsupported_protocol'
  | 'embedded_credentials'
  | 'local_or_private_host'

export type FertilizerManufacturerDocumentSourceValidationResult =
  | { status: 'valid'; url: URL; normalizedUrl: string }
  | { status: 'invalid'; reason: FertilizerManufacturerDocumentSourceInvalidReason }

function isPrivateOrLocalHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '')

  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true
  }

  if (
    normalized === '::1' ||
    normalized.startsWith('fe80:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  ) {
    return true
  }

  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized)
  if (!ipv4Match) {
    return false
  }

  const octets = ipv4Match.slice(1).map((part) => Number(part))
  if (octets.some((octet) => octet > 255)) {
    return true
  }

  const [a, b] = octets
  if (a === 127 || a === 0 || a === 10) {
    return true
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true
  }
  if (a === 192 && b === 168) {
    return true
  }
  if (a === 169 && b === 254) {
    return true
  }

  return false
}

export function validateFertilizerManufacturerDocumentSource(
  sourceUrl: string,
): FertilizerManufacturerDocumentSourceValidationResult {
  const trimmed = sourceUrl.trim()
  if (!trimmed) {
    return { status: 'invalid', reason: 'invalid_url' }
  }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { status: 'invalid', reason: 'invalid_url' }
  }

  if (parsed.protocol !== 'https:') {
    return { status: 'invalid', reason: 'unsupported_protocol' }
  }

  if (parsed.username || parsed.password) {
    return { status: 'invalid', reason: 'embedded_credentials' }
  }

  if (isPrivateOrLocalHost(parsed.hostname)) {
    return { status: 'invalid', reason: 'local_or_private_host' }
  }

  return {
    status: 'valid',
    url: parsed,
    normalizedUrl: parsed.toString(),
  }
}
