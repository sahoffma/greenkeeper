import type { ParseActivityRequest, ParsedActivityResult } from '../types/parseActivity'
import { normalizeParsedActivity } from './parseActivityCore'

const PARSE_ACTIVITY_URL = '/.netlify/functions/parse-activity'

function mapClientError(status: number, message: string): string {
  if (status === 400) {
    return message
  }

  if (status === 405) {
    return 'Die Auswertungs-Route ist nicht erreichbar.'
  }

  if (status === 429) {
    return 'Das Auswertungslimit ist erreicht. Bitte versuche es später erneut.'
  }

  if (status >= 500) {
    return message || 'Die Eingabe konnte serverseitig nicht ausgewertet werden.'
  }

  return message || 'Die Eingabe konnte nicht ausgewertet werden.'
}

export async function parseActivityTranscript(
  input: ParseActivityRequest,
): Promise<ParsedActivityResult> {
  const transcript = input.transcript.trim()

  if (!transcript) {
    throw new Error('Bitte gib zuerst eine gesprochene oder manuelle Eingabe ein.')
  }

  if (transcript.length > 1000) {
    throw new Error('Die Eingabe ist zu lang (maximal 1000 Zeichen).')
  }

  let response: Response

  try {
    response = await fetch(PARSE_ACTIVITY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transcript,
        currentDate: input.currentDate,
        currentAreaName: input.currentAreaName,
      }),
    })
  } catch {
    throw new Error('Netzwerkfehler bei der Auswertung. Bitte prüfe deine Verbindung.')
  }

  let payload: { error?: string } & Partial<ParsedActivityResult> = {}

  try {
    payload = (await response.json()) as typeof payload
  } catch {
    throw new Error('Die Serverantwort war ungültig.')
  }

  if (!response.ok) {
    throw new Error(mapClientError(response.status, payload.error ?? ''))
  }

  const parsed = normalizeParsedActivity(payload as Record<string, unknown>)

  if (!parsed) {
    throw new Error('Die Serverantwort war ungültig.')
  }

  return parsed
}
