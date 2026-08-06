import type { PhotoRecognitionSessionState } from './fertilizerCaptureSessionCore'
import type { FertilizerCaptureDraft } from './fertilizerCaptureCore'
import { acceptRecognitionResult } from './fertilizerCaptureCore'
import type { ProductRecognizeRecognition, ProductRecognizeResult } from '../types/productRecognize'
import type { FertilizerProductStockStatus } from '../types/fertilizerInventory'
import { hasRecognitionPackageSize } from './productRecognizePackageHandoffDiagnosticsCore'
import { recognitionAllowsAcceptance } from './fertilizerRecognitionCore'

export type RecognitionAcceptArgumentKind =
  | 'full_result'
  | 'recognition_only'
  | 'candidate'
  | 'reconstructed'
  | 'unknown'

export type ClientPackageSizeLossStage =
  | 'response_parse'
  | 'state_storage'
  | 'accept_handler'
  | 'result_reconstruction'
  | 'draft_accept'
  | 'none'
  | 'unknown'

export interface RecognitionClientHandoffTrace {
  recognitionHttpResponsePackageSizePresent: boolean
  recognitionClientParsedPackageSizePresent: boolean
  recognitionStateStoredPackageSizePresent: boolean
  recognitionAcceptHandlerPackageSizePresent: boolean | undefined
  recognitionAcceptArgumentKind: RecognitionAcceptArgumentKind
  clientPackageSizeLossStage: ClientPackageSizeLossStage
}

export function createEmptyRecognitionClientHandoffTrace(): RecognitionClientHandoffTrace {
  return {
    recognitionHttpResponsePackageSizePresent: false,
    recognitionClientParsedPackageSizePresent: false,
    recognitionStateStoredPackageSizePresent: false,
    recognitionAcceptHandlerPackageSizePresent: undefined,
    recognitionAcceptArgumentKind: 'unknown',
    clientPackageSizeLossStage: 'unknown',
  }
}

export function probeRecognitionResultPackageSize(
  result: ProductRecognizeResult | null | undefined,
): boolean {
  return hasRecognitionPackageSize(result?.recognition ?? null)
}

export function cloneProductRecognizeResultForClientHandoff(
  result: ProductRecognizeResult,
): ProductRecognizeResult {
  return JSON.parse(JSON.stringify(result)) as ProductRecognizeResult
}

export function classifyRecognitionAcceptArgumentKind(input: {
  result: ProductRecognizeResult | null | undefined
  recognitionOnly?: ProductRecognizeRecognition | null
  candidateSnapshot?: ProductRecognizeRecognition | null
}): RecognitionAcceptArgumentKind {
  if (input.result && typeof input.result.status === 'string' && input.result.recognition) {
    return 'full_result'
  }

  if (input.recognitionOnly) {
    return 'recognition_only'
  }

  if (input.candidateSnapshot) {
    return 'candidate'
  }

  return 'unknown'
}

export function resolveClientPackageSizeLossStage(
  trace: Pick<
    RecognitionClientHandoffTrace,
    | 'recognitionHttpResponsePackageSizePresent'
    | 'recognitionClientParsedPackageSizePresent'
    | 'recognitionStateStoredPackageSizePresent'
    | 'recognitionAcceptHandlerPackageSizePresent'
  >,
): ClientPackageSizeLossStage {
  if (!trace.recognitionHttpResponsePackageSizePresent) {
    return 'none'
  }

  if (!trace.recognitionClientParsedPackageSizePresent) {
    return 'response_parse'
  }

  if (!trace.recognitionStateStoredPackageSizePresent) {
    return 'state_storage'
  }

  if (trace.recognitionAcceptHandlerPackageSizePresent === false) {
    return 'accept_handler'
  }

  return 'none'
}

export function mergeRecognitionClientHandoffTrace(
  base: RecognitionClientHandoffTrace | null | undefined,
  patch: Partial<RecognitionClientHandoffTrace>,
): RecognitionClientHandoffTrace {
  const merged: RecognitionClientHandoffTrace = {
    ...createEmptyRecognitionClientHandoffTrace(),
    ...base,
    ...patch,
  }

  merged.clientPackageSizeLossStage = resolveClientPackageSizeLossStage(merged)
  return merged
}

export function buildRecognitionClientParsedHandoffPatch(
  result: ProductRecognizeResult,
): Partial<RecognitionClientHandoffTrace> {
  const present = probeRecognitionResultPackageSize(result)

  return {
    recognitionHttpResponsePackageSizePresent: present,
    recognitionClientParsedPackageSizePresent: present,
  }
}

/** Mirrors FertilizerPhotoRecognition applyRecognitionResponse success branch. */
export function storePhotoRecognitionAnalysisResult(
  session: PhotoRecognitionSessionState,
  response: ProductRecognizeResult,
  trace: RecognitionClientHandoffTrace | null | undefined,
): {
  session: PhotoRecognitionSessionState
  trace: RecognitionClientHandoffTrace
} {
  const canonicalResult = cloneProductRecognizeResultForClientHandoff(response)
  const storedPresent = probeRecognitionResultPackageSize(canonicalResult)
  const mergedTrace = mergeRecognitionClientHandoffTrace(trace, {
    ...buildRecognitionClientParsedHandoffPatch(canonicalResult),
    recognitionStateStoredPackageSizePresent: storedPresent,
  })

  if (!recognitionAllowsAcceptance(canonicalResult)) {
    return { session, trace: mergedTrace }
  }

  return {
    session: {
      ...session,
      phase: 'result',
      result: canonicalResult,
      errorMessage: null,
      inFlightRequestId: null,
    },
    trace: mergedTrace,
  }
}

/** Mirrors FertilizerPhotoRecognition handleAccept. */
export function resolvePhotoRecognitionAcceptInvocation(
  session: PhotoRecognitionSessionState,
  trace: RecognitionClientHandoffTrace | null | undefined,
): {
  result: ProductRecognizeResult
  trace: RecognitionClientHandoffTrace
  acceptArgumentKind: RecognitionAcceptArgumentKind
} | null {
  if (!session.result) {
    return null
  }

  const acceptHandlerPresent = probeRecognitionResultPackageSize(session.result)
  const acceptArgumentKind = classifyRecognitionAcceptArgumentKind({ result: session.result })
  const mergedTrace = mergeRecognitionClientHandoffTrace(trace, {
    recognitionAcceptHandlerPackageSizePresent: acceptHandlerPresent,
    recognitionAcceptArgumentKind: acceptArgumentKind,
  })

  return {
    result: session.result,
    trace: mergedTrace,
    acceptArgumentKind,
  }
}

/** Mirrors FertilizerCaptureFlow handleRecognitionAccept before draft update. */
export async function runCaptureFlowRecognitionAccept(input: {
  draft: FertilizerCaptureDraft
  acceptInvocation: NonNullable<ReturnType<typeof resolvePhotoRecognitionAcceptInvocation>>
  fetchStockStatus: (input: {
    catalogProductId: string | null
    identityFingerprint: string | null
    unit: string
  }) => Promise<FertilizerProductStockStatus>
  catalogProductId: string | null
  identityFingerprint: string | null
}): Promise<{
  draft: FertilizerCaptureDraft
  trace: RecognitionClientHandoffTrace
}> {
  const { result, trace } = input.acceptInvocation
  const unit = result.recognition.packageSize.unit ?? 'kg'
  const stockStatus = await input.fetchStockStatus({
    catalogProductId: input.catalogProductId,
    identityFingerprint: input.identityFingerprint,
    unit,
  })

  const nextDraft = acceptRecognitionResult(input.draft, result, {
    stockStatus,
    clientHandoffTrace: trace,
  })

  const draftAcceptPresent = probeRecognitionResultPackageSize(nextDraft.recognitionResult)
  const mergedTrace = mergeRecognitionClientHandoffTrace(trace, {
    recognitionAcceptHandlerPackageSizePresent: probeRecognitionResultPackageSize(result),
    recognitionAcceptArgumentKind: trace.recognitionAcceptArgumentKind,
  })

  if (draftAcceptPresent) {
    return {
      draft: nextDraft,
      trace: mergeRecognitionClientHandoffTrace(mergedTrace, {
        clientPackageSizeLossStage: 'none',
      }),
    }
  }

  return {
    draft: nextDraft,
    trace: mergeRecognitionClientHandoffTrace(mergedTrace, {
      clientPackageSizeLossStage: 'draft_accept',
    }),
  }
}

export function recognitionClientHandoffTraceForDraft(
  draft: FertilizerCaptureDraft,
): RecognitionClientHandoffTrace | null {
  return draft.recognitionClientHandoffTrace ?? null
}
