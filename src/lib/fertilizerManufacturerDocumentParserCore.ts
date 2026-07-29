import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import {
  classifyDeclarationAgainstIdentity,
  evaluateDeclarationVariantMatch,
  extractDeclarationDocumentIdentity,
  FertilizerDeclarationTextParserError,
  parseFertilizerDeclarationText,
  type FertilizerDeclarationTextClassification,
  type FertilizerDeclarationTextParsedNutrient,
  type FertilizerDeclarationTextParseResult,
} from './fertilizerDeclarationTextParserCore'

export type FertilizerManufacturerDocumentClassification = FertilizerDeclarationTextClassification

export type FertilizerManufacturerDocumentParsedNutrient = FertilizerDeclarationTextParsedNutrient

export interface FertilizerManufacturerDocumentParseResult
  extends FertilizerDeclarationTextParseResult {
  classification: FertilizerManufacturerDocumentClassification
  variantMatched: boolean
  productScopeConfirmed: boolean
}

export class FertilizerManufacturerDocumentParserError extends FertilizerDeclarationTextParserError {
  constructor(message = 'Manufacturer document parser failed.') {
    super(message)
    this.name = 'FertilizerManufacturerDocumentParserError'
  }
}

export function parseFertilizerManufacturerDocumentText(
  text: string,
  expectedIdentity: FertilizerEnrichmentIdentity,
): FertilizerManufacturerDocumentParseResult {
  let parsed: FertilizerDeclarationTextParseResult
  try {
    parsed = parseFertilizerDeclarationText(text)
  } catch (error) {
    if (error instanceof FertilizerDeclarationTextParserError) {
      throw new FertilizerManufacturerDocumentParserError()
    }
    throw error
  }

  const extractedIdentity = extractDeclarationDocumentIdentity(text)
  const classification = classifyDeclarationAgainstIdentity(text, expectedIdentity, extractedIdentity, {
    requireManufacturer: true,
  })

  return {
    ...parsed,
    classification,
    variantMatched: evaluateDeclarationVariantMatch(
      text,
      expectedIdentity,
      parsed.extractedVariant,
      classification,
    ),
    productScopeConfirmed: classification !== 'no_match',
  }
}
