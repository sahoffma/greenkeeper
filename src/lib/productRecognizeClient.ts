import type { ProductRecognizeResult } from '../types/productRecognize'

export async function recognizeProductFromImage(input: {
  imageBase64: string
  mimeType: string
  fileName?: string
  signal?: AbortSignal
  timeoutMs?: number
}): Promise<ProductRecognizeResult> {
  const timeoutMs = input.timeoutMs ?? 30_000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  if (input.signal) {
    if (input.signal.aborted) {
      controller.abort()
    } else {
      input.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }
  }

  try {
    const response = await fetch('/.netlify/functions/product-recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        fileName: input.fileName,
      }),
      signal: controller.signal,
    })

    const payload = (await response.json()) as ProductRecognizeResult & { error?: string }

    if (!response.ok) {
      throw new ProductRecognizeClientError(
        payload.error ?? 'Produkterkennung fehlgeschlagen.',
        response.status,
      )
    }

    return payload
  } finally {
    clearTimeout(timeoutId)
  }
}

export class ProductRecognizeClientError extends Error {
  statusCode: number

  constructor(message: string, statusCode = 500) {
    super(message)
    this.name = 'ProductRecognizeClientError'
    this.statusCode = statusCode
  }
}
