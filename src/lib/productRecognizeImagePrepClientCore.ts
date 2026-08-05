import { resolveRecognitionUploadMimeType } from './productRecognizeImageInputCore'

export class ProductRecognizeImagePrepClientError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProductRecognizeImagePrepClientError'
  }
}

export interface EncodedRecognitionFile {
  base64: string
  mimeType: string
  fileName: string
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

export async function encodeRecognitionFileForUpload(file: File): Promise<EncodedRecognitionFile> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const mimeType = resolveRecognitionUploadMimeType({
    mimeType: file.type,
    fileName: file.name,
    bytes,
  })

  return {
    base64: arrayBufferToBase64(buffer),
    mimeType,
    fileName: file.name,
  }
}
