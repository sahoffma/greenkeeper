import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  prepareProductRecognizeImage,
  optimizeImageBuffer,
  ProductRecognizeImagePrepError,
  PRODUCT_RECOGNIZE_MAX_IMAGE_DIMENSION,
} from './productRecognizeImagePrepCore'

vi.mock('heic-convert', () => ({
  default: vi.fn(async () => Buffer.alloc(256, 2)),
}))

vi.mock('sharp', () => {
  const chain = {
    metadata: vi.fn(async () => ({ width: 4032, height: 3024 })),
    rotate: vi.fn(function (this: unknown) {
      return this
    }),
    resize: vi.fn(function (this: unknown) {
      return this
    }),
    jpeg: vi.fn(function (this: unknown) {
      return this
    }),
    toBuffer: vi.fn(async () => Buffer.alloc(180, 3)),
  }

  const sharpFn = vi.fn(() => chain)
  return { default: sharpFn }
})

describe('productRecognizeImagePrepCore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1 — HEIC wird serverseitig konvertiert und komprimiert', async () => {
    const inputBuffer = Buffer.alloc(64, 1)
    const result = await prepareProductRecognizeImage({
      base64: inputBuffer.toString('base64'),
      mimeType: 'image/heic',
      fileName: 'IMG_0081.HEIC',
    })

    expect(result.prep.converted).toBe(true)
    expect(result.prep.originalFormat).toBe('image/heic')
    expect(result.prep.processedFormat).toBe('image/jpeg')
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.prep.processedBytes).toBeLessThanOrEqual(256)
    expect(result.prep.originalWidth).toBe(4032)
    expect(result.prep.processedWidth).toBe(4032)
  })

  it('2 — JPEG wird sinnvoll komprimiert', async () => {
    const jpeg = Buffer.alloc(512, 1)
    const result = await prepareProductRecognizeImage({
      base64: jpeg.toString('base64'),
      mimeType: 'image/jpeg',
    })

    expect(result.prep.converted).toBe(false)
    expect(result.prep.processedBytes).toBeLessThan(jpeg.length)
    expect(result.prep.compressionMs).toBeGreaterThanOrEqual(0)
  })

  it('3 — skaliert große Bilder auf maximale Kantenlänge', async () => {
    const buffer = await optimizeImageBuffer(Buffer.alloc(64, 1))
    const sharp = (await import('sharp')).default as unknown as ReturnType<typeof vi.fn>
    const instance = sharp.mock.results[0]?.value as {
      resize: ReturnType<typeof vi.fn>
    }

    expect(instance.resize).toHaveBeenCalledWith(
      expect.objectContaining({
        width: PRODUCT_RECOGNIZE_MAX_IMAGE_DIMENSION,
        height: PRODUCT_RECOGNIZE_MAX_IMAGE_DIMENSION,
        fit: 'inside',
      }),
    )
    expect(buffer.processedWidth).toBe(4032)
  })

  it('14 — ungültige HEIC-Datei wird abgelehnt', async () => {
    const heicConvert = (await import('heic-convert')).default as ReturnType<typeof vi.fn>
    heicConvert.mockRejectedValueOnce(new Error('invalid heic'))

    await expect(
      prepareProductRecognizeImage({
        base64: Buffer.alloc(64, 1).toString('base64'),
        mimeType: 'image/heic',
      }),
    ).rejects.toBeInstanceOf(ProductRecognizeImagePrepError)
  })
})
