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
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 0, ...Buffer.alloc(508, 1)])
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

  it('4 — HEIC wird auch bei falschem MIME-Type erkannt', async () => {
    const heicHeader = Buffer.alloc(64, 0)
    heicHeader.write('ftyp', 4, 4, 'ascii')
    heicHeader.write('heic', 8, 4, 'ascii')

    const result = await prepareProductRecognizeImage({
      base64: heicHeader.toString('base64'),
      mimeType: 'image/jpeg',
      fileName: 'capture',
    })

    expect(result.prep.originalFormat).toBe('image/heic')
    expect(result.prep.converted).toBe(true)
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

  it('8 — bei fehlgeschlagener Optimierung wird konvertiertes HEIC-JPEG als Fallback genutzt', async () => {
    const heicConvert = (await import('heic-convert')).default as ReturnType<typeof vi.fn>
    heicConvert.mockResolvedValueOnce(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 0, 0, 0]))

    const sharp = (await import('sharp')).default as unknown as ReturnType<typeof vi.fn>
    sharp.mockImplementationOnce(() => {
      throw new Error('sharp unavailable')
    })

    const inputBuffer = Buffer.alloc(64, 1)
    const result = await prepareProductRecognizeImage({
      base64: inputBuffer.toString('base64'),
      mimeType: 'image/heic',
      fileName: 'photo.heic',
    })

    expect(result.prep.converted).toBe(true)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.prep.compressionMs).toBe(0)
  })

  it('9 — konvertierter Buffer ohne JPEG-Header wird als Fallback akzeptiert', async () => {
    const heicConvert = (await import('heic-convert')).default as ReturnType<typeof vi.fn>
    heicConvert.mockResolvedValueOnce(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]))

    const sharp = (await import('sharp')).default as unknown as ReturnType<typeof vi.fn>
    sharp.mockImplementationOnce(() => {
      throw new Error('sharp unavailable')
    })

    const result = await prepareProductRecognizeImage({
      base64: Buffer.alloc(64, 1).toString('base64'),
      mimeType: 'image/heic',
      fileName: 'photo.heic',
    })

    expect(result.prep.converted).toBe(true)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.prep.processedFormat).toBe('image/jpeg')
  })

  it('10 — HEIC mit image/jpeg und ohne Magic Bytes: HEIC-Retry nach sharp-Fehler', async () => {
    const heicConvert = (await import('heic-convert')).default as ReturnType<typeof vi.fn>
    heicConvert.mockResolvedValueOnce(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 0, 0, 0]))

    const sharp = (await import('sharp')).default as unknown as ReturnType<typeof vi.fn>
    sharp
      .mockImplementationOnce(() => {
        throw new Error('unsupported image format')
      })
      .mockImplementationOnce(() => ({
        metadata: vi.fn(async () => ({ width: 1024, height: 768 })),
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
      }))

    const misidentifiedHeic = Buffer.alloc(64, 0xab)

    const result = await prepareProductRecognizeImage({
      base64: misidentifiedHeic.toString('base64'),
      mimeType: 'image/jpeg',
      fileName: 'image.jpg',
    })

    expect(heicConvert).toHaveBeenCalledTimes(1)
    expect(result.prep.converted).toBe(true)
    expect(result.prep.originalFormat).toBe('image/heic')
    expect(result.mimeType).toBe('image/jpeg')
  })

  it('11 — HEIC mit leerem MIME und image.jpg: HEIC-Retry nach sharp-Fehler', async () => {
    const heicConvert = (await import('heic-convert')).default as ReturnType<typeof vi.fn>
    heicConvert.mockResolvedValueOnce(Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0, 0, 0, 0]))

    const sharp = (await import('sharp')).default as unknown as ReturnType<typeof vi.fn>
    sharp
      .mockImplementationOnce(() => {
        throw new Error('unsupported image format')
      })
      .mockImplementationOnce(() => ({
        metadata: vi.fn(async () => ({ width: 1024, height: 768 })),
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
      }))

    const misidentifiedHeic = Buffer.alloc(64, 0xab)

    const result = await prepareProductRecognizeImage({
      base64: misidentifiedHeic.toString('base64'),
      mimeType: '',
      fileName: 'image.jpg',
    })

    expect(heicConvert).toHaveBeenCalledTimes(1)
    expect(result.prep.converted).toBe(true)
    expect(result.prep.originalFormat).toBe('image/heic')
  })

  it('12 — fehlgeschlagene HEIC-Konvertierung im Retry-Pfad führt zum Prep-Fehler', async () => {
    const heicConvert = (await import('heic-convert')).default as ReturnType<typeof vi.fn>
    heicConvert.mockRejectedValueOnce(new Error('not heic'))

    const sharp = (await import('sharp')).default as unknown as ReturnType<typeof vi.fn>
    sharp.mockImplementationOnce(() => {
      throw new Error('unsupported image format')
    })

    const misidentifiedHeic = Buffer.alloc(64, 0xab)

    await expect(
      prepareProductRecognizeImage({
        base64: misidentifiedHeic.toString('base64'),
        mimeType: 'image/jpeg',
        fileName: 'image.jpg',
      }),
    ).rejects.toMatchObject({
      message: 'Das Foto konnte nicht für die Erkennung vorbereitet werden.',
    })
  })

  it('13 — PNG bleibt unverändert, kein HEIC-Retry', async () => {
    const heicConvert = (await import('heic-convert')).default as ReturnType<typeof vi.fn>
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Buffer.alloc(60, 1)])

    const result = await prepareProductRecognizeImage({
      base64: png.toString('base64'),
      mimeType: 'image/png',
      fileName: 'capture.png',
    })

    expect(heicConvert).not.toHaveBeenCalled()
    expect(result.prep.converted).toBe(false)
    expect(result.prep.originalFormat).toBe('image/png')
  })

  it('15 — WebP bleibt unverändert, kein HEIC-Retry', async () => {
    const heicConvert = (await import('heic-convert')).default as ReturnType<typeof vi.fn>
    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, ...Buffer.alloc(60, 1)])

    const result = await prepareProductRecognizeImage({
      base64: webp.toString('base64'),
      mimeType: 'image/webp',
      fileName: 'capture.webp',
    })

    expect(heicConvert).not.toHaveBeenCalled()
    expect(result.prep.converted).toBe(false)
    expect(result.prep.originalFormat).toBe('image/webp')
  })

  it('16 — sharp-Fehler nach HEIC-Retry ohne erneute Optimierung nutzt konvertierten Fallback', async () => {
    const heicConvert = (await import('heic-convert')).default as ReturnType<typeof vi.fn>
    heicConvert.mockResolvedValueOnce(Buffer.from([0, 1, 2, 3, 4, 5, 6, 7]))

    const sharp = (await import('sharp')).default as unknown as ReturnType<typeof vi.fn>
    sharp.mockImplementation(() => {
      throw new Error('sharp unavailable')
    })

    const misidentifiedHeic = Buffer.alloc(64, 0xab)

    const result = await prepareProductRecognizeImage({
      base64: misidentifiedHeic.toString('base64'),
      mimeType: 'image/jpeg',
      fileName: 'image.jpg',
    })

    expect(heicConvert).toHaveBeenCalledTimes(1)
    expect(result.prep.converted).toBe(true)
    expect(result.mimeType).toBe('image/jpeg')
    expect(result.prep.compressionMs).toBe(0)
  })
})
