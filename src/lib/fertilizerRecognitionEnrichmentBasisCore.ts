import type { FertilizerEnrichmentProductFormValue } from '../types/fertilizerEnrichment'
import type { FertilizerCaptureRecognitionPackagingBasis } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerCaptureDraft } from './fertilizerCaptureCore'

export const CAPTURE_RECOGNITION_PACKAGING_SOURCE_ID = 'captureRecognitionLabel'

function normalizedText(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function resolveNpkTriplet(input: {
  rawLabel: string | null
  nitrogen: number | null
  phosphate: number | null
  potash: number | null
}): { nitrogen: number; phosphate: number; potash: number } | null {
  if (
    input.nitrogen != null &&
    input.phosphate != null &&
    input.potash != null
  ) {
    return {
      nitrogen: input.nitrogen,
      phosphate: input.phosphate,
      potash: input.potash,
    }
  }

  const raw = normalizedText(input.rawLabel)?.replace(/^npk\s*/i, '').trim()
  if (!raw) {
    return null
  }

  const match = /^(\d+(?:[.,]\d+)?)\s*[-–—/]\s*(\d+(?:[.,]\d+)?)\s*[-–—/]\s*(\d+(?:[.,]\d+)?)$/i.exec(
    raw,
  )
  if (!match) {
    return null
  }

  const parse = (value: string): number | null => {
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }

  const nitrogen = parse(match[1])
  const phosphate = parse(match[2])
  const potash = parse(match[3])

  if (nitrogen == null || phosphate == null || potash == null) {
    return null
  }

  return { nitrogen, phosphate, potash }
}

/**
 * Maps recognition product-form evidence to the enrichment schema.
 * Returns `unknown` when the signal is missing or ambiguous (e.g. granular + liquid hints).
 */
export function mapRecognitionProductFormToEnrichment(
  form: string | null | undefined,
  descriptor: string | null | undefined = null,
): FertilizerEnrichmentProductFormValue {
  const normalizedForm = (form ?? '').trim().toLowerCase()
  const normalizedDescriptor = (descriptor ?? '').trim().toLowerCase()

  const liquidHint =
    /\b(fl[üu]ssig|liquid|spritz|konzentrat)\b/i.test(normalizedForm) ||
    /\b(fl[üu]ssig|liquid|spritz|konzentrat)\b/i.test(normalizedDescriptor)
  const granularHint =
    normalizedForm === 'granular' ||
    normalizedForm === 'granulat' ||
    /\bgranul/i.test(normalizedForm) ||
    (/\brasend[üu]nger\b/i.test(normalizedDescriptor) && !liquidHint)

  if (liquidHint && granularHint) {
    return 'unknown'
  }

  if (liquidHint) {
    return 'liquid'
  }

  if (granularHint) {
    return 'granular'
  }

  if (normalizedForm === 'liquid') {
    return 'liquid'
  }

  if (normalizedForm === 'granular') {
    return 'granular'
  }

  return 'unknown'
}

export function resolveRecognitionManufacturer(input: {
  manufacturer: string | null | undefined
  brand: string | null | undefined
}): string | null {
  return normalizedText(input.manufacturer) ?? normalizedText(input.brand)
}

export function resolveRecognitionProductFormLabel(
  form: FertilizerEnrichmentProductFormValue,
): string | null {
  if (form === 'granular') {
    return 'Granular'
  }

  if (form === 'liquid') {
    return 'Liquid'
  }

  return null
}

export function buildCaptureRecognitionPackagingBasis(
  draft: FertilizerCaptureDraft,
): FertilizerCaptureRecognitionPackagingBasis | null {
  if (draft.recognitionResult) {
    const recognition = draft.recognitionResult.recognition
    const manufacturer = resolveRecognitionManufacturer({
      manufacturer: recognition.manufacturer.normalizedValue,
      brand: recognition.brand.normalizedValue,
    })
    const officialName =
      normalizedText(recognition.productName.normalizedValue) ??
      normalizedText(recognition.variant.normalizedValue)
    const productLine = normalizedText(recognition.productLine.normalizedValue)
    const variant = normalizedText(recognition.variant.normalizedValue)
    const productForm = mapRecognitionProductFormToEnrichment(
      recognition.form.normalizedValue,
      recognition.productDescriptor.normalizedValue,
    )
    const npk = resolveNpkTriplet({
      rawLabel: recognition.npk.rawLabel,
      nitrogen: recognition.npk.nitrogen,
      phosphate: recognition.npk.phosphate,
      potash: recognition.npk.potash,
    })

    if (!officialName && !manufacturer && !npk && productForm == null) {
      return null
    }

    return {
      sourceId: CAPTURE_RECOGNITION_PACKAGING_SOURCE_ID,
      manufacturer,
      officialName,
      productLine,
      variant,
      productForm: productForm === 'unknown' ? null : productForm,
      npk,
      packageSizeValue: recognition.packageSize.normalizedValue,
      packageSizeUnit: recognition.packageSize.unit,
    }
  }

  const candidate = draft.recognitionCandidate
  if (!candidate) {
    return null
  }

  const manufacturer = resolveRecognitionManufacturer({
    manufacturer:
      candidate.manufacturer?.value != null ? String(candidate.manufacturer.value) : null,
    brand: candidate.brand?.value != null ? String(candidate.brand.value) : null,
  })
  const officialName = normalizedText(
    candidate.productName?.value != null ? String(candidate.productName.value) : null,
  )
  const productLine = normalizedText(
    candidate.productLine?.value != null ? String(candidate.productLine.value) : null,
  )
  const variant = normalizedText(
    candidate.variant?.value != null ? String(candidate.variant.value) : null,
  )
  const productForm = mapRecognitionProductFormToEnrichment(candidate.productForm, null)

  if (!officialName && !manufacturer) {
    return null
  }

  return {
    sourceId: CAPTURE_RECOGNITION_PACKAGING_SOURCE_ID,
    manufacturer,
    officialName,
    productLine,
    variant,
    productForm: productForm === 'unknown' ? null : productForm,
    npk: null,
    packageSizeValue: candidate.packageSizeValue,
    packageSizeUnit: candidate.packageSizeUnit,
  }
}
