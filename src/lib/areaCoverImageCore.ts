export const AREA_COVER_BUCKET = 'lawn-images' as const
export const AREA_COVER_MAX_EDGE_PX = 2000
export const AREA_COVER_JPEG_QUALITY = 0.82
export const AREA_COVER_MAX_BYTES = 3 * 1024 * 1024

export const AREA_COVER_UNSUPPORTED_FORMAT_MESSAGE =
  'Dieses Bildformat kann derzeit nicht verwendet werden. Bitte wähle ein anderes Foto.'

export const AREA_COVER_PROCESSING_FAILED_MESSAGE =
  'Das Foto konnte nicht verarbeitet werden. Bitte versuche es erneut.'

export const AREA_UPDATE_ERROR_MESSAGE =
  'Die Änderungen konnten nicht gespeichert werden. Bitte versuche es erneut.'

export const AREA_COVER_UPLOAD_ERROR_MESSAGE =
  'Das Foto konnte nicht gespeichert werden. Bitte versuche es erneut.'

import { createRandomId } from './randomId'

const SUPPORTED_INPUT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

export function isSupportedCoverInputType(type: string): boolean {
  return SUPPORTED_INPUT_TYPES.has(type.toLowerCase())
}

export function buildAreaCoverStoragePath(
  userId: string,
  areaId: string,
  randomId = createRandomId(),
): string {
  return `${userId}/${areaId}/cover-${randomId}.jpg`
}

export function validateAreaCoverStoragePath(
  userId: string,
  areaId: string,
  path: string,
): boolean {
  const pattern = new RegExp(
    `^${userId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/${areaId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/cover-[0-9a-f-]+\\.jpg$`,
  )

  return pattern.test(path)
}

export function calculateCoverDimensions(
  width: number,
  height: number,
  maxEdge = AREA_COVER_MAX_EDGE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height)

  if (longest <= maxEdge) {
    return { width, height }
  }

  const scale = maxEdge / longest

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export async function processCoverImageFile(file: File): Promise<Blob> {
  if (!isSupportedCoverInputType(file.type)) {
    throw new Error(AREA_COVER_UNSUPPORTED_FORMAT_MESSAGE)
  }

  let bitmap: ImageBitmap

  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error(AREA_COVER_UNSUPPORTED_FORMAT_MESSAGE)
  }

  try {
    const { width, height } = calculateCoverDimensions(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error(AREA_COVER_PROCESSING_FAILED_MESSAGE)
    }

    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', AREA_COVER_JPEG_QUALITY)
    })

    if (!blob) {
      throw new Error(AREA_COVER_PROCESSING_FAILED_MESSAGE)
    }

    if (blob.size > AREA_COVER_MAX_BYTES) {
      throw new Error(AREA_COVER_PROCESSING_FAILED_MESSAGE)
    }

    return blob
  } finally {
    bitmap.close()
  }
}
