import type { ProductRecognizeImageAnalysis } from '../types/productRecognize'
import { normalizePackageSizeUnit } from './productRecognizePackageSizeParseCore'

export const RECOGNITION_PARSER_VERSION = 'canonical_v1' as const

export type PackageSizeValueType = 'number' | 'string' | 'other' | 'missing'
export type PackageSizeUnitCategory = 'mass' | 'volume' | 'unknown' | 'missing'
export type PackageSizeLossStage =
  | 'vision_missing'
  | 'json_parse'
  | 'schema_validation'
  | 'response_parser'
  | 'serialization'
  | 'none'
  | 'unknown'

export interface RecognitionPackageParseDiagnostics {
  rawVisionResponsePresent: boolean
  rawVisionJsonParsed: boolean
  rawPackageSizeObjectPresent: boolean
  rawPackageSizeValuePresent: boolean
  rawPackageSizeUnitPresent: boolean
  rawPackageSizeValueType: PackageSizeValueType
  rawTopLevelPackageSizeValuePresent: boolean
  rawTopLevelPackageSizeUnitPresent: boolean
  rawNestedPackageSizePresent: boolean
  rawNetWeightPresent: boolean
  rawQuantityPresent: boolean
  parsedRecognitionPresent: boolean
  parsedPackageSizePresent: boolean
  parsedPackageSizeValuePresent: boolean
  parsedPackageSizeUnitPresent: boolean
  parsedPackageSizeUnitCategory: PackageSizeUnitCategory
  packageSizeLossStage: PackageSizeLossStage
  recognitionParserVersion: typeof RECOGNITION_PARSER_VERSION
}

function classifyValueType(value: unknown): PackageSizeValueType {
  if (value == null) {
    return 'missing'
  }

  if (typeof value === 'number') {
    return 'number'
  }

  if (typeof value === 'string') {
    return 'string'
  }

  return 'other'
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

function readNestedPackageSize(record: Record<string, unknown>): Record<string, unknown> | null {
  const nested = record.packageSize
  if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
    return null
  }

  return nested as Record<string, unknown>
}

function rawHasPackageSignal(record: Record<string, unknown>): boolean {
  const nested = readNestedPackageSize(record)
  const nestedValue =
    nested?.value ??
    nested?.packageSizeValue ??
    nested?.size ??
    nested?.quantity ??
    nested?.netWeight ??
    nested?.weight

  return (
    record.packageSizeValue != null ||
    record.packageSizeUnit != null ||
    record.package_size_value != null ||
    record.package_size_unit != null ||
    nestedValue != null ||
    nested?.unit != null ||
    nested?.packageSizeUnit != null ||
    record.netWeight != null ||
    record.quantity != null
  )
}

function resolvePackageSizeLossStage(input: {
  rawVisionJsonParsed: boolean
  rawRecord: Record<string, unknown> | null
  parsed: ProductRecognizeImageAnalysis | null
}): PackageSizeLossStage {
  if (!input.rawVisionJsonParsed) {
    return 'json_parse'
  }

  if (!input.rawRecord) {
    return 'unknown'
  }

  const parsedHasValue = input.parsed?.packageSizeValue != null
  if (parsedHasValue) {
    return 'none'
  }

  const topLevelValuePresent = input.rawRecord.packageSizeValue != null
  const nested = readNestedPackageSize(input.rawRecord)
  const nestedValuePresent =
    nested != null &&
    (nested.value != null ||
      nested.packageSizeValue != null ||
      nested.size != null ||
      nested.quantity != null ||
      nested.netWeight != null ||
      nested.weight != null)

  if (topLevelValuePresent || nestedValuePresent) {
    return 'response_parser'
  }

  if (
    nested != null ||
    input.rawRecord.package_size_value != null ||
    input.rawRecord.netWeight != null ||
    input.rawRecord.quantity != null
  ) {
    return 'schema_validation'
  }

  const textFragments = input.rawRecord.textFragments
  if (Array.isArray(textFragments) && textFragments.some((item) => typeof item === 'string')) {
    return 'vision_missing'
  }

  return 'vision_missing'
}

export function buildRecognitionPackageParseDiagnostics(input: {
  rawVisionJsonParsed: boolean
  rawRecord: Record<string, unknown> | null
  parsed: ProductRecognizeImageAnalysis | null
}): RecognitionPackageParseDiagnostics {
  const rawRecord = input.rawRecord
  const nested = rawRecord ? readNestedPackageSize(rawRecord) : null
  const rawPackageSizeValue = rawRecord?.packageSizeValue
  const parsedUnit = input.parsed?.packageSizeUnit

  return {
    rawVisionResponsePresent: rawRecord != null,
    rawVisionJsonParsed: input.rawVisionJsonParsed,
    rawPackageSizeObjectPresent: nested != null,
    rawPackageSizeValuePresent: rawHasPackageSignal(rawRecord ?? {}),
    rawPackageSizeUnitPresent:
      rawRecord?.packageSizeUnit != null ||
      rawRecord?.package_size_unit != null ||
      nested?.unit != null ||
      nested?.packageSizeUnit != null,
    rawPackageSizeValueType: classifyValueType(rawPackageSizeValue),
    rawTopLevelPackageSizeValuePresent: rawRecord?.packageSizeValue != null,
    rawTopLevelPackageSizeUnitPresent: rawRecord?.packageSizeUnit != null,
    rawNestedPackageSizePresent: nested != null,
    rawNetWeightPresent: rawRecord?.netWeight != null || nested?.netWeight != null,
    rawQuantityPresent: rawRecord?.quantity != null || nested?.quantity != null,
    parsedRecognitionPresent: input.parsed != null,
    parsedPackageSizePresent:
      input.parsed?.packageSizeValue != null && Boolean(input.parsed?.packageSizeUnit),
    parsedPackageSizeValuePresent: input.parsed?.packageSizeValue != null,
    parsedPackageSizeUnitPresent: Boolean(input.parsed?.packageSizeUnit),
    parsedPackageSizeUnitCategory: classifyUnitCategory(parsedUnit),
    packageSizeLossStage: resolvePackageSizeLossStage(input),
    recognitionParserVersion: RECOGNITION_PARSER_VERSION,
  }
}
