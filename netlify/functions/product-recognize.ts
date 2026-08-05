import type { Handler } from '@netlify/functions'
import {
  runProductRecognition,
  validateProductRecognizeInput,
} from '../../src/lib/productRecognizeCore'
import { createOpenAiProductRecognizeDeps } from '../../src/lib/productRecognizeServer'
import { stripDataUrl } from '../../src/lib/productAssistantAnalyzeCore'
import { logProductRecognizePipeline } from '../../src/lib/productRecognizePipelineLogCore'

function jsonResponse(statusCode: number, payload: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

export const handler: Handler = async (event) => {
  const requestStartedAt = Date.now()

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Nur POST-Anfragen sind erlaubt.' })
  }

  logProductRecognizePipeline('request_received', {
    contentLength: event.headers['content-length'] ?? null,
    bodyStringLength: event.body?.length ?? 0,
  })

  let body: Record<string, unknown>
  const parseStartedAt = Date.now()

  try {
    body = JSON.parse(event.body ?? '{}') as Record<string, unknown>
  } catch {
    logProductRecognizePipeline('request_parse_failed', {
      durationMs: Date.now() - parseStartedAt,
    })
    return jsonResponse(400, { error: 'Ungültiger JSON-Body.' })
  }

  const requestParseMs = Date.now() - parseStartedAt
  const decodeStartedAt = Date.now()

  const imageBase64Raw = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : ''
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : 'image/jpeg'
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : undefined
  const stripped = stripDataUrl(imageBase64Raw)
  const imageDecodeMs = Date.now() - decodeStartedAt

  logProductRecognizePipeline('request_body_parsed', {
    requestParseMs,
    imageDecodeMs,
    declaredMimeType: mimeType,
    fileName: fileName ?? null,
    base64FieldLength: imageBase64Raw.length,
    strippedBase64Length: stripped.base64.length,
  })

  const validation = validateProductRecognizeInput({
    imageBase64: stripped.base64,
    mimeType: mimeType || stripped.mimeType || 'image/jpeg',
    fileName,
  })

  if (validation) {
    logProductRecognizePipeline('request_validation_failed', {
      totalMs: Date.now() - requestStartedAt,
      statusCode: validation.statusCode,
    })
    return jsonResponse(validation.statusCode, { error: validation.error, spike: true })
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()

  if (!apiKey) {
    logProductRecognizePipeline('request_not_configured', {
      totalMs: Date.now() - requestStartedAt,
    })
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
      {
        requestParseMs,
        imageDecodeMs,
      },
    )

    logProductRecognizePipeline('response_ready', {
      totalMs: Date.now() - requestStartedAt,
      status: result.status,
      pipelineLatencies: result.diagnostics.pipelineLatencies ?? null,
      imagePrep: result.diagnostics.imagePrep
        ? {
            originalFormat: result.diagnostics.imagePrep.originalFormat,
            processedFormat: result.diagnostics.imagePrep.processedFormat,
            originalBytes: result.diagnostics.imagePrep.originalBytes,
            processedBytes: result.diagnostics.imagePrep.processedBytes,
            heicDetected: result.diagnostics.imagePrep.heicDetected ?? false,
            heicRetryUsed: result.diagnostics.imagePrep.heicRetryUsed ?? false,
            converted: result.diagnostics.imagePrep.converted,
          }
        : null,
    })

    return jsonResponse(200, result)
  } catch (error) {
    logProductRecognizePipeline('response_failed', {
      totalMs: Date.now() - requestStartedAt,
      message: error instanceof Error ? error.message : String(error),
    })

    return jsonResponse(500, {
      error:
        error instanceof Error
          ? error.message
          : 'Die Produkterkennung konnte nicht abgeschlossen werden.',
      spike: true,
    })
  }
}
