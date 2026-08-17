import { createMeasureActivity, parseAmountApplied, todayDateInputValue } from './activityCreate'
import { parseActivityTranscript } from './parseActivity'
import { buildActivitySummaryRows } from './parseActivityCore'
import type { ParsedActivityResult } from '../types/parseActivity'

export const MAX_HOME_RECORDING_MS = 60_000

export const HOME_VOICE_PREP_MESSAGE =
  'Die Sprachauswertung wird gerade vorbereitet.'

export type HomeVoicePhase =
  | 'idle'
  | 'starting'
  | 'listening'
  | 'processing'
  | 'draft'
  | 'confirm'
  | 'saved'

export function appendTranscript(current: string, next: string): string {
  if (!current) {
    return next
  }

  return `${current} ${next}`.trim()
}

export function mapSummaryLabel(label: string): string {
  if (label === 'Maßnahme') {
    return 'Tätigkeit'
  }

  return label
}

export function buildConfirmationRows(
  result: ParsedActivityResult,
  areaName: string,
): Array<{ label: string; value: string }> {
  return buildActivitySummaryRows(result, {
    areaName,
    referenceDate: todayDateInputValue(),
  }).map((row) => ({
    label: mapSummaryLabel(row.label),
    value: row.value,
  }))
}

export function isParseEndpointUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message

  return (
    message.includes('Auswertungs-Route ist nicht erreichbar') ||
    message.includes('Netzwerkfehler bei der Auswertung') ||
    message.includes('Serverantwort war ungültig')
  )
}

export async function evaluateHomeTranscript(
  transcript: string,
  areaName: string,
): Promise<ParsedActivityResult> {
  return parseActivityTranscript({
    transcript,
    currentAreaName: areaName,
    currentDate: todayDateInputValue(),
  })
}

export async function saveHomeParsedActivity(input: {
  areaId: string
  userId: string
  result: ParsedActivityResult
}): Promise<void> {
  await createMeasureActivity({
    areaId: input.areaId,
    userId: input.userId,
    activityType: input.result.activityType,
    activityLabel: input.result.activityLabel,
    occurredAt: input.result.date,
    productName: input.result.productName,
    notes: input.result.note,
    amountApplied: parseAmountApplied(input.result.amount),
    amountUnit: input.result.unit,
    mowHeightMm: input.result.mowHeightMm,
  })
}
