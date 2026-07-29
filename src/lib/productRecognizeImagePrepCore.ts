import type { PreparedProductRecognizeImage } from '../types/productRecognize'

export const PRODUCT_RECOGNIZE_MAX_INPUT_BYTES = 8 * 1024 * 1024
export const PRODUCT_RECOGNIZE_MAX_PROCESSED_BYTES = 4 * 1024 * 1024
export const PRODUCT_RECOGNIZE_MAX_IMAGE_DIMENSION = 1600
export const PRODUCT_RECOGNIZE_JPEG_QUALITY = 82

export const SUPPORTED_INPUT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export const HEIC_MIME_TYPES = new Set(['image/heic', 'image/heif'])

export class ProductRecognizeImagePrepError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'ProductRecognizeImagePrepError'
    this.statusCode = statusCode
  }
}

function estimateBase64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

function normalizeMimeType(mimeType: string, fileName?: string): string {
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

export function isSupportedInputMimeType(mimeType: string): boolean {
  return SUPPORTED_INPUT_MIME_TYPES.includes(
    mimeType.toLowerCase() as (typeof SUPPORTED_INPUT_MIME_TYPES)[number],
  )
}

async function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  const heicConvert = (await import('heic-convert')).default
  const converted = await heicConvert({
    buffer,
    format: 'JPEG',
    quality: 0.92,
  })

  return Buffer.from(converted)
}

export interface OptimizeImageBufferResult {
  buffer: Buffer
  originalWidth: number | null
  originalHeight: number | null
  processedWidth: number | null
  processedHeight: number | null
  compressionMs: number
}

export async function optimizeImageBuffer(inputBuffer: Buffer): Promise<OptimizeImageBufferResult> {
  const sharp = (await import('sharp')).default
  const startedAt = Date.now()
  const metadata = await sharp(inputBuffer).metadata()
  const originalWidth = metadata.width ?? null
  const originalHeight = metadata.height ?? null

  let pipeline = sharp(inputBuffer, { failOn: 'none' }).rotate()

  if (
    originalWidth != null &&
    originalHeight != null &&
    Math.max(originalWidth, originalHeight) > PRODUCT_RECOGNIZE_MAX_IMAGE_DIMENSION
  ) {
    pipeline = pipeline.resize({
      width: PRODUCT_RECOGNIZE_MAX_IMAGE_DIMENSION,
      height: PRODUCT_RECOGNIZE_MAX_IMAGE_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
  }

  const buffer = await pipeline
    .jpeg({ quality: PRODUCT_RECOGNIZE_JPEG_QUALITY, mozjpeg: true })
    .toBuffer()

  const processedMeta = await sharp(buffer).metadata()

  return {
    buffer,
    originalWidth,
    originalHeight,
    processedWidth: processedMeta.width ?? null,
    processedHeight: processedMeta.height ?? null,
    compressionMs: Date.now() - startedAt,
  }
}

export interface PrepareProductRecognizeImageInput {
  base64: string
  mimeType: string
  fileName?: string
}

export async function prepareProductRecognizeImage(
  input: PrepareProductRecognizeImageInput,
): Promise<PreparedProductRecognizeImage> {
  const base64 = input.base64.replace(/^data:[^;]+;base64,/, '')
  const originalBytes = estimateBase64Bytes(base64)
  const originalFormat = normalizeMimeType(input.mimeType, input.fileName)

  if (originalBytes < 32) {
    throw new ProductRecognizeImagePrepError('Die Bilddatei ist ungültig oder leer.')
  }

  if (originalBytes > PRODUCT_RECOGNIZE_MAX_INPUT_BYTES) {
    throw new ProductRecognizeImagePrepError(
      'Das Foto ist zu groß (maximal 8 MB vor der Verarbeitung).',
    )
  }

  if (!isSupportedInputMimeType(originalFormat)) {
    throw new ProductRecognizeImagePrepError(
      'Nur JPEG-, PNG-, WebP- oder HEIC-Fotos werden unterstützt.',
    )
  }

  const conversionStartedAt = Date.now()
  let inputBuffer = Buffer.from(base64, 'base64')
  let converted = false

  if (HEIC_MIME_TYPES.has(originalFormat)) {
    try {
      inputBuffer = await convertHeicToJpeg(inputBuffer)
      converted = true
    } catch (error) {
      if (error instanceof ProductRecognizeImagePrepError) {
        throw error
      }

      throw new ProductRecognizeImagePrepError(
        'Das HEIC-Foto konnte nicht verarbeitet werden. Bitte versuche ein anderes Foto.',
      )
    }
  }

  const conversionMs = Date.now() - conversionStartedAt

  let optimized: OptimizeImageBufferResult

  try {
    optimized = await optimizeImageBuffer(inputBuffer)
  } catch {
    throw new ProductRecognizeImagePrepError(
      'Das Foto konnte nicht für die Erkennung vorbereitet werden.',
    )
  }

  if (optimized.buffer.length > PRODUCT_RECOGNIZE_MAX_PROCESSED_BYTES) {
    throw new ProductRecognizeImagePrepError(
      'Das verarbeitete Foto ist zu groß (maximal 4 MB nach der Verarbeitung).',
    )
  }

  return {
    base64: optimized.buffer.toString('base64'),
    mimeType: 'image/jpeg',
    prep: {
      originalFormat,
      processedFormat: 'image/jpeg',
      originalBytes,
      processedBytes: optimized.buffer.length,
      originalWidth: optimized.originalWidth,
      originalHeight: optimized.originalHeight,
      processedWidth: optimized.processedWidth,
      processedHeight: optimized.processedHeight,
      conversionMs,
      compressionMs: optimized.compressionMs,
      converted,
    },
  }
}
