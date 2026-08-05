export const RECOGNITION_SUPPORTED_INPUT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const RECOGNITION_HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif'])

const HEIC_CONTAINER_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'mif1', 'msf1'])

export function detectHeicContainerFromBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false
  }

  const containerType = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7])
  if (containerType !== 'ftyp') {
    return false
  }

  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase()
  return HEIC_CONTAINER_BRANDS.has(brand)
}

export function normalizeRecognitionInputMimeType(
  mimeType: string,
  fileName?: string,
): string {
  const trimmed = mimeType.trim().toLowerCase()

  if (trimmed && trimmed !== 'application/octet-stream') {
    return trimmed
  }

  const lowerName = fileName?.toLowerCase() ?? ''

  if (lowerName.endsWith('.heic')) return 'image/heic'
  if (lowerName.endsWith('.heif')) return 'image/heif'
  if (lowerName.endsWith('.png')) return 'image/png'
  if (lowerName.endsWith('.webp')) return 'image/webp'

  return 'image/jpeg'
}

export function isSupportedRecognitionInputMimeType(mimeType: string): boolean {
  return RECOGNITION_SUPPORTED_INPUT_MIME_TYPES.includes(
    mimeType.toLowerCase() as (typeof RECOGNITION_SUPPORTED_INPUT_MIME_TYPES)[number],
  )
}

export function isHeicOrHeifRecognitionMimeType(mimeType: string): boolean {
  return RECOGNITION_HEIC_MIME_TYPES.has(mimeType.toLowerCase())
}

export function resolveRecognitionUploadMimeType(input: {
  mimeType?: string | null
  fileName?: string | null
  bytes?: Uint8Array | null
}): string {
  const normalized = normalizeRecognitionInputMimeType(
    input.mimeType?.trim() ?? '',
    input.fileName ?? undefined,
  )

  if (input.bytes && detectHeicContainerFromBytes(input.bytes)) {
    return 'image/heic'
  }

  return normalized
}

export function shouldSkipBrowserSideRecognitionDecode(input: {
  mimeType: string
  fileName?: string
  bytes?: Uint8Array | null
}): boolean {
  const resolved = resolveRecognitionUploadMimeType(input)
  return isHeicOrHeifRecognitionMimeType(resolved)
}
