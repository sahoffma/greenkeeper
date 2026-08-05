import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeRecognitionFileForUpload } from './productRecognizeImagePrepClientCore'

function heicFile(overrides: Partial<File> & Pick<File, 'name'> & { type: string }): File {
  const bytes = new Uint8Array(64)
  bytes.set([0x66, 0x74, 0x79, 0x70], 4)
  bytes.set([0x68, 0x65, 0x69, 0x63], 8)

  return {
    name: overrides.name,
    type: overrides.type,
    lastModified: overrides.lastModified ?? 0,
    arrayBuffer: async () => bytes.buffer,
    slice: () => new Blob(),
    stream: () => new ReadableStream(),
    text: async () => '',
    size: bytes.byteLength,
    webkitRelativePath: '',
  } as File
}

describe('productRecognizeImagePrepClientCore', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('5 — leerer MIME-Type mit .heic-Endung wird für Upload korrekt erkannt', async () => {
    const encoded = await encodeRecognitionFileForUpload(
      heicFile({ name: 'photo.heic', type: '' }),
    )

    expect(encoded.mimeType).toBe('image/heic')
    expect(encoded.fileName).toBe('photo.heic')
    expect(encoded.base64.length).toBeGreaterThan(0)
  })

  it('6 — generischer MIME-Type mit .HEIC-Endung wird für Upload korrekt erkannt', async () => {
    const encoded = await encodeRecognitionFileForUpload(
      heicFile({ name: 'IMG_0081.HEIC', type: 'application/octet-stream' }),
    )

    expect(encoded.mimeType).toBe('image/heic')
  })

  it('7 — HEIC wird als Rohbytes ohne Browser-Dekodierung hochgeladen', async () => {
    const file = heicFile({ name: 'image.jpg', type: 'image/jpeg' })
    const encoded = await encodeRecognitionFileForUpload(file)

    expect(encoded.mimeType).toBe('image/heic')
  })

  it('JPEG bleibt JPEG', async () => {
    const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 0, 0, 0])
    const file = {
      name: 'front.jpg',
      type: 'image/jpeg',
      lastModified: 0,
      arrayBuffer: async () => jpegBytes.buffer,
      slice: () => new Blob(),
      stream: () => new ReadableStream(),
      text: async () => '',
      size: jpegBytes.byteLength,
      webkitRelativePath: '',
    } as File

    const encoded = await encodeRecognitionFileForUpload(file)

    expect(encoded.mimeType).toBe('image/jpeg')
  })
})
