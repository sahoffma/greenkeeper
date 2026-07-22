import type { Handler } from '@netlify/functions'
import OpenAI from 'openai'
import {
  activityParseSchema,
  isValidIsoDate,
  normalizeParsedActivity,
} from '../../shared/parseActivityCore'

const MAX_TRANSCRIPT_LENGTH = 1000

function jsonResponse(statusCode: number, payload: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }
}

function mapOpenAiError(error: unknown): string {
  if (!(error instanceof OpenAI.APIError)) {
    return 'Die Eingabe konnte nicht ausgewertet werden.'
  }

  if (error.status === 429) {
    return 'Das Auswertungslimit ist erreicht. Bitte versuche es später erneut.'
  }

  if (error.status === 401) {
    return 'Der OpenAI API-Schlüssel ist ungültig.'
  }

  if (error.status === 400) {
    return 'Die Eingabe konnte nicht verarbeitet werden.'
  }

  return 'Die Eingabe konnte nicht ausgewertet werden.'
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Nur POST-Anfragen sind erlaubt.' })
  }

  const apiKey = process.env.OPENAI_API_KEY

  if (!apiKey) {
    return jsonResponse(500, {
      error: 'OPENAI_API_KEY ist auf dem Server nicht konfiguriert.',
    })
  }

  let body: Record<string, unknown>

  try {
    body = JSON.parse(event.body ?? '{}') as Record<string, unknown>
  } catch {
    return jsonResponse(400, { error: 'Ungültiger JSON-Body.' })
  }

  const transcript = typeof body.transcript === 'string' ? body.transcript.trim() : ''
  const currentDate = typeof body.currentDate === 'string' ? body.currentDate.trim() : ''
  const currentAreaName =
    typeof body.currentAreaName === 'string' ? body.currentAreaName.trim() : ''

  if (!transcript) {
    return jsonResponse(400, { error: 'Bitte gib einen Text zur Auswertung an.' })
  }

  if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
    return jsonResponse(400, {
      error: `Die Eingabe ist zu lang (maximal ${MAX_TRANSCRIPT_LENGTH} Zeichen).`,
    })
  }

  if (!isValidIsoDate(currentDate)) {
    return jsonResponse(400, { error: 'currentDate muss im Format YYYY-MM-DD vorliegen.' })
  }

  if (!currentAreaName) {
    return jsonResponse(400, { error: 'currentAreaName fehlt.' })
  }

  const openai = new OpenAI({ apiKey })

  try {
    const response = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content: [
            'Du analysierst gesprochene oder getippte Rasenpflege-Einträge für Greenkeeper.',
            'Sprache und Eingabe sind überwiegend Deutsch.',
            'Erkenne selbstständig die passende Maßnahme – der Nutzer wählt keinen Typ vor.',
            'Mögliche activityType-Werte:',
            'fertilization = Dünger ausgebracht;',
            'mowing = Rasen gemäht;',
            'watering = bewässert;',
            'aerating = vertikutiert;',
            'overseeding = nachgesät;',
            'application = andere ausgebrachte Produkte wie Wetting Agent, Rasensand, Ton, Kalk;',
            'other = sonstige Pflegemaßnahme.',
            'activityLabel ist die deutsche Anzeigebezeichnung, z. B. Düngung, Mähen, Bewässerung.',
            'Löse relative Datumsangaben wie heute, gestern oder vorgestern anhand von currentDate auf.',
            'currentAreaName ist die aktuelle Fläche.',
            'Erfinde keine Werte. Setze unsichere Werte auf null.',
            'Gib Menge und Einheit getrennt zurück (z. B. amount 25, unit g/m²).',
            'Für Mähen nutze mowHeightMm für die Schnitthöhe in Millimetern.',
            'Für Bewässerung nutze amount und unit l/m² wenn passend.',
            'Produktnamen möglichst exakt aus dem Transkript übernehmen.',
            'confidence zwischen 0 und 1. warnings auf Deutsch bei Unsicherheit.',
          ].join(' '),
        },
        {
          role: 'user',
          content: JSON.stringify({
            transcript,
            currentDate,
            currentAreaName,
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'activity_parse',
          strict: true,
          schema: activityParseSchema,
        },
      },
    })

    const outputText = response.output_text

    if (!outputText) {
      return jsonResponse(502, { error: 'Die Serverantwort war ungültig.' })
    }

    const parsed = normalizeParsedActivity(JSON.parse(outputText) as Record<string, unknown>)

    if (!parsed) {
      return jsonResponse(502, { error: 'Die Serverantwort war ungültig.' })
    }

    return jsonResponse(200, parsed)
  } catch (error) {
    return jsonResponse(500, { error: mapOpenAiError(error) })
  }
}
