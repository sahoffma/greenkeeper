import type { FertilizerEnrichmentProductFormValue } from '../types/fertilizerEnrichment'
import type {
  FertilizerCaptureRecognitionPackagingBasis,
  FertilizerEnrichmentOrchestrationInput,
} from '../types/fertilizerEnrichmentOrchestration'
import type { FertilizerCaptureDraft } from './fertilizerCaptureCore'

export const CAPTURE_RECOGNITION_PACKAGING_SOURCE_ID = 'captureRecognitionLabel'

export const CAPTURE_RECOGNITION_PACKAGE_UNIT_INFERRED_FORM_PROVENANCE_SUFFIX =
  ':package-unit-inferred-form'

export const PRODUCT_FORM_UNIT_CONFLICT_ID = 'conflict-product-form-unit'

function normalizedText(value: string | null | undefined): string | null {
  if (value == null) {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeFormText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function splitFormFragments(value: string): string[] {
  return value
    .split(/[/,&]| und | and /i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function fragmentsFromValues(...values: Array<string | null | undefined>): string[] {
  const fragments: string[] = []

  for (const value of values) {
    const normalized = normalizeFormText(value)
    if (!normalized || normalized === 'unknown') {
      continue
    }

    fragments.push(...splitFormFragments(normalized))
    if (!normalized.includes('/') && !normalized.includes(',') && !normalized.includes('&')) {
      fragments.push(normalized)
    }
  }

  return [...new Set(fragments)]
}

function fragmentMatchesGranular(fragment: string): boolean {
  return (
    fragment === 'granular' ||
    fragment === 'granulate' ||
    fragment === 'granulat' ||
    fragment === 'granulated' ||
    fragment === 'solid granular' ||
    fragment === 'granular fertilizer' ||
    /^granul/i.test(fragment)
  )
}

function fragmentMatchesLiquid(fragment: string): boolean {
  return (
    fragment === 'liquid' ||
    fragment === 'liquid fertilizer' ||
    fragment === 'flüssig' ||
    fragment === 'fluessig' ||
    fragment === 'flüssigdünger' ||
    fragment === 'fluessigduenger' ||
    /\b(fl[üu]ssig|liquid|spritz|konzentrat)\b/i.test(fragment)
  )
}

function fragmentMatchesRasenduenger(fragment: string): boolean {
  return /\brasend[üu]nger\b/i.test(fragment)
}

function classifyFormFragments(fragments: string[]): {
  granular: boolean
  liquid: boolean
  rasenduenger: boolean
} {
  let granular = false
  let liquid = false
  let rasenduenger = false

  for (const fragment of fragments) {
    if (fragmentMatchesGranular(fragment)) {
      granular = true
    }
    if (fragmentMatchesLiquid(fragment)) {
      liquid = true
    }
    if (fragmentMatchesRasenduenger(fragment)) {
      rasenduenger = true
    }
  }

  return { granular, liquid, rasenduenger }
}

/**
 * Maps recognition or declaration-label evidence to enrichment product form.
 * Returns `unknown` when the signal is missing or ambiguous.
 */
export function mapRecognitionProductFormToEnrichment(
  form: string | null | undefined,
  descriptor: string | null | undefined = null,
): FertilizerEnrichmentProductFormValue {
  const fragments = fragmentsFromValues(form, descriptor)
  const { granular, liquid, rasenduenger } = classifyFormFragments(fragments)

  if (liquid && granular) {
    return 'unknown'
  }

  if (liquid) {
    return 'liquid'
  }

  if (granular) {
    return 'granular'
  }

  if (rasenduenger) {
    return 'unknown'
  }

  return 'unknown'
}

export function mapDeclarationProductFormLabelToEnrichment(
  label: string | null | undefined,
): FertilizerEnrichmentProductFormValue {
  return mapRecognitionProductFormToEnrichment(label, null)
}

export function mapAdapterExtractedProductFormToEnrichment(
  form: FertilizerEnrichmentProductFormValue,
): 'granular' | 'liquid' | null {
  if (form === 'granular' || form === 'liquid') {
    return form
  }

  if (form != null && form !== 'unknown') {
    const mapped = mapDeclarationProductFormLabelToEnrichment(form)
    if (mapped === 'granular' || mapped === 'liquid') {
      return mapped
    }
  }

  return null
}

export function normalizePackageSizeUnit(unit: string | null | undefined): string | null {
  const normalized = normalizedText(unit)?.toLowerCase()
  if (!normalized) {
    return null
  }

  if (normalized === 'kilogram' || normalized === 'kilogramm' || normalized === 'kg') {
    return 'kg'
  }

  if (normalized === 'gram' || normalized === 'gramm' || normalized === 'g') {
    return 'g'
  }

  if (normalized === 'liter' || normalized === 'litre' || normalized === 'l') {
    return 'l'
  }

  if (normalized === 'milliliter' || normalized === 'millilitre' || normalized === 'ml') {
    return 'ml'
  }

  return normalized
}

/**
 * Generic Greenkeeper rule: infer product form from package unit when no explicit form exists.
 */
export function inferProductFormFromPackageUnit(
  unit: string | null | undefined,
): 'granular' | 'liquid' | null {
  const normalized = normalizePackageSizeUnit(unit)
  if (!normalized) {
    return null
  }

  if (normalized === 'kg' || normalized === 'g') {
    return 'granular'
  }

  if (normalized === 'l' || normalized === 'ml') {
    return 'liquid'
  }

  return null
}

export function resolveProductFormFromCapturePackageUnit(
  input: FertilizerEnrichmentOrchestrationInput,
): 'granular' | 'liquid' | null {
  const basis = input.captureRecognitionPackagingBasis
  if (!basis?.packageSizeUnit) {
    return null
  }

  if (basis.packageSizeValue != null && basis.packageSizeValue <= 0) {
    return null
  }

  return inferProductFormFromPackageUnit(basis.packageSizeUnit)
}

export function resolveCapturePackageUnitInferredFormProvenanceId(
  input: FertilizerEnrichmentOrchestrationInput,
): string {
  const basisSourceId =
    input.captureRecognitionPackagingBasis?.sourceId ?? CAPTURE_RECOGNITION_PACKAGING_SOURCE_ID
  return `${basisSourceId}${CAPTURE_RECOGNITION_PACKAGE_UNIT_INFERRED_FORM_PROVENANCE_SUFFIX}`
}

export function resolveRecognitionFormEvidence(input: {
  formRawValue?: string | null
  formNormalizedValue?: string | null
  descriptorRawValue?: string | null
  descriptorNormalizedValue?: string | null
}): {
  formLabel: string | null
  descriptorLabel: string | null
} {
  const formLabel =
    normalizedText(input.formRawValue) ??
    (input.formNormalizedValue != null && input.formNormalizedValue !== 'unknown'
      ? normalizedText(input.formNormalizedValue)
      : null)
  const descriptorLabel =
    normalizedText(input.descriptorRawValue) ?? normalizedText(input.descriptorNormalizedValue)

  return { formLabel, descriptorLabel }
}

export type EnrichmentFormEvidenceCategory =
  | 'granular'
  | 'liquid'
  | 'ambiguous'
  | 'unknown'
  | 'missing'

export function classifyEnrichmentFormEvidenceCategory(
  form: string | null | undefined,
  descriptor: string | null | undefined = null,
): EnrichmentFormEvidenceCategory {
  if (!normalizedText(form) && !normalizedText(descriptor)) {
    return 'missing'
  }

  const fragments = fragmentsFromValues(form, descriptor)
  const { granular, liquid } = classifyFormFragments(fragments)

  if (liquid && granular) {
    return 'ambiguous'
  }

  const mapped = mapRecognitionProductFormToEnrichment(form, descriptor)
  if (mapped === 'granular') {
    return 'granular'
  }

  if (mapped === 'liquid') {
    return 'liquid'
  }

  return 'unknown'
}

export type RecognitionFormEvidenceSourceField =
  | 'form'
  | 'normalizedValue'
  | 'productDescriptor'
  | 'packagingBasis'
  | 'none'

export function resolveRecognitionFormEvidenceSourceField(input: {
  formRawValue?: string | null
  formNormalizedValue?: string | null
  descriptorRawValue?: string | null
  descriptorNormalizedValue?: string | null
  packagingBasisProductForm?: 'granular' | 'liquid' | null
}): RecognitionFormEvidenceSourceField {
  if (input.packagingBasisProductForm === 'granular' || input.packagingBasisProductForm === 'liquid') {
    return 'packagingBasis'
  }

  if (
    classifyEnrichmentFormEvidenceCategory(input.formRawValue, null) === 'granular' ||
    classifyEnrichmentFormEvidenceCategory(input.formRawValue, null) === 'liquid'
  ) {
    return 'form'
  }

  if (
    input.formNormalizedValue === 'granular' ||
    input.formNormalizedValue === 'liquid'
  ) {
    return 'normalizedValue'
  }

  const descriptorCategory = classifyEnrichmentFormEvidenceCategory(null, input.descriptorRawValue ?? input.descriptorNormalizedValue)
  if (descriptorCategory === 'granular' || descriptorCategory === 'liquid') {
    return 'productDescriptor'
  }

  return 'none'
}

export function resolveExplicitOrchestrationRecognitionProductForm(
  input: FertilizerEnrichmentOrchestrationInput,
): 'granular' | 'liquid' | null {
  const basis = input.captureRecognitionPackagingBasis
  if (basis?.productForm === 'granular' || basis?.productForm === 'liquid') {
    return basis.productForm
  }

  const remappedFromBasis = mapRecognitionProductFormToEnrichment(
    basis?.recognitionFormLabel,
    basis?.recognitionDescriptorLabel,
  )
  if (remappedFromBasis === 'granular' || remappedFromBasis === 'liquid') {
    return remappedFromBasis
  }

  const inlineText = input.captureInlineSourceTexts?.[CAPTURE_RECOGNITION_PACKAGING_SOURCE_ID]
  if (inlineText) {
    const formLine = /\bform\s*[:=]?\s*(.+)/i.exec(inlineText)?.[1]?.trim()
    if (formLine) {
      const mapped = mapDeclarationProductFormLabelToEnrichment(formLine)
      if (mapped === 'granular' || mapped === 'liquid') {
        return mapped
      }
    }
  }

  return null
}

export function resolveOrchestrationRecognitionProductForm(
  input: FertilizerEnrichmentOrchestrationInput,
): 'granular' | 'liquid' | null {
  return (
    resolveExplicitOrchestrationRecognitionProductForm(input) ??
    resolveProductFormFromCapturePackageUnit(input)
  )
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
    const formEvidence = resolveRecognitionFormEvidence({
      formRawValue: recognition.form.rawValue,
      formNormalizedValue: recognition.form.normalizedValue,
      descriptorRawValue: recognition.productDescriptor.rawValue,
      descriptorNormalizedValue: recognition.productDescriptor.normalizedValue,
    })
    const productForm = mapRecognitionProductFormToEnrichment(
      formEvidence.formLabel,
      formEvidence.descriptorLabel,
    )
    const npk = resolveNpkTriplet({
      rawLabel: recognition.npk.rawLabel,
      nitrogen: recognition.npk.nitrogen,
      phosphate: recognition.npk.phosphate,
      potash: recognition.npk.potash,
    })

    if (!officialName && !manufacturer && !npk && productForm == null && recognition.packageSize.normalizedValue == null) {
      return null
    }

    return {
      sourceId: CAPTURE_RECOGNITION_PACKAGING_SOURCE_ID,
      manufacturer,
      officialName,
      productLine,
      variant,
      productForm: productForm === 'unknown' ? null : productForm,
      recognitionFormLabel: formEvidence.formLabel,
      recognitionDescriptorLabel: formEvidence.descriptorLabel,
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
    recognitionFormLabel: normalizedText(candidate.productForm),
    recognitionDescriptorLabel: null,
    npk: null,
    packageSizeValue: candidate.packageSizeValue,
    packageSizeUnit: candidate.packageSizeUnit,
  }
}
