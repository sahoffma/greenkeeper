/**
 * Datensparsame Telemetrie für Produkterkennung — keine Bild- oder OCR-Inhalte.
 * Deaktivierbar; standardmäßig nur in Entwicklung aktiv.
 */

export type FertilizerRecognitionTelemetryOutcome =
  | 'success'
  | 'unclear'
  | 'technical_failure'
  | 'cancelled'
  | 'timeout'

export interface FertilizerRecognitionTelemetryEvent {
  outcome: FertilizerRecognitionTelemetryOutcome
  catalogHit: boolean
  webSourceFound: boolean
  backPhotoRequested: boolean
  totalLatencyMs: number | null
  pipelineLatencies?: Record<string, number>
  fileFormat: string | null
  identityConfidence: number | null
  dataCompleteness: number | null
  userAccepted: boolean | null
  userDiscarded: boolean | null
}

let telemetryEnabled =
  import.meta.env.DEV || import.meta.env.VITE_PRODUCT_RECOGNITION_TELEMETRY === 'true'

const eventLog: FertilizerRecognitionTelemetryEvent[] = []

export function setFertilizerRecognitionTelemetryEnabled(enabled: boolean): void {
  telemetryEnabled = enabled
}

export function getFertilizerRecognitionTelemetryLog(): readonly FertilizerRecognitionTelemetryEvent[] {
  return eventLog
}

export function clearFertilizerRecognitionTelemetryLog(): void {
  eventLog.length = 0
}

export function trackFertilizerRecognition(event: FertilizerRecognitionTelemetryEvent): void {
  if (!telemetryEnabled) {
    return
  }

  eventLog.push(event)

  if (import.meta.env.DEV) {
    console.info('[fertilizer-recognition]', event)
  }
}

export function telemetryPayloadIsSafe(payload: unknown): boolean {
  const serialized = JSON.stringify(payload)

  if (/data:image|base64|ocr|textFragments/i.test(serialized)) {
    return false
  }

  return true
}
