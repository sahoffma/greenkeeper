import type {
  ProductRecognizeImageAnalysis,
  ProductRecognizeRecognition,
  ProductRecognizeResult,
} from '../types/productRecognize'
import { normalizePackageSizeUnit } from './productRecognizePackageSizeParseCore'

export type PackageSizeHandoffLossStage =
  | 'identity_mapper'
  | 'result_builder'
  | 'server_serialization'
  | 'client_deserialization'
  | 'accept_recognition'
  | 'draft_transition'
  | 'none'
  | 'unknown'

export type PackageSizeUnitCategory = 'mass' | 'volume' | 'unknown' | 'missing'

export interface PackageSizeHandoffDiagnostics {
  imageAnalysisPackageSizePresent: boolean
  identityMapperInputPackageSizePresent: boolean
  identityMapperOutputPackageSizePresent: boolean
  finalRecognitionPackageSizePresent: boolean
  responseRecognitionPackageSizePresent: boolean
  clientRecognitionPackageSizePresent: boolean
  acceptInputPackageSizePresent: boolean | undefined
  acceptOutputSelectedPackagePresent: boolean | undefined
  acceptOutputRecognitionPackageSizePresent: boolean | undefined
  packageSizeUnitCategory: PackageSizeUnitCategory
  packageSizeHandoffLossStage: PackageSizeHandoffLossStage
}

function optionalRecognitionPackageSize(
  recognition: ProductRecognizeRecognition | null | undefined,
): boolean | undefined {
  if (recognition === undefined) {
    return undefined
  }

  return hasRecognitionPackageSize(recognition)
}

function classifyUnitCategory(unit: string | null | undefined): PackageSizeUnitCategory {
  const normalized = normalizePackageSizeUnit(unit)
  if (!normalized) {
    return 'missing'
  }

  if (normalized === 'kg' || normalized === 'g') {
    return 'mass'
  }

  if (normalized === 'l' || normalized === 'ml') {
    return 'volume'
  }

  return 'unknown'
}

export function hasImageAnalysisPackageSize(analysis: ProductRecognizeImageAnalysis | null | undefined): boolean {
  return analysis?.packageSizeValue != null && analysis.packageSizeValue > 0
}

export function hasRecognitionPackageSize(
  recognition: ProductRecognizeRecognition | null | undefined,
): boolean {
  return (
    recognition?.packageSize.normalizedValue != null && recognition.packageSize.normalizedValue > 0
  )
}

export function buildPackageSizeHandoffDiagnostics(input: {
  imageAnalysis?: ProductRecognizeImageAnalysis | null
  identityMapperInput?: ProductRecognizeImageAnalysis | null
  identityMapperOutput?: ProductRecognizeRecognition | null
  finalRecognition?: ProductRecognizeRecognition | null
  responseRecognition?: ProductRecognizeRecognition | null
  clientRecognition?: ProductRecognizeRecognition | null
  acceptInputRecognition?: ProductRecognizeRecognition | null
  acceptOutputSelectedPackagePresent?: boolean
  acceptOutputRecognition?: ProductRecognizeRecognition | null
}): PackageSizeHandoffDiagnostics {
  const imageAnalysisPackageSizePresent = hasImageAnalysisPackageSize(input.imageAnalysis)
  const identityMapperInputPackageSizePresent = hasImageAnalysisPackageSize(input.identityMapperInput)
  const identityMapperOutputPackageSizePresent = hasRecognitionPackageSize(input.identityMapperOutput)
  const finalRecognitionPackageSizePresent = hasRecognitionPackageSize(input.finalRecognition)
  const responseRecognitionPackageSizePresent = hasRecognitionPackageSize(input.responseRecognition)
  const clientRecognitionPackageSizePresent = hasRecognitionPackageSize(input.clientRecognition)
  const acceptInputPackageSizePresent = optionalRecognitionPackageSize(input.acceptInputRecognition)
  const acceptOutputRecognitionPackageSizePresent = optionalRecognitionPackageSize(
    input.acceptOutputRecognition,
  )
  const acceptOutputSelectedPackagePresent =
    input.acceptOutputSelectedPackagePresent === undefined
      ? undefined
      : input.acceptOutputSelectedPackagePresent === true

  const unit =
    input.acceptOutputRecognition?.packageSize.unit ??
    input.clientRecognition?.packageSize.unit ??
    input.finalRecognition?.packageSize.unit ??
    input.imageAnalysis?.packageSizeUnit

  return {
    imageAnalysisPackageSizePresent,
    identityMapperInputPackageSizePresent,
    identityMapperOutputPackageSizePresent,
    finalRecognitionPackageSizePresent,
    responseRecognitionPackageSizePresent,
    clientRecognitionPackageSizePresent,
    acceptInputPackageSizePresent,
    acceptOutputSelectedPackagePresent,
    acceptOutputRecognitionPackageSizePresent,
    packageSizeUnitCategory: classifyUnitCategory(unit),
    packageSizeHandoffLossStage: resolvePackageSizeHandoffLossStage({
      imageAnalysisPackageSizePresent,
      identityMapperOutputPackageSizePresent,
      finalRecognitionPackageSizePresent,
      responseRecognitionPackageSizePresent,
      clientRecognitionPackageSizePresent,
      acceptInputPackageSizePresent,
      acceptOutputRecognitionPackageSizePresent,
      acceptOutputSelectedPackagePresent,
    }),
  }
}

function resolvePackageSizeHandoffLossStage(input: {
  imageAnalysisPackageSizePresent: boolean
  identityMapperOutputPackageSizePresent: boolean
  finalRecognitionPackageSizePresent: boolean
  responseRecognitionPackageSizePresent: boolean
  clientRecognitionPackageSizePresent: boolean
  acceptInputPackageSizePresent: boolean | undefined
  acceptOutputRecognitionPackageSizePresent: boolean | undefined
  acceptOutputSelectedPackagePresent: boolean | undefined
}): PackageSizeHandoffLossStage {
  if (!input.imageAnalysisPackageSizePresent) {
    return 'none'
  }

  if (!input.identityMapperOutputPackageSizePresent) {
    return 'identity_mapper'
  }

  if (!input.finalRecognitionPackageSizePresent) {
    return 'result_builder'
  }

  if (!input.responseRecognitionPackageSizePresent) {
    return 'server_serialization'
  }

  if (!input.clientRecognitionPackageSizePresent) {
    return 'client_deserialization'
  }

  if (input.acceptInputPackageSizePresent === false) {
    return 'accept_recognition'
  }

  if (
    input.acceptOutputRecognitionPackageSizePresent === false ||
    input.acceptOutputSelectedPackagePresent === false
  ) {
    return 'draft_transition'
  }

  return 'none'
}

export function recognitionPackageSizeFromResult(
  result: ProductRecognizeResult | null | undefined,
): ProductRecognizeRecognition | null {
  return result?.recognition ?? null
}

export const CAPTURE_PACKAGE_HANDOFF_LOG_PREFIX = '[fertilizer-capture-package-handoff]'

export function logCapturePackageHandoffDiagnostic(
  stage: string,
  diagnostics: PackageSizeHandoffDiagnostics,
): void {
  console.info(CAPTURE_PACKAGE_HANDOFF_LOG_PREFIX, {
    handoffStage: stage,
    ...diagnostics,
  })
}

export const PRODUCT_RECOGNIZE_CLIENT_PACKAGE_HANDOFF_LOG_PREFIX =
  '[product-recognize-client-package-handoff]'

export function logProductRecognizeClientPackageHandoff(
  result: ProductRecognizeResult,
): void {
  console.info(PRODUCT_RECOGNIZE_CLIENT_PACKAGE_HANDOFF_LOG_PREFIX, {
    handoffStage: 'client_deserialization',
    ...buildPackageSizeHandoffDiagnostics({
      clientRecognition: result.recognition,
    }),
  })
}
