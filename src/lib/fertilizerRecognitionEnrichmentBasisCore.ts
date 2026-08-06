import type { FertilizerEnrichmentProductFormValue } from '../types/fertilizerEnrichment'
import type {
  FertilizerCaptureRecognitionPackagingBasis,
  FertilizerEnrichmentOrchestrationInput,
  CaptureDraftPackageDiagnostics,
  CaptureDraftPackageSizeSource,
} from '../types/fertilizerEnrichmentOrchestration'
import type { ProductRecognizeRecognition } from '../types/productRecognize'
import type { FertilizerCaptureDraft } from './fertilizerCaptureCore'
import {
  normalizePackageSizeUnit,
  parsePackageSizeFromRawText,
} from './productRecognizePackageSizeParseCore'

export { parsePackageSizeFromRawText, normalizePackageSizeUnit } from './productRecognizePackageSizeParseCore'

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

export function classifyRecognitionPackageSizeUnitCategory(
  unit: string | null | undefined,
): 'mass' | 'volume' | 'unknown' | 'missing' {
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

export function resolveCaptureDraftRecognition(
  draft: FertilizerCaptureDraft,
): ProductRecognizeRecognition | null {
  if (draft.recognitionResult?.recognition) {
    return draft.recognitionResult.recognition
  }

  return draft.recognitionCandidate?.recognitionSnapshot ?? null
}

export type { CaptureDraftPackageDiagnostics, CaptureDraftPackageSizeSource }

export function resolveRecognitionPackageSizeFromRecognition(
  recognition: ProductRecognizeRecognition,
): { value: number | null; unit: string | null } {
  if (
    recognition.packageSize.normalizedValue != null &&
    recognition.packageSize.normalizedValue > 0
  ) {
    return {
      value: recognition.packageSize.normalizedValue,
      unit: recognition.packageSize.unit,
    }
  }

  const fromRaw = parsePackageSizeFromRawText(recognition.packageSize.rawValue)
  if (fromRaw.value != null) {
    return {
      value: fromRaw.value,
      unit: fromRaw.unit ?? recognition.packageSize.unit,
    }
  }

  return { value: null, unit: null }
}

export function resolveCaptureDraftPackageSizeWithSource(draft: FertilizerCaptureDraft): {
  value: number | null
  unit: string | null
  source: CaptureDraftPackageSizeSource
} {
  if (draft.recognitionResult?.recognition) {
    const fromNormalized = resolveRecognitionPackageSizeFromRecognition(
      draft.recognitionResult.recognition,
    )
    if (fromNormalized.value != null) {
      const source: CaptureDraftPackageSizeSource =
        draft.recognitionResult.recognition.packageSize.normalizedValue != null &&
        draft.recognitionResult.recognition.packageSize.normalizedValue > 0
          ? 'recognition_result'
          : 'recognition_raw_value'

      return {
        value: fromNormalized.value,
        unit: fromNormalized.unit,
        source,
      }
    }
  }

  const snapshot = draft.recognitionCandidate?.recognitionSnapshot
  if (snapshot) {
    const fromSnapshot = resolveRecognitionPackageSizeFromRecognition(snapshot)
    if (fromSnapshot.value != null) {
      const source: CaptureDraftPackageSizeSource =
        snapshot.packageSize.normalizedValue != null && snapshot.packageSize.normalizedValue > 0
          ? 'recognition_snapshot'
          : 'recognition_raw_value'

      return {
        value: fromSnapshot.value,
        unit: fromSnapshot.unit,
        source,
      }
    }
  }

  const candidate = draft.recognitionCandidate
  if (candidate?.packageSizeValue != null && candidate.packageSizeValue > 0) {
    return {
      value: candidate.packageSizeValue,
      unit: candidate.packageSizeUnit,
      source: 'recognition_candidate',
    }
  }

  if (draft.selectedPackageQuantity != null && draft.selectedPackageQuantity > 0) {
    return {
      value: draft.selectedPackageQuantity,
      unit: draft.selectedPackageUnit ?? draft.unit ?? 'kg',
      source: 'selected_package_fields',
    }
  }

  return { value: null, unit: null, source: 'none' }
}

export function resolveCaptureDraftPackageSize(draft: FertilizerCaptureDraft): {
  value: number | null
  unit: string | null
} {
  const resolved = resolveCaptureDraftPackageSizeWithSource(draft)
  return { value: resolved.value, unit: resolved.unit }
}

export function buildCaptureDraftPackageDiagnostics(
  draft: FertilizerCaptureDraft,
): CaptureDraftPackageDiagnostics {
  const preparedDraft = prepareCaptureDraftForEnrichment(draft)
  const preparedPackageSize = resolveCaptureDraftPackageSizeWithSource(preparedDraft)
  const candidate = draft.recognitionCandidate
  const snapshot = candidate?.recognitionSnapshot

  const snapshotPackage =
    snapshot != null ? resolveRecognitionPackageSizeFromRecognition(snapshot) : null
  const recognitionResultPackage =
    draft.recognitionResult?.recognition != null
      ? resolveRecognitionPackageSizeFromRecognition(draft.recognitionResult.recognition)
      : null

  return {
    selectedPackageQuantityPresent:
      draft.selectedPackageQuantity != null && draft.selectedPackageQuantity > 0,
    selectedPackageUnitPresent: normalizedText(draft.selectedPackageUnit) != null,
    selectedPackageUnitCategory: classifyRecognitionPackageSizeUnitCategory(
      draft.selectedPackageUnit ?? draft.unit,
    ),
    recognitionResultPackageSizePresent:
      recognitionResultPackage?.value != null && recognitionResultPackage.value > 0,
    recognitionCandidatePresent: candidate != null,
    recognitionCandidatePackageSizePresent:
      candidate?.packageSizeValue != null && candidate.packageSizeValue > 0,
    recognitionSnapshotPresent: snapshot != null,
    recognitionSnapshotPackageSizePresent:
      snapshotPackage?.value != null && snapshotPackage.value > 0,
    preparedDraftPackageSizePresent:
      preparedPackageSize.value != null && preparedPackageSize.value > 0,
    preparedDraftPackageSizeSource: preparedPackageSize.source,
    clientRecognitionPackageSizePresent:
      recognitionResultPackage?.value != null && recognitionResultPackage.value > 0,
    acceptInputPackageSizePresent:
      recognitionResultPackage?.value != null && recognitionResultPackage.value > 0,
    acceptOutputSelectedPackagePresent:
      draft.selectedPackageQuantity != null && draft.selectedPackageQuantity > 0,
    acceptOutputRecognitionPackageSizePresent:
      recognitionResultPackage?.value != null && recognitionResultPackage.value > 0,
    recognitionHttpResponsePackageSizePresent:
      draft.recognitionClientHandoffTrace?.recognitionHttpResponsePackageSizePresent === true,
    recognitionClientParsedPackageSizePresent:
      draft.recognitionClientHandoffTrace?.recognitionClientParsedPackageSizePresent === true,
    recognitionStateStoredPackageSizePresent:
      draft.recognitionClientHandoffTrace?.recognitionStateStoredPackageSizePresent === true,
    recognitionAcceptHandlerPackageSizePresent:
      draft.recognitionClientHandoffTrace?.recognitionAcceptHandlerPackageSizePresent === true,
    recognitionAcceptArgumentKind:
      draft.recognitionClientHandoffTrace?.recognitionAcceptArgumentKind ?? 'missing',
    clientPackageSizeLossStage:
      draft.recognitionClientHandoffTrace?.clientPackageSizeLossStage ?? 'missing',
  }
}

export function prepareCaptureDraftForEnrichment(
  draft: FertilizerCaptureDraft,
): FertilizerCaptureDraft {
  if (draft.recognitionResult?.recognition) {
    return draft
  }

  const snapshot = draft.recognitionCandidate?.recognitionSnapshot
  const candidate = draft.recognitionCandidate
  if (!snapshot || !candidate) {
    return draft
  }

  return {
    ...draft,
    recognitionResult: {
      status: 'identified',
      identityConfidence: candidate.identityConfidence ?? 0,
      dataCompleteness: candidate.dataCompleteness ?? 0,
      recognition: snapshot,
      catalogMatch: { matched: false, productId: null, matchType: 'none', confidence: 0 },
      sources: candidate.sources ?? [],
      missingRequiredFields: [],
      nextAction: { type: 'none', message: null },
      stockCapture: {
        allowed: true,
        recognitionCandidate: true,
        persistToCatalog: false,
        message: null,
      },
      diagnostics: {
        model: 'capture-draft-rehydrate',
        latencyMs: 0,
        estimatedCost: null,
        warnings: [],
      },
      steps: [],
      spike: true,
    },
  }
}

export function buildCaptureRecognitionPackagingBasis(
  draft: FertilizerCaptureDraft,
): FertilizerCaptureRecognitionPackagingBasis | null {
  const preparedDraft = prepareCaptureDraftForEnrichment(draft)
  const recognition = resolveCaptureDraftRecognition(preparedDraft)
  const resolvedPackageSize = resolveCaptureDraftPackageSizeWithSource(preparedDraft)

  if (recognition) {
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

    if (
      !officialName &&
      !manufacturer &&
      !npk &&
      productForm === 'unknown' &&
      resolvedPackageSize.value == null
    ) {
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
      packageSizeValue: resolvedPackageSize.value,
      packageSizeUnit: resolvedPackageSize.unit
        ? normalizePackageSizeUnit(resolvedPackageSize.unit) ?? resolvedPackageSize.unit
        : null,
    }
  }

  const candidate = preparedDraft.recognitionCandidate
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
  const npk = resolveNpkTriplet({
    rawLabel: candidate.npk?.value != null ? String(candidate.npk.value) : null,
    nitrogen: null,
    phosphate: null,
    potash: null,
  })

  if (!officialName && !manufacturer && !npk && resolvedPackageSize.value == null) {
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
    npk,
    packageSizeValue: resolvedPackageSize.value,
    packageSizeUnit: resolvedPackageSize.unit
      ? normalizePackageSizeUnit(resolvedPackageSize.unit) ?? resolvedPackageSize.unit
      : null,
  }
}
