import { describe, expect, it, vi } from 'vitest'
import { FERTILIZER_NUTRIENT_MATRIX_KEYS } from '../types/fertilizerDeclarationNormalization'
import type { FertilizerEnrichmentOrchestrationInput, FertilizerEnrichmentSourceHint } from '../types/fertilizerEnrichmentOrchestration'
import { FertilizerEnrichmentOrchestrationContractError } from './fertilizerEnrichmentOrchestrationCore'
import { orchestrateFertilizerEnrichment } from './fertilizerEnrichmentOrchestrationCore'
import {
  createFertilizerManufacturerProductDocumentAdapter,
  FERTILIZER_MANUFACTURER_DOCUMENT_UNEXPECTED_FAILURE_MESSAGE,
  FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE,
  mapValidatedContentTypeToAdapterSourceType,
  resolveManufacturerProductDocumentUrl,
  runFertilizerManufacturerProductDocumentAdapter,
  selectManufacturerProductDocumentSourceHint,
  validateFertilizerManufacturerDocumentSource,
  type FertilizerManufacturerDocumentFetchResult,
  type FertilizerManufacturerProductDocumentAdapterDependencies,
} from './fertilizerManufacturerProductDocumentAdapterCore'
import {
  FertilizerManufacturerDocumentParserError,
  parseFertilizerManufacturerDocumentText,
} from './fertilizerManufacturerDocumentParserCore'
import type { FertilizerSourceAdapterContext } from './fertilizerEnrichmentOrchestrationCore'

const FIXED_NOW = '2026-07-29T10:00:00.000Z'
const DOCUMENT_URL = 'https://manufacturer.example.com/products/spring-start.pdf'

function manufacturerDocumentHint(
  sourceUrl: string,
  overrides: Partial<FertilizerEnrichmentSourceHint> = {},
): FertilizerEnrichmentSourceHint {
  return {
    sourceUrl,
    adapterType: 'manufacturer_product_document',
    ...overrides,
  }
}

function buildIdentityInput(
  overrides: Partial<FertilizerEnrichmentOrchestrationInput> = {},
): FertilizerEnrichmentOrchestrationInput {
  return {
    objectCategory: 'fertilizer',
    identity: {
      manufacturer: 'ICL',
      officialName: 'Spring Start',
      productLine: 'Professional',
      variant: '15-0-26',
      identityFingerprint: 'icl-spring-start-15-0-26',
      identityConfidence: 0.95,
      hasIdentityAmbiguity: false,
    },
    allowedInputChannels: ['capture_flow'],
    sourceHints: [manufacturerDocumentHint(DOCUMENT_URL, { hintType: 'catalog' })],
    ...overrides,
  }
}

function buildFullDocumentText(options: {
  product?: string
  variant?: string
  npk?: string
  nitrogen?: number
  phosphate?: number
  potash?: number
  magnesium?: number
  complete?: boolean
  truncated?: boolean
  includeNpk?: boolean
  fullMatrix?: boolean
} = {}): string {
  const product = options.product ?? 'Spring Start'
  const variant = options.variant ?? '15-0-26'
  const npk = options.npk ?? variant
  const nitrogen = options.nitrogen ?? 15
  const phosphate = options.phosphate ?? 0
  const potash = options.potash ?? 26
  const magnesium = options.magnesium ?? 2
  const includeNpk = options.includeNpk ?? true

  const lines = [
    'Manufacturer: ICL',
    `Product: ${product}`,
    ...(variant ? [`Product variant: ${variant}`] : []),
    'Form: Granular',
    '',
    ...(includeNpk ? [`NPK ${npk}`, 'Declaration basis (N / P2O5 / K2O)', ''] : []),
    'Nutrient declaration (% by weight):',
    `Nitrogen (N): ${nitrogen}%`,
    `Phosphate (P2O5): ${phosphate}%`,
    `Potash (K2O): ${potash}%`,
    `Magnesium (MgO): ${magnesium}%`,
    'Nitrate nitrogen: 5%',
    'Ammonium nitrogen: 5%',
    'Urea nitrogen: 5%',
    'Organic nitrogen: 0%',
  ]

  if (options.fullMatrix) {
    lines.push(
      'Calcium (CaO): 0%',
      'Sulfur (SO3): 0%',
      'Iron (Fe): 0%',
      'Manganese (Mn): 0%',
      'Copper (Cu): 0%',
      'Zinc (Zn): 0%',
      'Boron (B): 0%',
      'Molybdenum (Mo): 0%',
    )
  }

  lines.push(options.complete === false ? 'Declaration section incomplete' : 'Declaration section complete')
  if (options.truncated) {
    lines.push('Document truncated')
  }

  return lines.join('\n')
}

function buildAdapterContext(
  input: FertilizerEnrichmentOrchestrationInput,
): FertilizerSourceAdapterContext {
  return {
    input,
    adapterType: FERTILIZER_MANUFACTURER_PRODUCT_DOCUMENT_ADAPTER_TYPE,
    orchestrationRunId: 'orch-doc-test',
    attempt: 1,
    successfulResults: [],
    partialResults: [],
    isCancelled: () => false,
    shouldTimeout: () => false,
  }
}

function successFetch(text: string, overrides: Partial<Extract<FertilizerManufacturerDocumentFetchResult, { ok: true }>> = {}): Extract<FertilizerManufacturerDocumentFetchResult, { ok: true }> {
  return {
    ok: true,
    finalUrl: DOCUMENT_URL,
    contentType: 'application/pdf',
    text,
    title: 'Spring Start datasheet',
    retrievedAt: FIXED_NOW,
    etag: 'etag-1',
    statusCode: 200,
    ...overrides,
  }
}

function defaultDependencies(
  fetchDocument: FertilizerManufacturerProductDocumentAdapterDependencies['fetchDocument'],
  overrides: Partial<FertilizerManufacturerProductDocumentAdapterDependencies> = {},
): FertilizerManufacturerProductDocumentAdapterDependencies {
  return {
    fetchDocument,
    now: () => FIXED_NOW,
    ...overrides,
  }
}

describe('fertilizerManufacturerProductDocumentAdapterCore', () => {
  it('D-1: no document reference yields no_match without fetch', async () => {
    const fetchDocument = vi.fn(async () => successFetch(buildFullDocumentText()))
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput({ sourceHints: [] })),
      defaultDependencies(fetchDocument),
    )

    expect(fetchDocument).not.toHaveBeenCalled()
    expect(result.status).toBe('no_match')
    expect('technicalError' in result).toBe(false)
  })

  it('D-2: invalid protocol yields invalid_source without fetch', async () => {
    const fetchDocument = vi.fn(async () => successFetch(buildFullDocumentText()))
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(
        buildIdentityInput({
          sourceHints: [
            manufacturerDocumentHint('http://manufacturer.example.com/doc.pdf'),
          ],
        }),
      ),
      defaultDependencies(fetchDocument),
    )

    expect(fetchDocument).not.toHaveBeenCalled()
    expect(result.status).toBe('invalid_source')
    if (result.status === 'invalid_source') {
      expect(result.retryable).toBe(false)
    }
  })

  it('D-3: private or local host yields invalid_source without fetch', async () => {
    const fetchDocument = vi.fn(async () => successFetch(buildFullDocumentText()))
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(
        buildIdentityInput({
          sourceHints: [manufacturerDocumentHint('https://127.0.0.1/doc.pdf')],
        }),
      ),
      defaultDependencies(fetchDocument),
    )

    expect(fetchDocument).not.toHaveBeenCalled()
    expect(result.status).toBe('invalid_source')
  })

  it('D-4: matching official document with complete declaration yields success', async () => {
    const text = buildFullDocumentText({ complete: true })
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => successFetch(text)),
    )

    expect(result.status).toBe('success')
    if (result.status === 'success') {
      expect(result.extraction.extractedNpk?.nitrogen).toBe(15)
      expect(result.extraction.extractedNpk?.potash).toBe(26)
      expect(result.extraction.extractedProductForm).toBe('granular')
      expect(result.extraction.coverageMetadata?.nutrientSectionFullyCaptured).toBe(true)
      expect(result.extraction.evidence?.length).toBeGreaterThan(0)
      expect(result.sourceVersion).toBe('etag-1')
    }
  })

  it('D-5: matching document with partial declaration yields partial', async () => {
    const text = buildFullDocumentText({ complete: false, magnesium: undefined as unknown as number }).replace(
      'Magnesium (MgO): 2%',
      '',
    )
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => successFetch(text)),
    )

    expect(result.status).toBe('partial')
    if (result.status === 'partial') {
      expect(result.extraction.extractedNpk?.nitrogen).toBe(15)
      expect(result.extraction.coverageMetadata?.nutrientSectionFullyCaptured).toBe(false)
    }
  })

  it('D-6: NPK 0-0-30 preserves zero values', async () => {
    const text = buildFullDocumentText({
      variant: '0-0-30',
      npk: '0-0-30',
      nitrogen: 0,
      phosphate: 0,
      potash: 30,
    })
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(
        buildIdentityInput({
          identity: {
            ...buildIdentityInput().identity,
            variant: '0-0-30',
          },
        }),
      ),
      defaultDependencies(async () => successFetch(text)),
    )

    expect(result.status).toBe('success')
    if (result.status === 'success') {
      expect(result.extraction.extractedNpk?.nitrogen).toBe(0)
      expect(result.extraction.extractedNpk?.phosphate).toBe(0)
      expect(result.extraction.extractedNpk?.potash).toBe(30)
    }
  })

  it('D-7: different product yields no_match', async () => {
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => successFetch(buildFullDocumentText({ product: 'Winter Pro' }))),
    )

    expect(result.status).toBe('no_match')
    expect('extraction' in result).toBe(false)
  })

  it('D-8: different variant yields no_match', async () => {
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () =>
        successFetch(buildFullDocumentText({ variant: '10-5-8', npk: '10-5-8', nitrogen: 10, phosphate: 5, potash: 8 })),
      ),
    )

    expect(result.status).toBe('no_match')
  })

  it('D-9: missing variant yields partial with uncertainty', async () => {
    const text = buildFullDocumentText({
      variant: '',
      includeNpk: false,
      complete: false,
    }).replace('Product variant: ', '')
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => successFetch(text)),
    )

    expect(result.status).toBe('partial')
    if (result.status === 'partial') {
      expect(result.extraction.coverageMetadata?.variantMatched).toBe(false)
      expect(result.extraction.extractedIdentity?.variant).toBeNull()
    }
  })

  it('D-10: missing declaration basis yields partial without conversion', async () => {
    const text = buildFullDocumentText().replace('Declaration basis (N / P2O5 / K2O)', '')
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => successFetch(text)),
    )

    expect(result.status).toBe('partial')
    if (result.status === 'partial') {
      expect(result.extraction.extractedNpk?.declarationBasis).toBeNull()
    }
  })

  it('D-11: complete section without listed matrix value does not invent zero', async () => {
    const text = buildFullDocumentText({ complete: true })
      .replace('Nitrate nitrogen: 5%', '')
      .replace('Ammonium nitrogen: 5%', '')
      .replace('Urea nitrogen: 5%', '')
      .replace('Organic nitrogen: 0%', '')

    const parsed = parseFertilizerManufacturerDocumentText(text, buildIdentityInput().identity)
    expect(parsed.nutrients.some((entry) => entry.key === 'nitrateNitrogen')).toBe(false)
    expect(parsed.nutrients.some((entry) => entry.value === 0 && entry.key === 'nitrateNitrogen')).toBe(false)
  })

  it('D-12: incomplete section keeps not_extracted coverage semantics via partial status', async () => {
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => successFetch(buildFullDocumentText({ complete: false }))),
    )

    expect(result.status).toBe('partial')
    if (result.status === 'partial') {
      expect(result.extraction.coverageMetadata?.nutrientSectionFullyCaptured).toBe(false)
    }
  })

  it('D-13: unsupported document type yields invalid_source without parser', async () => {
    const extractDocumentText = vi.fn(async () => 'should not run')
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => successFetch('', { contentType: 'application/zip' }), {
        extractDocumentText,
      }),
    )

    expect(extractDocumentText).not.toHaveBeenCalled()
    expect(result.status).toBe('invalid_source')
  })

  it('D-14: source not found maps to unavailable with source_not_found', async () => {
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => ({
        ok: false,
        errorCode: 'source_not_found',
        retryable: false,
      })),
    )

    expect(result.status).toBe('unavailable')
    if (result.status === 'unavailable') {
      expect(result.technicalError.code).toBe('source_not_found')
    }
  })

  it('D-15: rate limit maps to retryable unavailable', async () => {
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => ({
        ok: false,
        errorCode: 'rate_limited',
        retryable: true,
      })),
    )

    expect(result.status).toBe('unavailable')
    if (result.status === 'unavailable') {
      expect(result.technicalError.code).toBe('rate_limited')
      expect(result.retryable).toBe(true)
    }
  })

  it('D-16: access denied maps to structured unavailable error', async () => {
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => ({
        ok: false,
        errorCode: 'access_denied',
        retryable: false,
      })),
    )

    expect(result.status).toBe('unavailable')
    if (result.status === 'unavailable') {
      expect(result.technicalError.code).toBe('access_denied')
    }
  })

  it('D-17: fetch timeout maps to timeout with retryable flag', async () => {
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => ({
        ok: false,
        errorCode: 'timeout',
        retryable: true,
      })),
    )

    expect(result.status).toBe('unavailable')
    if (result.status === 'unavailable') {
      expect(result.technicalError.code).toBe('timeout')
      expect(result.retryable).toBe(true)
    }
  })

  it('D-18: unexpected fetch throw yields failed unknown_adapter_error with safe message', async () => {
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => {
        throw new Error('secret-token=abc123')
      }),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.technicalError.code).toBe('unknown_adapter_error')
      expect(result.technicalError.message).toBe(FERTILIZER_MANUFACTURER_DOCUMENT_UNEXPECTED_FAILURE_MESSAGE)
      expect(result.technicalError.message).not.toContain('secret-token')
    }
  })

  it('D-19: extractor throw yields controlled technical failure without sensitive details', async () => {
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(
        async () => successFetch('', { text: null }),
        {
          extractDocumentText: async () => {
            throw new Error('confidential extractor failure')
          },
        },
      ),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.technicalError.message).not.toContain('confidential extractor failure')
    }
  })

  it('D-20: parser error on empty text yields parser_error', async () => {
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () => successFetch('   ')),
    )

    expect(result.status).toBe('failed')
    if (result.status === 'failed') {
      expect(result.technicalError.code).toBe('parser_error')
    }
  })

  it('D-21: extracted fields retain provenance metadata and document version', async () => {
    const result = await runFertilizerManufacturerProductDocumentAdapter(
      buildAdapterContext(buildIdentityInput()),
      defaultDependencies(async () =>
        successFetch(buildFullDocumentText(), { etag: 'etag-v2', lastModified: 'Wed, 01 Jan 2025 00:00:00 GMT' }),
      ),
    )

    expect(result.status).toBe('success')
    if (result.status === 'success') {
      expect(result.sourceId).toContain('manufacturer-doc:')
      expect(result.sourceVersion).toBe('etag-v2')
      expect(result.retrievedAt).toBe(FIXED_NOW)
      expect(result.extraction.evidence?.every((entry) => entry.excerpt.length <= 120)).toBe(true)
    }
  })

  it('D-22: adapter context and input remain immutable', async () => {
    const input = buildIdentityInput()
    const context = buildAdapterContext(input)
    const inputSnapshot = structuredClone(input)

    await runFertilizerManufacturerProductDocumentAdapter(
      context,
      defaultDependencies(async () => successFetch(buildFullDocumentText())),
    )

    expect(input).toEqual(inputSnapshot)
    expect(context.input).toEqual(inputSnapshot)
  })

  it('D-23: adapter factory exposes contract without orchestration dependency', async () => {
    const adapter = createFertilizerManufacturerProductDocumentAdapter(
      defaultDependencies(async () => successFetch(buildFullDocumentText())),
    )

    expect(adapter.adapterType).toBe('manufacturer_product_document')
    const result = await adapter.run(buildAdapterContext(buildIdentityInput()))
    expect(['success', 'partial', 'no_match', 'unavailable', 'invalid_source', 'failed']).toContain(result.status)
    expect(result.adapterType).toBe('manufacturer_product_document')
  })

  it('D-24: adapter integrates with orchestration merge and pipeline for intake_ready', async () => {
    const adapter = createFertilizerManufacturerProductDocumentAdapter(
      defaultDependencies(async () => successFetch(buildFullDocumentText({ complete: true, fullMatrix: true }))),
    )

    const result = await orchestrateFertilizerEnrichment(
      buildIdentityInput(),
      {
        adapters: [adapter],
        assessFastPath: () => ({
          decision: 'ineligible',
          profilePresent: false,
          identityMatch: false,
          variantMatch: false,
          enrichmentVersionCompatible: false,
          normalizationVersionCompatible: false,
          readinessVersionCompatible: false,
          matrixComplete: false,
          provenanceComplete: false,
          hasBlockingConflicts: false,
          staleness: 'unknown',
        }),
        now: () => FIXED_NOW,
        createOrchestrationRunId: () => 'orch-integration',
        createNormalizationRunId: () => 'norm-integration',
      },
      {
        normalizedAt: FIXED_NOW,
        evaluatedAt: FIXED_NOW,
        normalizationRunId: 'norm-integration',
      },
    )

    expect(result.status).toBe('intake_ready')
  })

  it('validateFertilizerManufacturerDocumentSource rejects file and data URLs', () => {
    expect(validateFertilizerManufacturerDocumentSource('file:///tmp/doc.pdf').status).toBe('invalid')
    expect(validateFertilizerManufacturerDocumentSource('data:application/pdf;base64,abc').status).toBe('invalid')
  })

  it('resolveManufacturerProductDocumentUrl requires explicit adapterType', () => {
    expect(
      resolveManufacturerProductDocumentUrl(
        buildIdentityInput({
          sourceHints: [{ sourceUrl: 'https://example.com/user.pdf', hintType: 'user' }],
        }),
      ),
    ).toBeNull()

    expect(
      resolveManufacturerProductDocumentUrl(
        buildIdentityInput({
          sourceHints: [
            {
              sourceUrl: 'https://manufacturer.example.com/page',
              hintType: 'catalog',
              adapterType: 'manufacturer_product_page',
            },
          ],
        }),
      ),
    ).toBeNull()

    expect(resolveManufacturerProductDocumentUrl(buildIdentityInput())).toBe(DOCUMENT_URL)
  })

  describe('source hint selection and provenance (S-1 to S-15)', () => {
    it('S-1: explicit manufacturer_product_document hint is selected and fetched once', async () => {
      const fetchDocument = vi.fn(async () => successFetch(buildFullDocumentText({ complete: true })))
      const result = await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(buildIdentityInput()),
        defaultDependencies(fetchDocument),
      )

      expect(fetchDocument).toHaveBeenCalledTimes(1)
      expect(result.status).toBe('success')
    })

    it('S-2: manufacturer_product_page hint is ignored', async () => {
      const fetchDocument = vi.fn(async () => successFetch(buildFullDocumentText()))
      const result = await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(
          buildIdentityInput({
            sourceHints: [
              {
                sourceUrl: 'https://manufacturer.example.com/product-page',
                adapterType: 'manufacturer_product_page',
              },
            ],
          }),
        ),
        defaultDependencies(fetchDocument),
      )

      expect(fetchDocument).not.toHaveBeenCalled()
      expect(result.status).toBe('no_match')
    })

    it('S-3: manufacturer_catalog hint is ignored', async () => {
      const fetchDocument = vi.fn(async () => successFetch(buildFullDocumentText()))
      const result = await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(
          buildIdentityInput({
            sourceHints: [
              {
                sourceUrl: 'https://manufacturer.example.com/catalog.pdf',
                adapterType: 'manufacturer_catalog',
              },
            ],
          }),
        ),
        defaultDependencies(fetchDocument),
      )

      expect(fetchDocument).not.toHaveBeenCalled()
      expect(result.status).toBe('no_match')
    })

    it('S-4: supplementary_web hint is ignored', async () => {
      const fetchDocument = vi.fn(async () => successFetch(buildFullDocumentText()))
      const result = await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(
          buildIdentityInput({
            sourceHints: [
              {
                sourceUrl: 'https://shop.example.com/product.pdf',
                adapterType: 'supplementary_web',
              },
            ],
          }),
        ),
        defaultDependencies(fetchDocument),
      )

      expect(result.status).toBe('no_match')
      expect(fetchDocument).not.toHaveBeenCalled()
    })

    it('S-5: user_document hint is ignored', async () => {
      const fetchDocument = vi.fn(async () => successFetch(buildFullDocumentText()))
      const result = await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(
          buildIdentityInput({
            sourceHints: [
              {
                sourceUrl: 'https://example.com/user-upload.pdf',
                adapterType: 'user_document',
              },
            ],
          }),
        ),
        defaultDependencies(fetchDocument),
      )

      expect(result.status).toBe('no_match')
      expect(fetchDocument).not.toHaveBeenCalled()
    })

    it('S-6: official PDF URL without adapterType is not selected', async () => {
      const fetchDocument = vi.fn(async () => successFetch(buildFullDocumentText()))
      const result = await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(
          buildIdentityInput({
            sourceHints: [
              {
                sourceUrl: 'https://manufacturer.example.com/products/spring-start.pdf',
                hintType: 'catalog',
              },
            ],
          }),
        ),
        defaultDependencies(fetchDocument),
      )

      expect(fetchDocument).not.toHaveBeenCalled()
      expect(result.status).toBe('no_match')
    })

    it('S-7: first matching manufacturer_product_document hint wins deterministically', async () => {
      const firstUrl = 'https://manufacturer.example.com/first.pdf'
      const secondUrl = 'https://manufacturer.example.com/second.pdf'
      const fetchDocument = vi.fn(async () => successFetch(buildFullDocumentText({ complete: true })))

      await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(
          buildIdentityInput({
            sourceHints: [
              manufacturerDocumentHint(firstUrl),
              manufacturerDocumentHint(secondUrl),
            ],
          }),
        ),
        defaultDependencies(fetchDocument),
      )

      expect(fetchDocument).toHaveBeenCalledTimes(1)
      expect(fetchDocument).toHaveBeenCalledWith(
        firstUrl,
        expect.objectContaining({ orchestrationRunId: 'orch-doc-test' }),
      )
    })

    it('S-8: skips non-matching hints and uses later product document hint', async () => {
      const documentUrl = 'https://manufacturer.example.com/document.pdf'
      const fetchDocument = vi.fn(async () => successFetch(buildFullDocumentText({ complete: true })))

      await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(
          buildIdentityInput({
            sourceHints: [
              {
                sourceUrl: 'https://manufacturer.example.com/page',
                adapterType: 'manufacturer_product_page',
              },
              manufacturerDocumentHint(documentUrl),
            ],
          }),
        ),
        defaultDependencies(fetchDocument),
      )

      expect(fetchDocument).toHaveBeenCalledWith(documentUrl, expect.any(Object))
    })

    it('S-9: application/pdf maps to pdf_document provenance', async () => {
      const result = await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(buildIdentityInput()),
        defaultDependencies(async () =>
          successFetch(buildFullDocumentText({ complete: true }), { contentType: 'application/pdf' }),
        ),
      )

      expect(result.sourceType).toBe('pdf_document')
    })

    it('S-10: text/plain maps to text_document provenance', async () => {
      const result = await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(buildIdentityInput()),
        defaultDependencies(async () =>
          successFetch(buildFullDocumentText({ complete: true }), { contentType: 'text/plain' }),
        ),
      )

      expect(result.sourceType).toBe('text_document')
      expect(result.sourceType).not.toBe('pdf_document')
    })

    it('S-11: URL .pdf with text/plain content uses text_document provenance', async () => {
      const result = await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(
          buildIdentityInput({
            sourceHints: [manufacturerDocumentHint('https://manufacturer.example.com/doc.pdf')],
          }),
        ),
        defaultDependencies(async () =>
          successFetch(buildFullDocumentText({ complete: true }), { contentType: 'text/plain' }),
        ),
      )

      expect(result.sourceType).toBe('text_document')
    })

    it('S-12: PDF content-type without .pdf URL uses pdf_document provenance', async () => {
      const result = await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(
          buildIdentityInput({
            sourceHints: [manufacturerDocumentHint('https://manufacturer.example.com/download/12345')],
          }),
        ),
        defaultDependencies(async () =>
          successFetch(buildFullDocumentText({ complete: true }), { contentType: 'application/pdf' }),
        ),
      )

      expect(result.sourceType).toBe('pdf_document')
    })

    it('S-13: unsupported content type remains invalid_source', async () => {
      const extractDocumentText = vi.fn(async () => 'should not run')
      const result = await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(buildIdentityInput()),
        defaultDependencies(async () => successFetch('', { contentType: 'application/zip' }), {
          extractDocumentText,
        }),
      )

      expect(extractDocumentText).not.toHaveBeenCalled()
      expect(result.status).toBe('invalid_source')
    })

    it('S-14: orchestration compatibility with adapter-specific hint still yields intake_ready', async () => {
      const adapter = createFertilizerManufacturerProductDocumentAdapter(
        defaultDependencies(async () =>
          successFetch(buildFullDocumentText({ complete: true, fullMatrix: true })),
        ),
      )

      const result = await orchestrateFertilizerEnrichment(
        buildIdentityInput(),
        {
          adapters: [adapter],
          assessFastPath: () => ({
            decision: 'ineligible',
            profilePresent: false,
            identityMatch: false,
            variantMatch: false,
            enrichmentVersionCompatible: false,
            normalizationVersionCompatible: false,
            readinessVersionCompatible: false,
            matrixComplete: false,
            provenanceComplete: false,
            hasBlockingConflicts: false,
            staleness: 'unknown',
          }),
          now: () => FIXED_NOW,
          createOrchestrationRunId: () => 'orch-integration',
          createNormalizationRunId: () => 'norm-integration',
        },
        {
          normalizedAt: FIXED_NOW,
          evaluatedAt: FIXED_NOW,
          normalizationRunId: 'norm-integration',
        },
      )

      expect(result.status).toBe('intake_ready')
    })

    it('S-15: source hint array remains immutable', async () => {
      const hints = [manufacturerDocumentHint(DOCUMENT_URL)]
      const input = buildIdentityInput({ sourceHints: hints })
      const snapshot = structuredClone(hints)

      await runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(input),
        defaultDependencies(async () => successFetch(buildFullDocumentText({ complete: true }))),
      )

      expect(hints).toEqual(snapshot)
      expect(selectManufacturerProductDocumentSourceHint(input)?.sourceUrl).toBe(DOCUMENT_URL)
    })
  })

  it('mapValidatedContentTypeToAdapterSourceType rejects unsupported types', () => {
    expect(mapValidatedContentTypeToAdapterSourceType('application/pdf')).toBe('pdf_document')
    expect(mapValidatedContentTypeToAdapterSourceType('text/plain; charset=utf-8')).toBe('text_document')
    expect(mapValidatedContentTypeToAdapterSourceType('application/zip')).toBeNull()
  })

  it('contract errors from fetch dependency are rethrown', async () => {
    await expect(
      runFertilizerManufacturerProductDocumentAdapter(
        buildAdapterContext(buildIdentityInput()),
        defaultDependencies(async () => {
          throw new FertilizerEnrichmentOrchestrationContractError('machine')
        }),
      ),
    ).rejects.toBeInstanceOf(FertilizerEnrichmentOrchestrationContractError)
  })

  it('parser throws FertilizerManufacturerDocumentParserError for empty text', () => {
    expect(() => parseFertilizerManufacturerDocumentText('', buildIdentityInput().identity)).toThrow(
      FertilizerManufacturerDocumentParserError,
    )
  })

  it('parser does not emit all matrix keys by default', () => {
    const parsed = parseFertilizerManufacturerDocumentText(buildFullDocumentText(), buildIdentityInput().identity)
    expect(parsed.nutrients.length).toBeGreaterThan(0)
    expect(parsed.nutrients.length).toBeLessThan(FERTILIZER_NUTRIENT_MATRIX_KEYS.length)
  })
})
