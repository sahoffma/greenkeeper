import type { PreparedProductRecognizeImage } from '../types/productRecognize'
import {
  detectHeicContainerFromBytes,
  isHeicOrHeifRecognitionMimeType,
  isSupportedRecognitionInputMimeType,
  normalizeRecognitionInputMimeType,
  RECOGNITION_HEIC_MIME_TYPES,
} from './productRecognizeImageInputCore'
import {
  logProductRecognizePipeline,
  logProductRecognizePipelineError,
} from './productRecognizePipelineLogCore'

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

export const HEIC_MIME_TYPES = RECOGNITION_HEIC_MIME_TYPES

export function detectHeicContainerFromBuffer(buffer: Buffer): boolean {
  return detectHeicContainerFromBytes(buffer)
}

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

export function isSupportedInputMimeType(mimeType: string): boolean {
  return isSupportedRecognitionInputMimeType(mimeType)
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

function isJpegBuffer(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8
}

function logSharpOptimizeFailure(error: unknown): void {
  logProductRecognizePipelineError('optimize_image_buffer_failed', {
    message: error instanceof Error ? error.message : String(error),
  })
}

function buildPreparedFromBuffer(input: {
  inputBuffer: Buffer
  effectiveFormat: string
  originalBytes: number
  converted: boolean
  conversionMs: number
  compressionMs?: number
  heicDetected: boolean
  heicRetryUsed: boolean
}): PreparedProductRecognizeImage {
  const processedFormat =
    input.converted || isJpegBuffer(input.inputBuffer) ? 'image/jpeg' : input.effectiveFormat

  if (input.inputBuffer.length > PRODUCT_RECOGNIZE_MAX_PROCESSED_BYTES) {
    throw new ProductRecognizeImagePrepError(
      'Das verarbeitete Foto ist zu groß (maximal 4 MB nach der Verarbeitung).',
    )
  }

  return {
    base64: input.inputBuffer.toString('base64'),
    mimeType: processedFormat === 'image/jpeg' ? 'image/jpeg' : input.effectiveFormat,
    prep: {
      originalFormat: input.effectiveFormat,
      processedFormat,
      originalBytes: input.originalBytes,
      processedBytes: input.inputBuffer.length,
      originalWidth: null,
      originalHeight: null,
      processedWidth: null,
      processedHeight: null,
      conversionMs: input.conversionMs,
      compressionMs: input.compressionMs ?? 0,
      converted: input.converted,
      heicDetected: input.heicDetected,
      heicRetryUsed: input.heicRetryUsed,
    },
  }
}

function canUseOriginalProcessedFallback(input: {
  inputBuffer: Buffer
  effectiveFormat: string
  converted: boolean
}): boolean {
  if (input.converted) {
    return true
  }

  if (input.effectiveFormat === 'image/jpeg' && isJpegBuffer(input.inputBuffer)) {
    return true
  }

  return false
}

function shouldAttemptHeicConversionRetry(input: {
  converted: boolean
  inputBuffer: Buffer
  effectiveFormat: string
}): boolean {
  return !input.converted && !isJpegBuffer(input.inputBuffer) && input.effectiveFormat === 'image/jpeg'
}

async function attemptHeicConversionRetry(buffer: Buffer): Promise<Buffer | null> {
  try {
    return await convertHeicToJpeg(buffer)
  } catch {
    return null
  }
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
  const prepStartedAt = Date.now()
  logProductRecognizePipeline('image_prep_start', {
    declaredMimeType: input.mimeType,
    fileName: input.fileName ?? null,
    base64Length: input.base64.replace(/^data:[^;]+;base64,/, '').length,
  })

  const base64 = input.base64.replace(/^data:[^;]+;base64,/, '')
  const originalBytes = estimateBase64Bytes(base64)
  const originalFormat = normalizeRecognitionInputMimeType(input.mimeType, input.fileName)

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
  let heicRetryUsed = false
  let effectiveFormat = originalFormat
  let heicDetected =
    isHeicOrHeifRecognitionMimeType(effectiveFormat) ||
    detectHeicContainerFromBuffer(inputBuffer)

  if (!isHeicOrHeifRecognitionMimeType(effectiveFormat) && detectHeicContainerFromBuffer(inputBuffer)) {
    effectiveFormat = 'image/heic'
  }

  if (isHeicOrHeifRecognitionMimeType(effectiveFormat)) {
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

  let optimized: OptimizeImageBufferResult | null = null

  try {
    optimized = await optimizeImageBuffer(inputBuffer)
  } catch (sharpError) {
    logSharpOptimizeFailure(sharpError)

    if (
      shouldAttemptHeicConversionRetry({
        converted,
        inputBuffer,
        effectiveFormat,
      })
    ) {
      const retriedBuffer = await attemptHeicConversionRetry(inputBuffer)

      if (retriedBuffer) {
        heicRetryUsed = true
        inputBuffer = retriedBuffer
        converted = true
        effectiveFormat = 'image/heic'
        heicDetected = true

        try {
          optimized = await optimizeImageBuffer(inputBuffer)
        } catch (retrySharpError) {
          logSharpOptimizeFailure(retrySharpError)

          const result = buildPreparedFromBuffer({
            inputBuffer,
            effectiveFormat,
            originalBytes,
            converted,
            conversionMs,
            heicDetected,
            heicRetryUsed,
          })
          logProductRecognizePipeline('image_prep_complete', {
            durationMs: Date.now() - prepStartedAt,
            effectiveFormat: result.prep.originalFormat,
            processedFormat: result.prep.processedFormat,
            originalBytes: result.prep.originalBytes,
            processedBytes: result.prep.processedBytes,
            heicDetected,
            heicRetryUsed,
            converted: result.prep.converted,
          })
          return result
        }
      }
    }

    if (!optimized) {
      if (
        canUseOriginalProcessedFallback({
          inputBuffer,
          effectiveFormat,
          converted,
        })
      ) {
        const result = buildPreparedFromBuffer({
          inputBuffer,
          effectiveFormat,
          originalBytes,
          converted,
          conversionMs,
          heicDetected,
          heicRetryUsed,
        })
        logProductRecognizePipeline('image_prep_complete', {
          durationMs: Date.now() - prepStartedAt,
          effectiveFormat: result.prep.originalFormat,
          processedFormat: result.prep.processedFormat,
          originalBytes: result.prep.originalBytes,
          processedBytes: result.prep.processedBytes,
          heicDetected,
          heicRetryUsed,
          converted: result.prep.converted,
        })
        return result
      }

      throw new ProductRecognizeImagePrepError(
        'Das Foto konnte nicht für die Erkennung vorbereitet werden.',
      )
    }
  }

  if (optimized.buffer.length > PRODUCT_RECOGNIZE_MAX_PROCESSED_BYTES) {
    throw new ProductRecognizeImagePrepError(
      'Das verarbeitete Foto ist zu groß (maximal 4 MB nach der Verarbeitung).',
    )
  }

  const result: PreparedProductRecognizeImage = {
    base64: optimized.buffer.toString('base64'),
    mimeType: 'image/jpeg',
    prep: {
      originalFormat: effectiveFormat,
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
      heicDetected,
      heicRetryUsed,
    },
  }

  logProductRecognizePipeline('image_prep_complete', {
    durationMs: Date.now() - prepStartedAt,
    effectiveFormat: result.prep.originalFormat,
    processedFormat: result.prep.processedFormat,
    originalBytes: result.prep.originalBytes,
    processedBytes: result.prep.processedBytes,
    heicDetected,
    heicRetryUsed,
    converted: result.prep.converted,
  })

  return result
}
