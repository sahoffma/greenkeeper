import type { Handler } from '@netlify/functions'
import {
  runProductRecognition,
  validateProductRecognizeInput,
} from '../../src/lib/productRecognizeCore'
import { createOpenAiProductRecognizeDeps } from '../../src/lib/productRecognizeServer'
import { stripDataUrl } from '../../src/lib/productAssistantAnalyzeCore'

function jsonResponse(statusCode: number, payload: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Nur POST-Anfragen sind erlaubt.' })
  }

  let body: Record<string, unknown>

  try {
    body = JSON.parse(event.body ?? '{}') as Record<string, unknown>
  } catch {
    return jsonResponse(400, { error: 'Ungültiger JSON-Body.' })
  }

  const imageBase64Raw = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : ''
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : 'image/jpeg'
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : undefined
  const stripped = stripDataUrl(imageBase64Raw)

  const validation = validateProductRecognizeInput({
    imageBase64: stripped.base64,
    mimeType: mimeType || stripped.mimeType || 'image/jpeg',
    fileName,
  })

  if (validation) {
    return jsonResponse(validation.statusCode, { error: validation.error, spike: true })
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()

  if (!apiKey) {
    return jsonResponse(503, {
      error:
        'OPENAI_API_KEY ist nicht konfiguriert. Der Spike benötigt serverseitigen OpenAI-Zugriff.',
      spike: true,
    })
  }

  try {
    const result = await runProductRecognition(
      {
        imageBase64: stripped.base64,
        mimeType: mimeType || stripped.mimeType || 'image/jpeg',
        fileName,
      },
      createOpenAiProductRecognizeDeps(apiKey),
    )

    return jsonResponse(200, result)
  } catch (error) {
    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : 'Die Produkterkennung konnte nicht abgeschlossen werden.',
      spike: true,
    })
  }
}
