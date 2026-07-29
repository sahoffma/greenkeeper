import type { ProductRecognizeResult } from '../types/productRecognize'

interface RecognitionFlight {
  requestId: string
  promise: Promise<ProductRecognizeResult>
  abortController: AbortController
}

let activeFlight: RecognitionFlight | null = null

export function getActiveRecognitionFlight(
  requestId: string,
): Promise<ProductRecognizeResult> | null {
  if (activeFlight?.requestId !== requestId) {
    return null
  }

  return activeFlight.promise
}

export function startRecognitionFlight(
  requestId: string,
  run: (signal: AbortSignal) => Promise<ProductRecognizeResult>,
): Promise<ProductRecognizeResult> {
  if (activeFlight?.requestId === requestId) {
    return activeFlight.promise
  }

  if (activeFlight) {
    activeFlight.abortController.abort('superseded')
  }

  const abortController = new AbortController()
  const promise = run(abortController.signal).finally(() => {
    if (activeFlight?.requestId === requestId) {
      activeFlight = null
    }
  })

  activeFlight = {
    requestId,
    promise,
    abortController,
  }

  return promise
}

export function cancelRecognitionFlight(requestId?: string | null): void {
  if (requestId && activeFlight?.requestId !== requestId) {
    return
  }

  activeFlight?.abortController.abort('cancelled')
  activeFlight = null
}

export function resetRecognitionFlightsForTests(): void {
  activeFlight = null
}
