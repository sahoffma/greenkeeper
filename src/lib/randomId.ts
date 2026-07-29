export interface RandomIdCrypto {
  randomUUID?: () => string
  getRandomValues?: (array: Uint8Array) => Uint8Array
}

function formatUuidFromBytes(bytes: Uint8Array): string {
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function createRandomIdFromGetRandomValues(getRandomValues: (array: Uint8Array) => Uint8Array): string {
  const bytes = new Uint8Array(16)
  getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  return formatUuidFromBytes(bytes)
}

function createRandomIdFallback(): string {
  const timePart = Date.now().toString(16)
  const randomPart = Math.random().toString(16).slice(2, 10)
  const extraPart = Math.random().toString(16).slice(2, 10)

  return `${timePart}-${randomPart}-${extraPart}`
}

/**
 * Erzeugt eine kollisionsarme, dateipfadtaugliche ID.
 * Nutzt randomUUID wenn verfügbar, sonst getRandomValues, sonst Zeitstempel + Zufall.
 */
export function createRandomId(cryptoLike: RandomIdCrypto = globalThis.crypto): string {
  if (typeof cryptoLike.randomUUID === 'function') {
    return cryptoLike.randomUUID()
  }

  if (typeof cryptoLike.getRandomValues === 'function') {
    return createRandomIdFromGetRandomValues(cryptoLike.getRandomValues.bind(cryptoLike))
  }

  return createRandomIdFallback()
}

export function isPathSafeRandomId(id: string): boolean {
  return id.length > 0 && /^[0-9a-f-]+$/i.test(id)
}
