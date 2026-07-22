import { supabase } from './supabase'
import type { ProductImportInput } from '../types/product'
import type {
  ProductAssistantAnalyzeRequest,
  ProductAssistantAnalysisResult,
  ProductAssistantInputChannel,
  ProductAssistantSubmitResponse,
  ProductLearnSourceType,
} from '../types/productAssistant'

const ANALYZE_URL = '/.netlify/functions/product-assistant-analyze'
const SUBMIT_URL = '/.netlify/functions/product-assistant-submit'

function mapClientError(status: number, message: string): string {
  if (status === 400) return message
  if (status === 401) return 'Bitte melde dich erneut an.'
  if (status === 503) return message
  if (status >= 500) return message || 'Der Server ist vorübergehend nicht erreichbar.'
  return message || 'Die Anfrage ist fehlgeschlagen.'
}

async function readAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

export async function analyzeProductAssistant(
  input: ProductAssistantAnalyzeRequest,
): Promise<ProductAssistantAnalysisResult> {
  let response: Response

  try {
    response = await fetch(ANALYZE_URL, {
      method: 'POST',
      headers: await readAuthHeaders(),
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Netzwerkfehler bei der Produktanalyse.')
  }

  const payload = (await response.json()) as ProductAssistantAnalysisResult & { error?: string }

  if (!response.ok) {
    throw new Error(mapClientError(response.status, payload.error ?? ''))
  }

  if (typeof payload.manufacturer === 'undefined') {
    throw new Error('Die Analyseantwort war ungültig.')
  }

  return payload
}

export async function submitProductAssistantProposal(input: {
  payload: ProductImportInput
  channel: ProductAssistantInputChannel
  sourceType?: ProductLearnSourceType
  sourceDescription?: string | null
  aiFieldConfidence?: Record<string, number>
  sources?: Array<{
    sourceType: string
    sourceName: string
    sourceUrl?: string | null
    retrievedAt: string
    evidence?: string | null
  }>
}): Promise<ProductAssistantSubmitResponse> {
  const body = {
    payload: input.payload,
    channel: input.channel,
    aiFieldConfidence: input.aiFieldConfidence,
    sources:
      input.sources ??
      (input.sourceDescription
        ? [
            {
              sourceType: 'user_submission' as const,
              sourceName: input.sourceDescription,
              retrievedAt: new Date().toISOString(),
              evidence: input.sourceDescription,
            },
          ]
        : undefined),
  }

  let response: Response

  try {
    response = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: await readAuthHeaders(),
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Netzwerkfehler beim Einreichen des Vorschlags.')
  }

  const payload = (await response.json()) as ProductAssistantSubmitResponse & { error?: string }

  if (!response.ok) {
    throw new Error(mapClientError(response.status, payload.error ?? ''))
  }

  if (!payload.submissionId) {
    throw new Error('Die Einreichung war unvollständig.')
  }

  return payload
}
