import type { FertilizerCaptureDraft, FertilizerCaptureStep } from './fertilizerCaptureCore'
import type {
  FertilizerCaptureUiState,
  PhotoRecognitionSessionState,
} from './fertilizerCaptureSessionCore'

export interface CaptureNavigationSnapshot {
  captureDraft: FertilizerCaptureDraft
  photoRecognitionOpen: boolean
  photoRecognition: PhotoRecognitionSessionState | null
  query: string
  quantityInput: string
  unit: FertilizerCaptureUiState['unit']
  clarifyAnswer: string
  remainderAmountInput: string
  packageCountInput: string
  optionalOpen: boolean
  notice: string | null
}

export function createCaptureNavigationSnapshot(input: {
  captureDraft: FertilizerCaptureDraft
  photoRecognitionOpen: boolean
  photoRecognition: PhotoRecognitionSessionState | null
  query: string
  quantityInput: string
  unit: FertilizerCaptureUiState['unit']
  clarifyAnswer: string
  remainderAmountInput: string
  packageCountInput: string
  optionalOpen: boolean
  notice: string | null
}): CaptureNavigationSnapshot {
  return { ...input }
}

export function applyCaptureNavigationSnapshot(
  snapshot: CaptureNavigationSnapshot,
): CaptureNavigationSnapshot {
  return snapshot
}

export function popCaptureNavigationStack(
  stack: CaptureNavigationSnapshot[],
): {
  snapshot: CaptureNavigationSnapshot | null
  remaining: CaptureNavigationSnapshot[]
} {
  if (stack.length === 0) {
    return { snapshot: null, remaining: [] }
  }

  const snapshot = stack[stack.length - 1] ?? null

  return {
    snapshot,
    remaining: stack.slice(0, -1),
  }
}

export function shouldExitCaptureFlowOnBack(input: {
  captureStep: FertilizerCaptureStep
  photoRecognitionOpen: boolean
  navigationStackLength: number
}): boolean {
  if (input.photoRecognitionOpen) {
    return false
  }

  if (input.navigationStackLength > 0) {
    return false
  }

  return input.captureStep === 'find' || input.captureStep === 'saved'
}

/** Fallback, wenn kein Navigations-Stack vorhanden ist (z. B. älterer Session-Draft). */
export function fallbackCaptureStepBack(
  draft: FertilizerCaptureDraft,
): FertilizerCaptureDraft | null {
  switch (draft.step) {
    case 'confirm':
      if (
        draft.stockQuestion?.kind === 'ask_previous_remainder' ||
        draft.previousRemainder === 0
      ) {
        return {
          ...draft,
          step: 'stock-remainder',
          quantity: null,
          previousRemainder: null,
        }
      }

      if (draft.stockQuestion?.kind === 'ask_remainder_amount') {
        return {
          ...draft,
          step: 'stock-remainder-amount',
          quantity: null,
          previousRemainder: null,
        }
      }

      if (draft.customProductLabel != null) {
        return {
          ...draft,
          step: 'enter-quantity',
          quantity: null,
        }
      }

      if (draft.selectedProduct && draft.selectedProduct.packageSizes.length > 1) {
        return {
          ...draft,
          step: 'clarify-package',
          quantity: null,
        }
      }

      return {
        ...draft,
        step: 'find',
      }

    case 'enter-quantity':
      return {
        ...draft,
        step: 'find',
      }

    case 'stock-remainder-amount':
      return {
        ...draft,
        step: 'stock-remainder',
        previousRemainder: null,
      }

    case 'stock-remainder':
    case 'stock-package-count':
    case 'clarify-package':
      return {
        ...draft,
        step: 'find',
      }

    default:
      return null
  }
}
