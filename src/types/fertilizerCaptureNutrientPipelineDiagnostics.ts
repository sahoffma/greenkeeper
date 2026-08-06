export type FertilizerNutrientLossStage =
  | 'vision_missing'
  | 'response_parser'
  | 'packaging_parser'
  | 'adapter_merge'
  | 'zero_fill'
  | 'profile_mapping'
  | 'profile_save'
  | 'none'
  | 'unknown'

export interface FertilizerCaptureNutrientPipelineDiagnostics {
  visionNutrientMatrixEntryCount: number
  visionPositiveNutrientCount: number
  packagingTextNutrientCandidateCount: number
  packagingAdapterNutrientCount: number
  mergedPositiveNutrientCountBeforeZeroFill: number
  zeroFilledNutrientCount: number
  positiveNutrientCountAfterZeroFill: number
  positiveNutrientLostDuringMerge: number
  positiveNutrientLostDuringZeroFill: number
  nutrientLossStage: FertilizerNutrientLossStage
}
