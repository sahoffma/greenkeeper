import { describe, expect, it, vi } from 'vitest'
import type { FertilizerEnrichmentIdentity } from '../types/fertilizerEnrichment'
import type { FertilizerManufacturerResearchDiagnostics } from '../types/fertilizerManufacturerResearchDiagnostics'
import type { ManufacturerResearchV2Result } from '../types/fertilizerManufacturerResearchV2'
import { runAutomaticManufacturerResearch } from './fertilizerManufacturerResearchCore'
import { buildStructuredResearchProviderResultFromRecord } from './fertilizerManufacturerStructuredResearchCore'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerReadiness'
import {
  buildManufacturerResearchV2CaptureContextFromEnrichmentInput,
  buildManufacturerResearchV2Prompt,
  compareManufacturerResearchV2WithV1,
  deriveManufacturerResearchV2NutrientMappingFailureReason,
  deriveManufacturerResearchV2RejectionReason,
  detectHardIdentityContradiction,
  evaluateManufacturerResearchV2Shadow,
  isManufacturerResearchV2SchemaNutrientKey,
  isManufacturerResearchV2TrustedResolvedResult,
  isManufacturerResearchV2ShadowEnabled,
  isNutrientValuePresentInSourceText,
  MANUFACTURER_RESEARCH_V2_DECLARATION_SOURCE_URL_PATTERN,
  MANUFACTURER_RESEARCH_V2_MODEL,
  MANUFACTURER_RESEARCH_V2_SYSTEM_PROMPT,
  manufacturerResearchV2JsonSchema,
  matchesManufacturerResearchV2SchemaDeclarationSourceUrl,
  maybeAttachManufacturerResearchV2Shadow,
  parseManufacturerResearchV2Result,
  readManufacturerResearchV2SchemaDeclarationSourceUrlPattern,
  readManufacturerResearchV2SchemaNutrientKeyEnum,
  runManufacturerResearchV2Shadow,
  validateManufacturerResearchV2Evidence,
  validateManufacturerResearchV2NumericSanity,
} from './fertilizerManufacturerResearchV2Core'

const RASENDOKTOR_PROFESSIONAL_IDENTITY: FertilizerEnrichmentIdentity = {
  manufacturer: 'Rasendoktor',
  productLine: 'Professional',
  officialName: 'Stress-Manager',
  variant: '0-0-30',
  identityFingerprint: 'rasendoktor|professional|stress manager|0-0-30',
  identityConfidence: 0.95,
  hasIdentityAmbiguity: false,
}

const RASENDOKTOR_SOURCE_URL =
  'https://www.rasendoktor.de/professional/stress-manager-0-0-30'

const RASENDOKTOR_SOURCE_TEXT = `
Rasendoktor Professional Stress-Manager 0-0-30
NPK 0-0-30
Kaliumoxid (K2O): 30 %
Schwefel (S): 10,2 %
Eisen (Fe): 3 %
Mangan (Mn): 0,1 %
Kupfer (Cu): 0,1 %
Zink (Zn): 0,1 %
`

function buildRasendoktorProfessionalResult(
  overrides: Partial<ManufacturerResearchV2Result> = {},
): ManufacturerResearchV2Result {
  return {
    status: 'resolved',
    product: {
      manufacturer: 'Rasendoktor',
      productLine: 'Professional',
      productName: 'Stress-Manager',
      variant: '0-0-30',
      form: 'granular',
      npk: { n: 0, p2o5: 0, k2o: 30, rawLabel: '0-0-30' },
    },
    declaration: {
      nutrients: [
        { nutrientKey: 'potash', value: 30, unit: '%', declarationBasis: 'K2O' },
        { nutrientKey: 'sulfur', value: 10.2, unit: '%', declarationBasis: 'S' },
        { nutrientKey: 'iron', value: 3, unit: '%', declarationBasis: 'Fe' },
        { nutrientKey: 'manganese', value: 0.1, unit: '%', declarationBasis: 'Mn' },
        { nutrientKey: 'copper', value: 0.1, unit: '%', declarationBasis: 'Cu' },
        { nutrientKey: 'zinc', value: 0.1, unit: '%', declarationBasis: 'Zn' },
      ],
    },
    declarationSource: {
      url: RASENDOKTOR_SOURCE_URL,
      title: 'Professional Stress-Manager 0-0-30',
      sourceType: 'manufacturer_web_page',
    },
    supportingSources: [{ url: RASENDOKTOR_SOURCE_URL, title: 'Professional Stress-Manager' }],
    alternatives: [
      {
        manufacturer: 'Rasendoktor',
        productLine: 'Standard',
        productName: 'Stressmanager',
        variant: '0-0-22',
        npkLabel: '0-0-22',
        reasonDifferent: 'Different product line and NPK',
      },
    ],
    ambiguity: { unresolved: false, reason: null, questionForUser: null },
    confidence: 'high',
    declarationComplete: true,
    shortReasoningSummary: 'Resolved Professional variant from official source.',
    ...overrides,
  }
}

function createMockFetchProvider(sourceText: string = RASENDOKTOR_SOURCE_TEXT) {
  return {
    fetchSource: vi.fn(async (url: string) => ({
      ok: true as const,
      finalUrl: url,
      contentType: 'text/html',
      text: sourceText,
      retrievedAt: '2026-07-29T10:00:00.000Z',
      statusCode: 200,
    })),
  }
}

function createRasendoktorStructuredProvider() {
  return {
    runStructuredWebResearch: async () =>
      buildStructuredResearchProviderResultFromRecord({
        record: {
          manufacturer: 'Rasendoktor',
          productLine: 'Professional',
          productName: 'Stress-Manager',
          productForm: 'granular',
          npk: { nitrogen: 0, phosphate: 0, potash: 30 },
          nutrientMatrix: {
            potash: 30,
            sulfur: 10.2,
            iron: 3,
            manganese: 0.1,
            copper: 0.1,
            zinc: 0.1,
          },
          nutrientDeclarationBases: {},
          declarationComplete: true,
          identityMatch: true,
          confidence: 0.95,
          sources: [
            {
              url: RASENDOKTOR_SOURCE_URL,
              title: 'Professional Stress-Manager 0-0-30',
              category: 'official_manufacturer',
              sourceIdentity: {
                manufacturer: 'Rasendoktor',
                productLine: 'Professional',
                productName: 'Stress-Manager',
                npkLabel: '0-0-30',
              },
            },
          ],
        },
        identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
        npkLabel: '0-0-30',
        manufacturerDomain: 'rasendoktor.de',
      }),
  }
}

function emptyV1Diagnostics(): FertilizerManufacturerResearchDiagnostics {
  return {
    productIdentityComplete: true,
    automaticResearchAttempted: true,
    manufacturerSearchAttempted: true,
    manufacturerDomainResolved: true,
    searchVariantCount: 1,
    officialSourceCandidateCount: 0,
    officialSourceFetchedCount: 0,
    officialDocumentCandidateCount: 0,
    officialDocumentParsedCount: 0,
    declarationSectionFound: false,
    declaredPositiveNutrientCount: 0,
    researchFailureStage: 'none',
    fallbackRecommendation: 'none',
    searchProviderConfigured: true,
    searchProviderAttempted: true,
    searchQueryCount: 1,
    searchResultCount: 1,
    officialSearchResultCount: 1,
    officialSearchResultFetchedCount: 0,
    searchProviderOutcome: 'success',
    searchProviderDurationMs: 10,
    webSearchToolCallObserved: true,
    webSearchSourceCount: 1,
    officialWebSearchSourceCount: 1,
    structuredResearchResultPresent: true,
    structuredDeclarationComplete: true,
    structuredPositiveNutrientCount: 6,
    directCandidateFallbackUsed: false,
    researchSourceStrategy: 'structured_web_research',
    officialDeclarationFound: true,
  }
}

describe('manufacturer research v2 strict schema contract', () => {
  it('allows all 16 canonical nutrient keys in the schema enum', () => {
    expect(readManufacturerResearchV2SchemaNutrientKeyEnum()).toEqual([
      ...FERTILIZER_NUTRIENT_MATRIX_KEYS,
    ])
    for (const key of FERTILIZER_NUTRIENT_MATRIX_KEYS) {
      expect(isManufacturerResearchV2SchemaNutrientKey(key)).toBe(true)
    }
  })

  it('does not allow non-canonical nutrient keys in the schema enum', () => {
    expect(isManufacturerResearchV2SchemaNutrientKey('total_nitrogen')).toBe(false)
    expect(isManufacturerResearchV2SchemaNutrientKey('K2O')).toBe(false)
    expect(isManufacturerResearchV2SchemaNutrientKey('n')).toBe(false)
  })

  it('keeps declarationBasis unrestricted in the schema', () => {
    const declarationBasis =
      manufacturerResearchV2JsonSchema.properties.declaration.properties.nutrients.items.properties
        .declarationBasis

    expect(declarationBasis).toEqual({ type: ['string', 'null'] })
  })

  it('allows absolute https declaration source URLs in the schema pattern', () => {
    expect(readManufacturerResearchV2SchemaDeclarationSourceUrlPattern()).toBe(
      MANUFACTURER_RESEARCH_V2_DECLARATION_SOURCE_URL_PATTERN,
    )
    expect(
      matchesManufacturerResearchV2SchemaDeclarationSourceUrl(
        'https://www.rasendoktor.de/professional/stress-manager-0-0-30',
      ),
    ).toBe(true)
  })

  it('does not allow relative declaration source URLs in the schema pattern', () => {
    expect(matchesManufacturerResearchV2SchemaDeclarationSourceUrl('/duenger/example')).toBe(false)
    expect(matchesManufacturerResearchV2SchemaDeclarationSourceUrl('http://example.com')).toBe(
      false,
    )
  })
})

describe('manufacturer research v2 shadow flag', () => {
  it('reads MANUFACTURER_RESEARCH_V2_SHADOW env flag', () => {
    expect(isManufacturerResearchV2ShadowEnabled({ MANUFACTURER_RESEARCH_V2_SHADOW: 'true' })).toBe(
      true,
    )
    expect(isManufacturerResearchV2ShadowEnabled({ MANUFACTURER_RESEARCH_V2_SHADOW: 'false' })).toBe(
      false,
    )
  })

  it('uses gpt-4o for manufacturer research v2', () => {
    expect(MANUFACTURER_RESEARCH_V2_MODEL).toBe('gpt-4o')
  })
})

describe('manufacturer research v2 capture context', () => {
  it('builds full capture context from enrichment input', () => {
    const context = buildManufacturerResearchV2CaptureContextFromEnrichmentInput({
      orchestrationInput: {
        identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
        captureInlineSourceTexts: {
          captureRecognitionLabel: 'Rasendoktor Professional Stress-Manager NPK 0-0-30',
        },
      },
      npkLabel: '0-0-30',
      packageSizeLabel: '5 kg',
    })

    expect(context.manufacturer).toBe('Rasendoktor')
    expect(context.productLine).toBe('Professional')
    expect(context.productName).toBe('Stress-Manager')
    expect(context.npkLabel).toBe('0-0-30')
    expect(context.packageSizeLabel).toBe('5 kg')
    expect(context.labelText).toContain('Stress-Manager')
    expect(context.recognitionConfidence).toBe(0.95)
  })
})

describe('manufacturer research v2 prompt', () => {
  it('requires complete declaration and field semantics', () => {
    const prompt = buildManufacturerResearchV2Prompt({
      identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      captureContext: {
        packageSizeLabel: '5 kg',
        labelText: 'Front label text',
      },
    })

    expect(MANUFACTURER_RESEARCH_V2_SYSTEM_PROMPT).toContain('complete manufacturer nutrient declaration')
    expect(prompt).toContain('complete manufacturer nutrient declaration')
    expect(prompt).toContain('all declared N/P/K, secondary, and trace nutrients')
    expect(prompt).toContain('declarationComplete')
    expect(prompt).toContain('Field semantics')
    expect(prompt).toContain('Front-label / recognition text from capture')
    expect(prompt).toContain('Front label text')
    expect(prompt).not.toContain('Rasendoktor Professional Stress-Manager 0-0-30')
  })
})

describe('manufacturer research v2 gates', () => {
  it('parses structured output schema', () => {
    const parsed = parseManufacturerResearchV2Result(
      buildRasendoktorProfessionalResult() as unknown as Record<string, unknown>,
    )
    expect(parsed?.status).toBe('resolved')
    expect(parsed?.product.productLine).toBe('Professional')
  })

  it('detects hard NPK contradiction', () => {
    const contradiction = detectHardIdentityContradiction({
      captureIdentity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      captureNpkLabel: '0-0-30',
      result: buildRasendoktorProfessionalResult({
        product: {
          ...buildRasendoktorProfessionalResult().product,
          productLine: 'Standard',
          npk: { n: 0, p2o5: 0, k2o: 22, rawLabel: '0-0-22' },
        },
      }),
    })
    expect(contradiction).toBe(true)
  })

  it('accepts missing product line detail as non-contradiction', () => {
    const contradiction = detectHardIdentityContradiction({
      captureIdentity: { ...RASENDOKTOR_PROFESSIONAL_IDENTITY, productLine: null },
      captureNpkLabel: '0-0-30',
      result: buildRasendoktorProfessionalResult(),
    })
    expect(contradiction).toBe(false)
  })

  it('matches nutrient evidence with comma and percent formatting', () => {
    expect(isNutrientValuePresentInSourceText(RASENDOKTOR_SOURCE_TEXT, 10.2)).toBe(true)
    expect(isNutrientValuePresentInSourceText(RASENDOKTOR_SOURCE_TEXT, 0.1)).toBe(true)
  })

  it('rejects evidence when source body is unreadable', () => {
    expect(
      validateManufacturerResearchV2Evidence({
        result: buildRasendoktorProfessionalResult(),
        sourceText: null,
        sourceFetchFailed: true,
      }),
    ).toBe(false)
  })

  it('passes numeric sanity for known nutrient keys', () => {
    expect(validateManufacturerResearchV2NumericSanity(buildRasendoktorProfessionalResult())).toBe(
      true,
    )
  })

  it('does not reject trusted resolved results when declaration source fetch fails', () => {
    const result = buildRasendoktorProfessionalResult()
    const evaluation = evaluateManufacturerResearchV2Shadow({
      captureIdentity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      captureNpkLabel: '0-0-30',
      result,
      schemaValid: true,
      sourceValid: false,
      sourceFetchFailed: true,
      evidenceCheckPassed: false,
    })

    expect(isManufacturerResearchV2TrustedResolvedResult(result)).toBe(true)
    expect(evaluation.gates.sourceValid).toBe(false)
    expect(evaluation.gates.evidenceCheckPassed).toBe(false)
    expect(evaluation.finalShadowDecision).toBe('resolved_valid')
    expect(
      deriveManufacturerResearchV2RejectionReason({
        gates: evaluation.gates,
        declarationSourceUrl: result.declarationSource?.url ?? null,
        sourceFetchFailed: true,
        result,
        finalShadowDecision: evaluation.finalShadowDecision,
      }),
    ).toBeNull()
  })

  it('still rejects invalid declaration source URLs', () => {
    const evaluation = evaluateManufacturerResearchV2Shadow({
      captureIdentity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      captureNpkLabel: '0-0-30',
      result: buildRasendoktorProfessionalResult({
        declarationSource: {
          url: '/relative/source',
          title: 'Relative source',
          sourceType: 'manufacturer_web_page',
        },
      }),
      schemaValid: true,
      sourceValid: false,
      sourceFetchFailed: false,
      evidenceCheckPassed: false,
    })

    expect(evaluation.finalShadowDecision).toBe('rejected')
    expect(
      deriveManufacturerResearchV2RejectionReason({
        gates: evaluation.gates,
        declarationSourceUrl: '/relative/source',
        sourceFetchFailed: false,
        result: buildRasendoktorProfessionalResult({
          declarationSource: {
            url: '/relative/source',
            title: 'Relative source',
            sourceType: 'manufacturer_web_page',
          },
        }),
        finalShadowDecision: evaluation.finalShadowDecision,
      }),
    ).toBe('declaration_source_invalid_url')
  })

  it('still rejects identity contradiction', () => {
    const evaluation = evaluateManufacturerResearchV2Shadow({
      captureIdentity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      captureNpkLabel: '0-0-30',
      result: buildRasendoktorProfessionalResult({
        product: {
          ...buildRasendoktorProfessionalResult().product,
          productLine: 'Standard',
        },
      }),
      schemaValid: true,
      sourceValid: true,
      sourceFetchFailed: false,
      evidenceCheckPassed: true,
    })

    expect(evaluation.finalShadowDecision).toBe('rejected')
    expect(evaluation.gates.identityContradiction).toBe(true)
  })

  it('still rejects unknown nutrient labels outside the schema enum', () => {
    const evaluation = evaluateManufacturerResearchV2Shadow({
      captureIdentity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      captureNpkLabel: '0-0-30',
      result: buildRasendoktorProfessionalResult({
        declaration: {
          nutrients: [{ nutrientKey: 'K2O', value: 30, unit: '%', declarationBasis: 'K2O' }],
        },
      }),
      schemaValid: true,
      sourceValid: true,
      sourceFetchFailed: false,
      evidenceCheckPassed: true,
    })

    expect(evaluation.finalShadowDecision).toBe('rejected')
    expect(evaluation.gates.numericSanityPassed).toBe(false)
  })

  it('derives nutrient mapping failure reason for unknown nutrient keys', () => {
    expect(
      deriveManufacturerResearchV2NutrientMappingFailureReason(
        buildRasendoktorProfessionalResult({
          declaration: {
            nutrients: [{ nutrientKey: 'K2O', value: 30, unit: '%', declarationBasis: 'K2O' }],
          },
        }),
      ),
    ).toBe('unknown_nutrient_key:K2O')
  })

  it('marks ambiguous status as ambiguous shadow decision', () => {
    const evaluation = evaluateManufacturerResearchV2Shadow({
      captureIdentity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      captureNpkLabel: '0-0-30',
      result: buildRasendoktorProfessionalResult({
        status: 'ambiguous',
        ambiguity: {
          unresolved: true,
          reason: 'Standard and Professional variants remain plausible',
          questionForUser: 'Professional or Standard line?',
        },
      }),
      schemaValid: true,
      sourceValid: true,
      sourceFetchFailed: false,
      evidenceCheckPassed: true,
    })
    expect(evaluation.finalShadowDecision).toBe('ambiguous')
  })
})

describe('manufacturer research v2 fixtures', () => {
  it('A reference case resolves Professional 0-0-30 with Standard alternative', async () => {
    const shadow = await runManufacturerResearchV2Shadow({
      identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      captureContext: { packageSizeLabel: '5 kg' },
      fetchProvider: createMockFetchProvider(),
      callResearch: async () => buildRasendoktorProfessionalResult(),
      v1Diagnostics: emptyV1Diagnostics(),
      now: () => 0,
    })

    expect(shadow.finalShadowDecision).toBe('resolved_valid')
    expect(shadow.identifiedProduct?.productLine).toBe('Professional')
    expect(shadow.positiveNutrientCount).toBe(6)
    expect(shadow.modelUsed).toBe(MANUFACTURER_RESEARCH_V2_MODEL)
    expect(shadow.confidence).toBe('high')
    expect(shadow.declarationComplete).toBe(true)
    expect(shadow.aiReturnedNutrients?.length).toBe(6)
    expect(shadow.gates?.schemaValid).toBe(true)
    expect(shadow.gates?.sourceValid).toBe(true)
    expect(shadow.gates?.identityContradiction).toBe(false)
    expect(shadow.gates?.evidenceCheckPassed).toBe(true)
  })

  it('B ambiguous when only Stressmanager is captured', async () => {
    const shadow = await runManufacturerResearchV2Shadow({
      identity: {
        manufacturer: 'Rasendoktor',
        productLine: null,
        officialName: 'Stressmanager',
        variant: null,
        identityFingerprint: 'rasendoktor|stressmanager',
        identityConfidence: 0.7,
        hasIdentityAmbiguity: false,
      },
      fetchProvider: createMockFetchProvider(),
      callResearch: async () =>
        buildRasendoktorProfessionalResult({
          status: 'ambiguous',
          product: {
            ...buildRasendoktorProfessionalResult().product,
            productLine: null,
            variant: null,
            npk: { n: null, p2o5: null, k2o: null, rawLabel: null },
          },
          declaration: { nutrients: [] },
          declarationSource: null,
          ambiguity: {
            unresolved: true,
            reason: 'Standard and Professional variants remain plausible',
            questionForUser: 'Is this the Professional or Standard line?',
          },
          confidence: 'medium',
        }),
      v1Diagnostics: emptyV1Diagnostics(),
      now: () => 0,
    })

    expect(shadow.finalShadowDecision).toBe('ambiguous')
    expect(shadow.ambiguity?.questionForUser).toContain('Professional or Standard')
  })

  it('C resolves product without product line', async () => {
    const shadow = await runManufacturerResearchV2Shadow({
      identity: {
        ...RASENDOKTOR_PROFESSIONAL_IDENTITY,
        productLine: null,
      },
      npkLabel: '0-0-30',
      fetchProvider: createMockFetchProvider(),
      callResearch: async () =>
        buildRasendoktorProfessionalResult({
          product: {
            ...buildRasendoktorProfessionalResult().product,
            productLine: null,
          },
        }),
      v1Diagnostics: emptyV1Diagnostics(),
      now: () => 0,
    })

    expect(shadow.finalShadowDecision).toBe('resolved_valid')
  })

  it('D selects matching variant for same product name with different NPK', async () => {
    const shadow = await runManufacturerResearchV2Shadow({
      identity: {
        ...RASENDOKTOR_PROFESSIONAL_IDENTITY,
        productLine: 'Standard',
        variant: '0-0-22',
      },
      npkLabel: '0-0-22',
      fetchProvider: createMockFetchProvider('Standard Stressmanager 0-0-22 K2O 22 %'),
      callResearch: async () =>
        buildRasendoktorProfessionalResult({
          product: {
            manufacturer: 'Rasendoktor',
            productLine: 'Standard',
            productName: 'Stressmanager',
            variant: '0-0-22',
            form: 'granular',
            npk: { n: 0, p2o5: 0, k2o: 22, rawLabel: '0-0-22' },
          },
          declaration: {
            nutrients: [{ nutrientKey: 'potash', value: 22, unit: '%', declarationBasis: 'K2O' }],
          },
        }),
      v1Diagnostics: emptyV1Diagnostics(),
      now: () => 0,
    })

    expect(shadow.finalShadowDecision).toBe('resolved_valid')
    expect(shadow.identifiedProduct?.npkLabel).toBe('0-0-22')
  })

  it('E respects product line when NPK matches', async () => {
    const evaluation = evaluateManufacturerResearchV2Shadow({
      captureIdentity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      captureNpkLabel: '0-0-30',
      result: buildRasendoktorProfessionalResult({
        product: {
          ...buildRasendoktorProfessionalResult().product,
          productLine: 'Standard',
        },
      }),
      schemaValid: true,
      sourceValid: true,
      sourceFetchFailed: false,
      evidenceCheckPassed: true,
    })

    expect(evaluation.gates.identityContradiction).toBe(true)
    expect(evaluation.finalShadowDecision).toBe('rejected')
    expect(
      deriveManufacturerResearchV2RejectionReason({
        gates: evaluation.gates,
        declarationSourceUrl: buildRasendoktorProfessionalResult().declarationSource?.url ?? null,
        sourceFetchFailed: false,
        result: buildRasendoktorProfessionalResult({
          product: {
            ...buildRasendoktorProfessionalResult().product,
            productLine: 'Standard',
          },
        }),
        finalShadowDecision: evaluation.finalShadowDecision,
      }),
    ).toBe('identity_contradiction')
  })

  it('F keeps spelling variants in prompt without TS normalization', () => {
    const prompt = buildManufacturerResearchV2Prompt({
      identity: {
        manufacturer: 'Rasendoktor',
        productLine: null,
        officialName: 'Stress Manager',
        variant: null,
        identityFingerprint: 'rasendoktor|stress manager',
        identityConfidence: 0.8,
        hasIdentityAmbiguity: false,
      },
    })

    expect(prompt).toContain('Stress Manager')
    expect(prompt).not.toContain('stressmanager')
  })

  it('G accepts sparse nutrient declarations', async () => {
    const sparseResult = buildRasendoktorProfessionalResult({
      declaration: {
        nutrients: [{ nutrientKey: 'potash', value: 30, unit: '%', declarationBasis: 'K2O' }],
      },
    })
    const shadow = await runManufacturerResearchV2Shadow({
      identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      fetchProvider: createMockFetchProvider('Kaliumoxid (K2O): 30 %'),
      callResearch: async () => sparseResult,
      v1Diagnostics: emptyV1Diagnostics(),
      now: () => 0,
    })

    expect(shadow.finalShadowDecision).toBe('resolved_valid')
    expect(shadow.positiveNutrientCount).toBe(1)
  })

  it('H supports liquid form in same architecture', async () => {
    const shadow = await runManufacturerResearchV2Shadow({
      identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      fetchProvider: createMockFetchProvider('Flüssigdünger K2O 30 % Schwefel 10,2 %'),
      callResearch: async () =>
        buildRasendoktorProfessionalResult({
          product: {
            ...buildRasendoktorProfessionalResult().product,
            form: 'liquid',
          },
          declaration: {
            nutrients: [
              { nutrientKey: 'potash', value: 30, unit: '%', declarationBasis: 'K2O' },
              { nutrientKey: 'sulfur', value: 10.2, unit: '%', declarationBasis: 'S' },
            ],
          },
        }),
      v1Diagnostics: emptyV1Diagnostics(),
      now: () => 0,
    })

    expect(shadow.finalShadowDecision).toBe('resolved_valid')
  })

  it('I accepts manufacturer web page source type', async () => {
    const shadow = await runManufacturerResearchV2Shadow({
      identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      fetchProvider: createMockFetchProvider(),
      callResearch: async () =>
        buildRasendoktorProfessionalResult({
          declarationSource: {
            url: RASENDOKTOR_SOURCE_URL,
            title: 'Manufacturer page',
            sourceType: 'manufacturer_web_page',
          },
        }),
      v1Diagnostics: emptyV1Diagnostics(),
      now: () => 0,
    })

    expect(shadow.gates?.sourceValid).toBe(true)
  })

  it('J accepts manufacturer document source type', async () => {
    const pdfUrl = 'https://www.rasendoktor.de/downloads/stress-manager.pdf'
    const shadow = await runManufacturerResearchV2Shadow({
      identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      fetchProvider: createMockFetchProvider(RASENDOKTOR_SOURCE_TEXT),
      callResearch: async () =>
        buildRasendoktorProfessionalResult({
          declarationSource: {
            url: pdfUrl,
            title: 'Stress-Manager PDF',
            sourceType: 'manufacturer_pdf',
          },
        }),
      v1Diagnostics: emptyV1Diagnostics(),
      now: () => 0,
    })

    expect(shadow.gates?.sourceValid).toBe(true)
  })

  it('K rejects relative declaration source url with source diagnostics', async () => {
    const shadow = await runManufacturerResearchV2Shadow({
      identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      fetchProvider: createMockFetchProvider(),
      callResearch: async () =>
        buildRasendoktorProfessionalResult({
          declarationSource: {
            url: '/duenger/rasenduenger/kalium-rasenduenger-mit-spurennaehrstoffen/?foo=bar',
            title: 'Kalium Rasendünger',
            sourceType: 'manufacturer_web_page',
          },
        }),
      v1Diagnostics: emptyV1Diagnostics(),
      now: () => 0,
    })

    expect(shadow.finalShadowDecision).toBe('rejected')
    expect(shadow.sourceValid).toBe(false)
    expect(shadow.rejectionReason).toBe('declaration_source_invalid_url')
    expect(shadow.nutrientMappingFailureReason).toBeNull()
    expect(shadow.numericSanityPassed).toBe(true)
  })

  it('L exposes nutrient mapping failure reason for unknown nutrient keys', async () => {
    const shadow = await runManufacturerResearchV2Shadow({
      identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      fetchProvider: createMockFetchProvider('Kaliumoxid (K2O): 30 %'),
      callResearch: async () =>
        buildRasendoktorProfessionalResult({
          declaration: {
            nutrients: [{ nutrientKey: 'K2O', value: 30, unit: '%', declarationBasis: 'K2O' }],
          },
        }),
      v1Diagnostics: emptyV1Diagnostics(),
      now: () => 0,
    })

    expect(shadow.finalShadowDecision).toBe('rejected')
    expect(shadow.numericSanityPassed).toBe(false)
    expect(shadow.nutrientMappingFailureReason).toBe('unknown_nutrient_key:K2O')
    expect(shadow.rejectionReason).toBe('numeric_sanity_failed')
  })

  it('M keeps trusted resolved results when fetch fails with canonical nutrient keys', async () => {
    const shadow = await runManufacturerResearchV2Shadow({
      identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      fetchProvider: {
        fetchSource: vi.fn(async () => ({
          ok: false as const,
          errorCode: 'network_error' as const,
          retryable: true,
        })),
      },
      callResearch: async () =>
        buildRasendoktorProfessionalResult({
          declaration: {
            nutrients: [
              { nutrientKey: 'nitrogen', value: 0, unit: '%', declarationBasis: 'N' },
              { nutrientKey: 'potash', value: 30, unit: '%', declarationBasis: 'K2O' },
            ],
          },
        }),
      v1Diagnostics: emptyV1Diagnostics(),
      now: () => 0,
    })

    expect(shadow.finalShadowDecision).toBe('resolved_valid')
    expect(shadow.sourceValid).toBe(false)
    expect(shadow.gates?.evidenceCheckPassed).toBe(false)
    expect(shadow.rejectionReason).toBeNull()
    expect(shadow.aiReturnedNutrients).toEqual([
      { nutrientKey: 'nitrogen', value: 0, unit: '%', declarationBasis: 'N' },
      { nutrientKey: 'potash', value: 30, unit: '%', declarationBasis: 'K2O' },
    ])
  })
})

describe('manufacturer research v2 shadow integration', () => {
  it('runs v2 shadow in parallel without changing v1 output', async () => {
    const baseInput = {
      identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      npkLabel: '0-0-30',
      structuredResearchProvider: createRasendoktorStructuredProvider(),
      fetchProvider: createMockFetchProvider(),
      runtime: { logTiming: false },
    }

    const withoutShadow = await runAutomaticManufacturerResearch(baseInput)
    const withShadow = await runAutomaticManufacturerResearch({
      ...baseInput,
      runtime: {
        ...baseInput.runtime,
        manufacturerResearchV2ShadowEnabled: true,
        manufacturerResearchV2Call: async () => buildRasendoktorProfessionalResult(),
      },
    })

    expect(withShadow.adapterResult).toEqual(withoutShadow.adapterResult)
    expect(withShadow.diagnostics.manufacturerResearchV2Shadow?.executed).toBe(true)
    expect(withShadow.diagnostics.manufacturerResearchV2Shadow?.modelUsed).toBe(
      MANUFACTURER_RESEARCH_V2_MODEL,
    )
    expect(withShadow.diagnostics.manufacturerResearchV2Shadow?.aiReturnedNutrients?.length).toBe(6)
    expect(withShadow.diagnostics.manufacturerResearchV2Shadow?.finalShadowDecision).toBe(
      'resolved_valid',
    )
  })

  it('returns null shadow diagnostics when flag is disabled', async () => {
    const shadow = await maybeAttachManufacturerResearchV2Shadow({
      enabled: false,
      identity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      fetchProvider: createMockFetchProvider(),
      v1AdapterResult: null,
      v1Diagnostics: emptyV1Diagnostics(),
      callResearch: async () => buildRasendoktorProfessionalResult(),
    })

    expect(shadow).toBeNull()
  })

  it('compares v2 result with v1 adapter output', () => {
    const comparison = compareManufacturerResearchV2WithV1({
      captureIdentity: RASENDOKTOR_PROFESSIONAL_IDENTITY,
      v2Result: buildRasendoktorProfessionalResult(),
      v1AdapterResult: {
        adapterType: 'manufacturer_product_page',
        sourceId: 'v1-source',
        sourceType: 'web_page',
        sourceCategory: 'official_manufacturer',
        sourceUrl: RASENDOKTOR_SOURCE_URL,
        retrievedAt: '2026-07-29T10:00:00.000Z',
        status: 'success',
        extraction: {
          extractedNpk: { nitrogen: 0, phosphate: 0, potash: 30 },
          extractedNutrients: [
            { key: 'potash', value: 30, unit: '%' },
            { key: 'sulfur', value: 10.2, unit: '%' },
          ],
        },
      },
    })

    expect(comparison?.productIdentityMatch).toBe(true)
    expect(comparison?.npkMatch).toBe(true)
    expect(comparison?.declarationSourceMatch).toBe(true)
    expect(comparison?.nutrientMatrixMatch).toBe(false)
  })
})
