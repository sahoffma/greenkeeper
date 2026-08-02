import type {
  FertilizerProductProfileSaveApiError,
  SaveFertilizerProductProfileRequest,
  SaveFertilizerProductProfileResponse,
} from '../types/fertilizerProductProfileSave'
import { supabase } from './supabase'

const PRODUCT_PROFILE_SAVE_URL = '/.netlify/functions/fertilizer-product-profile-save'

export class FertilizerProductProfileSaveClientError extends Error {
  readonly code: string

  readonly httpStatus: number

  constructor(message: string, code = 'client_error', httpStatus = 400) {
    super(message)
    this.name = 'FertilizerProductProfileSaveClientError'
    this.code = code
    this.httpStatus = httpStatus
  }
}

const PROFILE_SAVE_ERROR_MESSAGES: Record<string, string> = {
  invalid_request: 'Die Speicheranfrage für das Produktprofil ist ungültig.',
  unconfirmed_save: 'Das Produktprofil wurde nicht ausdrücklich bestätigt.',
  job_not_found: 'Der Anreicherungsvorgang wurde nicht gefunden.',
  job_expired: 'Der Anreicherungsvorgang ist abgelaufen. Bitte starte die Erfassung erneut.',
  not_save_ready: 'Das Produkt ist noch nicht bereit für die Bestandsaufnahme.',
  unsupported_object_category: 'Dieser Produkttyp kann nicht in den Bestand aufgenommen werden.',
  invalid_declaration: 'Die Produktdeklaration ist unvollständig oder ungültig.',
  incomplete_projection: 'Die Produktdaten konnten nicht vollständig aufbereitet werden.',
  idempotency_conflict: 'Das Produktprofil widerspricht einer früheren Anfrage.',
  persistence_unavailable: 'Das Produktprofil konnte nicht gespeichert werden.',
  temporarily_unavailable: 'Das Speichern des Produktprofils ist gerade nicht verfügbar.',
  internal_server_error: 'Das Speichern des Produktprofils ist fehlgeschlagen.',
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

function parseApiError(payload: unknown): FertilizerProductProfileSaveApiError | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const error = (payload as { error?: FertilizerProductProfileSaveApiError }).error
  if (!error?.code || !error.message) {
    return null
  }

  return error
}

function mapProfileSaveClientError(status: number, payload: unknown): FertilizerProductProfileSaveClientError {
  const apiError = parseApiError(payload)
  const code = apiError?.code ?? 'client_error'
  const message =
    PROFILE_SAVE_ERROR_MESSAGES[code] ??
    apiError?.message ??
    'Das Produktprofil konnte nicht gespeichert werden.'

  return new FertilizerProductProfileSaveClientError(message, code, status)
}

export async function saveFertilizerProductProfileFromCapture(
  request: SaveFertilizerProductProfileRequest,
): Promise<SaveFertilizerProductProfileResponse> {
  let response: Response

  try {
    response = await fetch(PRODUCT_PROFILE_SAVE_URL, {
      method: 'POST',
      headers: await readAuthHeaders(),
      body: JSON.stringify(request),
    })
  } catch {
    throw new FertilizerProductProfileSaveClientError(
      'Netzwerkfehler beim Speichern des Produktprofils.',
      'network_error',
      0,
    )
  }

  const payload = (await response.json()) as
    | SaveFertilizerProductProfileResponse
    | { error?: FertilizerProductProfileSaveApiError }

  if (!response.ok) {
    throw mapProfileSaveClientError(response.status, payload)
  }

  if (!('profile' in payload) || !payload.profile?.id) {
    throw new FertilizerProductProfileSaveClientError('Die Produktprofil-Antwort war unvollständig.')
  }

  return payload
}

export { PRODUCT_PROFILE_SAVE_URL }
