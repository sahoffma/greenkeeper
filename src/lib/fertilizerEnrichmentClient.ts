import type {
  FertilizerEnrichmentApiError,
  FertilizerEnrichmentJob,
  StartFertilizerEnrichmentRequest,
} from '../types/fertilizerEnrichmentOrchestration'
import { supabase } from './supabase'

const ENRICHMENT_START_URL = '/.netlify/functions/fertilizer-enrichment-start'
const ENRICHMENT_STATUS_URL = '/.netlify/functions/fertilizer-enrichment-status'

export class FertilizerEnrichmentClientError extends Error {
  readonly code: string

  readonly httpStatus: number

  constructor(message: string, code = 'client_error', httpStatus = 400) {
    super(message)
    this.name = 'FertilizerEnrichmentClientError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

const ENRICHMENT_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: 'Die Anreicherungsanfrage ist ungültig.',
  job_not_found: 'Der Anreicherungsvorgang wurde nicht gefunden.',
  job_expired: 'Der Anreicherungsvorgang ist abgelaufen. Bitte starte die Erfassung erneut.',
  unauthorized: 'Bitte melde dich erneut an.',
  idempotency_conflict: 'Der Anreicherungsvorgang widerspricht einer früheren Anfrage.',
  revision_conflict: 'Der Anreicherungsvorgang wurde parallel geändert. Bitte versuche es erneut.',
  orchestration_not_cancellable: 'Der Anreicherungsvorgang kann nicht abgebrochen werden.',
  temporarily_unavailable: 'Die Produktanreicherung ist gerade nicht verfügbar.',
  internal_server_error: 'Die Produktanreicherung ist fehlgeschlagen.',
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

function parseApiError(payload: unknown): FertilizerEnrichmentApiError | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const error = (payload as { error?: FertilizerEnrichmentApiError }).error
  if (!error?.code || !error.message) {
    return null
  }

  return error
}

function mapEnrichmentClientError(status: number, payload: unknown): FertilizerEnrichmentClientError {
  const apiError = parseApiError(payload)
  const code = apiError?.code ?? 'client_error'
  const message =
    ENRICHMENT_ERROR_MESSAGES[code] ??
    apiError?.message ??
    'Die Produktanreicherung ist fehlgeschlagen.'

  return new FertilizerEnrichmentClientError(message, code, status)
}

export async function startFertilizerEnrichmentFromCapture(
  request: Pick<StartFertilizerEnrichmentRequest, 'input' | 'idempotencyKey'>,
): Promise<FertilizerEnrichmentJob> {
  let response: Response

  try {
    response = await fetch(ENRICHMENT_START_URL, {
      method: 'POST',
      headers: await readAuthHeaders(),
      body: JSON.stringify({
        input: request.input,
        idempotencyKey: request.idempotencyKey,
      }),
    })
  } catch {
    throw new FertilizerEnrichmentClientError(
      'Netzwerkfehler bei der Produktanreicherung.',
      'network_error',
      0,
    )
  }

  const payload = (await response.json()) as { job?: FertilizerEnrichmentJob; error?: FertilizerEnrichmentApiError }

  if (!response.ok) {
    throw mapEnrichmentClientError(response.status, payload)
  }

  if (!payload.job?.jobId) {
    throw new FertilizerEnrichmentClientError('Die Anreicherungsantwort war unvollständig.')
  }

  return payload.job
}

export async function getFertilizerEnrichmentStatus(jobId: string): Promise<FertilizerEnrichmentJob> {
  let response: Response

  try {
    response = await fetch(ENRICHMENT_STATUS_URL, {
      method: 'POST',
      headers: await readAuthHeaders(),
      body: JSON.stringify({ jobId }),
    })
  } catch {
    throw new FertilizerEnrichmentClientError(
      'Netzwerkfehler beim Laden des Anreicherungsstatus.',
      'network_error',
      0,
    )
  }

  const payload = (await response.json()) as { job?: FertilizerEnrichmentJob; error?: FertilizerEnrichmentApiError }

  if (!response.ok) {
    throw mapEnrichmentClientError(response.status, payload)
  }

  if (!payload.job?.jobId) {
    throw new FertilizerEnrichmentClientError('Der Anreicherungsstatus war unvollständig.')
  }

  return payload.job
}

export { ENRICHMENT_START_URL, ENRICHMENT_STATUS_URL }
