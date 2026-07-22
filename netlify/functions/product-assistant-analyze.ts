import type { Handler } from '@netlify/functions'
import OpenAI from 'openai'
import type { ProductLearnSourceType } from '../../src/types/productAssistant'
import {
  buildDevModeAnalysis,
  estimateBase64Bytes,
  isDevModeEnabled,
  MAX_IMAGE_BYTES,
  parseAnalysisResponse,
  productAssistantAnalysisSchema,
  stripDataUrl,
} from '../../src/lib/productAssistantAnalyzeCore'

const MAX_PDF_BYTES = 8 * 1024 * 1024
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp']
const ALLOWED_PDF_MIME = ['application/pdf']

function jsonResponse(statusCode: number, payload: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

function parseSourceType(value: unknown): ProductLearnSourceType | undefined {
  const allowed: ProductLearnSourceType[] = ['photos', 'manufacturer_url', 'shop_url', 'pdf']
  return typeof value === 'string' && allowed.includes(value as ProductLearnSourceType)
    ? (value as ProductLearnSourceType)
    : undefined
}

function parseImages(body: Record<string, unknown>): Array<{ base64: string; mimeType: string }> {
  const fromArray = Array.isArray(body.images)
    ? body.images
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null
          const record = entry as Record<string, unknown>
          const base64 = typeof record.base64 === 'string' ? record.base64.trim() : ''
          const mimeType = typeof record.mimeType === 'string' ? record.mimeType.trim() : 'image/jpeg'
          if (!base64) return null
          return { base64, mimeType }
        })
        .filter((entry): entry is { base64: string; mimeType: string } => entry != null)
    : []

  if (fromArray.length > 0) {
    return fromArray
  }

  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64.trim() : ''
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType.trim() : 'image/jpeg'

  if (imageBase64) {
    return [{ base64: imageBase64, mimeType }]
  }

  return []
}

async function fetchUrlSnippet(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GreenkeeperBot/1.0 (+https://greenkeeper.app)' },
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      return `URL: ${url}\n(Hinweis: Seite konnte nicht geladen werden – Status ${response.status})`
    }

    const html = await response.text()
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? ''
    const metaDescription =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)?.[1]?.trim() ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]?.trim() ??
      ''

    const textSample = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000)

    return [
      `URL: ${url}`,
      title ? `Titel: ${title}` : null,
      metaDescription ? `Beschreibung: ${metaDescription}` : null,
      textSample ? `Seiteninhalt (Auszug): ${textSample}` : null,
    ]
      .filter(Boolean)
      .join('\n')
  } catch {
    return `URL: ${url}\n(Hinweis: Seiteninhalt konnte nicht geladen werden.)`
  }
}

function buildAnalysisInstruction(input: {
  manufacturer: string
  officialName: string
  spokenProductName: string
  spokenTranscript: string
  sourceType?: ProductLearnSourceType
  sourceUrl?: string
  urlSnippet?: string
}): string {
  return JSON.stringify({
    manufacturer: input.manufacturer || null,
    officialName: input.officialName || null,
    spokenProductName: input.spokenProductName || null,
    spokenTranscript: input.spokenTranscript || null,
    sourceType: input.sourceType ?? null,
    sourceUrl: input.sourceUrl ?? null,
    urlSnippet: input.urlSnippet ?? null,
    instruction:
      'Extrahiere Dünger-Produktdaten aus der bereitgestellten Quelle. Nutze den gesprochenen Produktnamen als Kontext, wenn die Quelle unvollständig ist. NPK als Herstellerangabe (N-P2O5-K2O). Keine Werte erfinden. missingFields und uncertainFields auf Deutsch benennen.',
  })
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

  const manufacturer = typeof body.manufacturer === 'string' ? body.manufacturer.trim() : ''
  const officialName = typeof body.officialName === 'string' ? body.officialName.trim() : ''
  const spokenProductName =
    typeof body.spokenProductName === 'string' ? body.spokenProductName.trim() : ''
  const spokenTranscript =
    typeof body.spokenTranscript === 'string' ? body.spokenTranscript.trim() : ''
  const sourceType = parseSourceType(body.sourceType)
  const sourceUrl = typeof body.sourceUrl === 'string' ? body.sourceUrl.trim() : ''
  const pdfBase64 = typeof body.pdfBase64 === 'string' ? body.pdfBase64.trim() : ''
  const pdfMimeType =
    typeof body.pdfMimeType === 'string' ? body.pdfMimeType.trim() : 'application/pdf'
  const images = parseImages(body)

  const hasImage = images.length > 0
  const hasPdf = pdfBase64.length > 0
  const hasUrl = sourceUrl.length > 0
  const devMode = isDevModeEnabled() || !process.env.OPENAI_API_KEY

  if (devMode) {
    const devResult = buildDevModeAnalysis({
      manufacturer,
      officialName,
      spokenProductName,
      sourceType,
      hasImage,
      hasPdf,
      hasUrl,
    })

    if ('error' in devResult) {
      return jsonResponse(hasImage || hasPdf || hasUrl || spokenProductName ? 503 : 400, {
        error: devResult.error,
        devMode: true,
      })
    }

    return jsonResponse(200, devResult)
  }

  if (!hasImage && !hasPdf && !hasUrl && !manufacturer && !officialName && !spokenProductName) {
    return jsonResponse(400, {
      error: 'Bitte lade eine Quelle hoch oder gib Produktinformationen an.',
    })
  }

  for (const image of images) {
    const stripped = stripDataUrl(image.base64)
    const bytes = estimateBase64Bytes(stripped.base64)

    if (bytes > MAX_IMAGE_BYTES) {
      return jsonResponse(400, { error: 'Ein Foto ist zu groß (maximal 4 MB pro Bild).' })
    }

    const resolvedMime = image.mimeType || stripped.mimeType || 'image/jpeg'

    if (!ALLOWED_IMAGE_MIME.includes(resolvedMime)) {
      return jsonResponse(400, { error: 'Nur JPEG-, PNG- oder WebP-Fotos werden unterstützt.' })
    }
  }

  if (hasPdf) {
    const stripped = stripDataUrl(pdfBase64)
    const bytes = estimateBase64Bytes(stripped.base64)

    if (bytes > MAX_PDF_BYTES) {
      return jsonResponse(400, { error: 'Die PDF-Datei ist zu groß (maximal 8 MB).' })
    }

    const resolvedPdfMime = pdfMimeType || stripped.mimeType || 'application/pdf'

    if (!ALLOWED_PDF_MIME.includes(resolvedPdfMime)) {
      return jsonResponse(400, { error: 'Nur PDF-Dateien werden unterstützt.' })
    }
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const urlSnippet = hasUrl ? await fetchUrlSnippet(sourceUrl) : undefined

  try {
    const userContent: OpenAI.Responses.ResponseInputMessageContentList = []

    for (const image of images) {
      const stripped = stripDataUrl(image.base64)
      const resolvedMime = image.mimeType || stripped.mimeType || 'image/jpeg'
      userContent.push({
        type: 'input_image',
        image_url: `data:${resolvedMime};base64,${stripped.base64}`,
        detail: 'high',
      })
    }

    if (hasPdf) {
      const stripped = stripDataUrl(pdfBase64)
      const resolvedPdfMime = pdfMimeType || stripped.mimeType || 'application/pdf'
      userContent.push({
        type: 'input_file',
        filename: 'product-datasheet.pdf',
        file_data: `data:${resolvedPdfMime};base64,${stripped.base64}`,
      })
    }

    userContent.push({
      type: 'input_text',
      text: buildAnalysisInstruction({
        manufacturer,
        officialName,
        spokenProductName,
        spokenTranscript,
        sourceType,
        sourceUrl: hasUrl ? sourceUrl : undefined,
        urlSnippet,
      }),
    })

    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content:
            'Du analysierst Düngerprodukte für Greenkeeper. Sprache: Deutsch. Gib NPK exakt wie auf dem Etikett oder in der Quelle an. Setze unleserliche Felder auf null und trage sie in missingFields oder uncertainFields ein. sourceDescription kurz beschreiben (z. B. Verpackungsfotos, Herstellerseite, Shop-Link, PDF).',
        },
        {
          role: 'user',
          content: userContent,
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'product_assistant_analysis',
          strict: true,
          schema: productAssistantAnalysisSchema,
        },
      },
    })

    const outputText = response.output_text

    if (!outputText) {
      return jsonResponse(502, { error: 'Die KI-Antwort war leer.' })
    }

    const parsed = parseAnalysisResponse(JSON.parse(outputText) as Record<string, unknown>)

    if (!parsed.manufacturer && manufacturer) parsed.manufacturer = manufacturer
    if (!parsed.officialName && officialName) parsed.officialName = officialName
    if (!parsed.officialName && spokenProductName) parsed.officialName = spokenProductName

    return jsonResponse(200, parsed)
  } catch {
    return jsonResponse(500, {
      error: 'Die Produktquelle konnte nicht ausgewertet werden.',
    })
  }
}
