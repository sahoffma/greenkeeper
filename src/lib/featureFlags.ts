/**
 * Client-seitige Feature-Flags (VITE_* — keine Geheimnisse).
 */

export function isProductRecognitionEnabled(): boolean {
  return import.meta.env.VITE_PRODUCT_RECOGNITION_ENABLED === 'true'
}
