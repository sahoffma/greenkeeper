import type { FertilizerEnrichmentOrchestrationInput } from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerCaptureDraft } from './fertilizerCaptureCore'
import {
  buildCaptureRecognitionPackagingBasis,
  mapRecognitionProductFormToEnrichment,
  resolveRecognitionManufacturer,
  resolveRecognitionProductFormLabel,
  resolveNpkTriplet,
} from './fertilizerRecognitionEnrichmentBasisCore'

export const CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID = 'captureRecognitionLabel'

function normalizedText(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function resolveNpkLabel(input: {
  rawLabel: string | null
  nitrogen: number | null
  phosphate: number | null
  potash: number | null
}): string | null {
  const triplet = resolveNpkTriplet(input)
  if (triplet) {
    return `${triplet.nitrogen}-${triplet.phosphate}-${triplet.potash}`
  }

  const raw = normalizedText(input.rawLabel)
  if (raw) {
    return raw.replace(/^npk\s*/i, '').trim() || raw
  }

  return null
}

export function buildCaptureRecognitionPackagingDeclarationText(
  draft: FertilizerCaptureDraft,
): string | null {
  if (draft.recognitionResult) {
    const recognition = draft.recognitionResult.recognition
    const manufacturer = resolveRecognitionManufacturer({
      manufacturer: recognition.manufacturer.normalizedValue,
      brand: recognition.brand.normalizedValue,
    })
    const productName =
      normalizedText(recognition.productName.normalizedValue) ??
      normalizedText(recognition.variant.normalizedValue)
    const variant = normalizedText(recognition.variant.normalizedValue)
    const npk = resolveNpkLabel({
      rawLabel: recognition.npk.rawLabel,
      nitrogen: recognition.npk.nitrogen,
      phosphate: recognition.npk.phosphate,
      potash: recognition.npk.potash,
    })
    const form = resolveRecognitionProductFormLabel(
      mapRecognitionProductFormToEnrichment(
        recognition.form.normalizedValue,
        recognition.productDescriptor.normalizedValue,
      ),
    )

    if (!productName && !manufacturer && !npk) {
      return null
    }

    const lines: string[] = []
    if (manufacturer) {
      lines.push(`Manufacturer: ${manufacturer}`)
    }
    if (productName) {
      lines.push(`Product: ${productName}`)
    }
    if (variant && variant !== productName) {
      lines.push(`Product variant: ${variant}`)
    }
    if (form) {
      lines.push(`Form: ${form}`)
    }
    if (npk) {
      lines.push('', `NPK ${npk}`, 'Declaration basis (N / P2O5 / K2O)', '')
      if (recognition.npk.nitrogen != null) {
        lines.push(`Nitrogen (N): ${recognition.npk.nitrogen}%`)
      }
      if (recognition.npk.phosphate != null) {
        lines.push(`Phosphate (P2O5): ${recognition.npk.phosphate}%`)
      }
      if (recognition.npk.potash != null) {
        lines.push(`Potash (K2O): ${recognition.npk.potash}%`)
      }
    }

    lines.push('Declaration section complete')
    return lines.join('\n')
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
  const productName = normalizedText(
    candidate.productName?.value != null ? String(candidate.productName.value) : null,
  )
  const variant = normalizedText(
    candidate.variant?.value != null ? String(candidate.variant.value) : null,
  )
  const form = resolveRecognitionProductFormLabel(
    mapRecognitionProductFormToEnrichment(candidate.productForm, null),
  )

  if (!productName && !manufacturer) {
    return null
  }

  const lines: string[] = []
  if (manufacturer) {
    lines.push(`Manufacturer: ${manufacturer}`)
  }
  if (productName) {
    lines.push(`Product: ${productName}`)
  }
  if (variant && variant !== productName) {
    lines.push(`Product variant: ${variant}`)
  }
  if (form) {
    lines.push(`Form: ${form}`)
  }
  lines.push('Declaration section complete')
  return lines.join('\n')
}

export function appendCaptureRecognitionPackagingToEnrichmentInput<
  T extends FertilizerEnrichmentOrchestrationInput,
>(input: T, draft: FertilizerCaptureDraft): T {
  const declarationText = buildCaptureRecognitionPackagingDeclarationText(draft)
  const packagingBasis = buildCaptureRecognitionPackagingBasis(draft)

  if (!declarationText && !packagingBasis) {
    return input
  }

  const userProvidedSources = [...(input.userProvidedSources ?? [])]
  const sourceHints = [...(input.sourceHints ?? [])]

  if (
    declarationText &&
    !userProvidedSources.some(
      (source) => source.referenceId === CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID,
    )
  ) {
    userProvidedSources.push({
      kind: 'packaging_back_photo',
      referenceId: CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID,
    })
  }

  if (
    declarationText &&
    !sourceHints.some(
      (hint) => hint.referenceId === CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID,
    )
  ) {
    sourceHints.push({
      referenceId: CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID,
      adapterType: 'packaging',
      hintType: 'recognition',
    })
  }

  return {
    ...input,
    userProvidedSources,
    sourceHints,
    captureInlineSourceTexts: declarationText
      ? {
          ...(input.captureInlineSourceTexts ?? {}),
          [CAPTURE_RECOGNITION_PACKAGING_REFERENCE_ID]: declarationText,
        }
      : input.captureInlineSourceTexts,
    captureRecognitionPackagingBasis: packagingBasis ?? input.captureRecognitionPackagingBasis,
  }
}
