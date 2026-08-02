const SESSION_ACCESS_HASH_HEX_PATTERN = /^[0-9a-f]{64}$/

export function isValidSessionAccessHash(value: string): boolean {
  return SESSION_ACCESS_HASH_HEX_PATTERN.test(value)
}
