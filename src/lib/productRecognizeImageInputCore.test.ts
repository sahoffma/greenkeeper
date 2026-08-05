import { describe, expect, it } from 'vitest'
import {
  detectHeicContainerFromBytes,
  normalizeRecognitionInputMimeType,
  resolveRecognitionUploadMimeType,
  shouldSkipBrowserSideRecognitionDecode,
} from './productRecognizeImageInputCore'

function heicHeaderBytes(): Uint8Array {
  const bytes = new Uint8Array(64)
  bytes.set([0x66, 0x74, 0x79, 0x70], 4)
  bytes.set([0x68, 0x65, 0x69, 0x63], 8)
  return bytes
}

describe('productRecognizeImageInputCore', () => {
  it('3 — image/heic wird als HEIC erkannt', () => {
    expect(normalizeRecognitionInputMimeType('image/heic')).toBe('image/heic')
    expect(shouldSkipBrowserSideRecognitionDecode({ mimeType: 'image/heic' })).toBe(true)
  })

  it('4 — image/heif wird als HEIF erkannt', () => {
    expect(normalizeRecognitionInputMimeType('image/heif')).toBe('image/heif')
    expect(shouldSkipBrowserSideRecognitionDecode({ mimeType: 'image/heif' })).toBe(true)
  })

  it('5 — leerer MIME-Type mit .heic-Endung wird erkannt', () => {
    expect(
      normalizeRecognitionInputMimeType('', 'photo.heic'),
    ).toBe('image/heic')
  })

  it('6 — generischer MIME-Type mit .HEIC-Endung wird erkannt', () => {
    expect(
      normalizeRecognitionInputMimeType('application/octet-stream', 'IMG_0081.HEIC'),
    ).toBe('image/heic')
  })

  it('4 — HEIC wird auch per Magic Bytes erkannt, wenn MIME image/jpeg lautet', () => {
    const bytes = heicHeaderBytes()

    expect(
      resolveRecognitionUploadMimeType({
        mimeType: 'image/jpeg',
        fileName: 'image.jpg',
        bytes,
      }),
    ).toBe('image/heic')
  })

  it('7 — HEIC per Magic Bytes erfordert keinen Browser-Dekodierungspfad', () => {
    const bytes = heicHeaderBytes()

    expect(
      shouldSkipBrowserSideRecognitionDecode({
        mimeType: 'image/jpeg',
        fileName: 'image.jpg',
        bytes,
      }),
    ).toBe(true)
  })

  it('erkennt HEIC-Container an ftyp/heic', () => {
    expect(detectHeicContainerFromBytes(heicHeaderBytes())).toBe(true)
  })
})
