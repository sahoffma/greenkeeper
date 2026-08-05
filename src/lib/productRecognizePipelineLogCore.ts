export const PRODUCT_RECOGNIZE_PIPELINE_LOG_PREFIX = '[product-recognize-pipeline]'

export function logProductRecognizePipeline(
  stage: string,
  details: Record<string, unknown>,
): void {
  console.info(PRODUCT_RECOGNIZE_PIPELINE_LOG_PREFIX, {
    stage,
    ...details,
  })
}

export function logProductRecognizePipelineError(
  stage: string,
  details: Record<string, unknown>,
): void {
  console.error(PRODUCT_RECOGNIZE_PIPELINE_LOG_PREFIX, {
    stage,
    ...details,
  })
}
