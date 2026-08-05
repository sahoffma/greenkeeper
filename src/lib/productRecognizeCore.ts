import type {
  PreparedProductRecognizeImage,
  ProductRecognizeCatalogItem,
  ProductRecognizeImageAnalysis,
  ProductRecognizePipelineStep,
  ProductRecognizeResult,
  ProductRecognizeSourceRecord,
  ProductRecognizeWebExtraction,
} from '../types/productRecognize'
import {
  mergeCatalogIntoRecognition,
  namesArePlausibleVariantConflict,
  resolveCatalogMatch,
  summarizeCatalogMatch,
} from './productRecognizeCatalogCore'
import {
  collectMissingIdentityFields,
  determineNextAction,
  determineRecognitionStatus,
  hasContradictorySources,
} from './productRecognizeDecisionCore'
import {
  computeDataCompleteness,
  computeIdentityConfidence,
  evaluateStockCapture,
  recognitionFromImageAnalysis,
  sanitizeImageAnalysis,
  summarizeIdentity,
} from './productRecognizeIdentityCore'
import {
  prepareProductRecognizeImage,
  ProductRecognizeImagePrepError,
} from './productRecognizeImagePrepCore'
import { PRODUCT_RECOGNIZE_IMAGE_MODEL } from './productRecognizeImageCore'
import type { ProductRecognizeSearchProvider } from './productRecognizeSearchCore'
import {
  buildWebSearchQueries,
  summarizeWebEnrichment,
  webSourcesToRecords,
} from './productRecognizeSearchCore'
import { mergeWebExtractionIntoRecognition } from './productRecognizeWebCore'
import {
  logProductRecognizePipeline,
  logProductRecognizePipelineError,
} from './productRecognizePipelineLogCore'

export interface ProductRecognizeInput {
  imageBase64: string
  mimeType: string
  fileName?: string
}

export const PRODUCT_RECOGNIZE_TOTAL_TIMEOUT_MS = 30_000
export const PRODUCT_RECOGNIZE_WEB_ENRICHMENT_TIMEOUT_MS = 15_000

export interface ProductRecognizeDeps {
  analyzeImage: (input: { base64: string; mimeType: string }) => Promise<ProductRecognizeImageAnalysis>
  loadCatalog: () => Promise<ProductRecognizeCatalogItem[]>
  searchProvider: ProductRecognizeSearchProvider
  prepareImage?: (input: {
    base64: string
    mimeType: string
    fileName?: string
  }) => Promise<PreparedProductRecognizeImage>
  now?: () => string
  model?: string
}

export interface ProductRecognizeValidationError {
  error: string
  statusCode: number
}

export function validateProductRecognizeInput(
  input: ProductRecognizeInput,
): ProductRecognizeValidationError | null {
  if (!input.imageBase64.trim()) {
    return { error: 'Bitte lade ein Vorderseitenfoto hoch.', statusCode: 400 }
  }

  return null
}

function updateStep(
  steps: ProductRecognizePipelineStep[],
  id: ProductRecognizePipelineStep['id'],
  patch: Partial<ProductRecognizePipelineStep>,
): void {
  const step = steps.find((entry) => entry.id === id)

  if (step) {
    Object.assign(step, patch)
  }
}

function emptyResultBase(): Pick<
  ProductRecognizeResult,
  'identityConfidence' | 'dataCompleteness' | 'recognition' | 'catalogMatch' | 'stockCapture'
> {
  const recognition = recognitionFromImageAnalysis({
    brand: null,
    productLine: null,
    productName: null,
    variant: null,
    productDescriptor: null,
    manufacturer: null,
    npkLabel: null,
    nitrogen: null,
    phosphate: null,
    potash: null,
    packageSizeValue: null,
    packageSizeUnit: null,
    form: null,
    gtin: null,
    textFragments: [],
    fieldConfidence: {},
  })

  return {
    identityConfidence: 0,
    dataCompleteness: 0,
    recognition,
    catalogMatch: {
      matched: false,
      productId: null,
      matchType: 'none',
      confidence: 0,
    },
    stockCapture: {
      allowed: false,
      recognitionCandidate: true,
      persistToCatalog: false,
      message: 'Bestandserfassung erst nach eindeutiger Produktidentität.',
    },
  }
}

export interface ProductRecognizePipelineContext {
  requestParseMs?: number
  imageDecodeMs?: number
}

export async function runProductRecognition(
  input: ProductRecognizeInput,
  deps: ProductRecognizeDeps,
  pipelineContext: ProductRecognizePipelineContext = {},
): Promise<ProductRecognizeResult> {
  const startedAt = Date.now()
  const now = deps.now ?? (() => new Date().toISOString())
  const model = deps.model ?? PRODUCT_RECOGNIZE_IMAGE_MODEL
  const warnings: string[] = []

  const steps: ProductRecognizePipelineStep[] = [
    { id: 'image_prep', status: 'running', summary: 'Bild wird vorbereitet…' },
    { id: 'image_analysis', status: 'pending', summary: 'Bildanalyse ausstehend' },
    { id: 'catalog_search', status: 'pending', summary: 'Katalogsuche ausstehend' },
    { id: 'web_enrichment', status: 'pending', summary: 'Web-Anreicherung ausstehend' },
    { id: 'decision', status: 'pending', summary: 'Entscheidung ausstehend' },
  ]

  const sources: ProductRecognizeSourceRecord[] = []
  const prepare = deps.prepareImage ?? prepareProductRecognizeImage
  const pipelineLatencies = {
    requestParseMs: pipelineContext.requestParseMs ?? 0,
    imageDecodeMs: pipelineContext.imageDecodeMs ?? 0,
    imagePrepMs: 0,
    imageAnalysisMs: 0,
    catalogSearchMs: 0,
    webEnrichmentMs: 0,
    enrichmentMs: 0,
    decisionMs: 0,
    totalMs: 0,
  }

  let prepared: PreparedProductRecognizeImage
  const prepStartedAt = Date.now()

  try {
    prepared = await prepare({
      base64: input.imageBase64,
      mimeType: input.mimeType,
      fileName: input.fileName,
    })
  } catch (error) {
    updateStep(steps, 'image_prep', {
      status: 'failed',
      summary: 'Bildvorbereitung fehlgeschlagen',
      detail: error instanceof Error ? error.message : 'Unbekannter Fehler',
    })

    const message =
      error instanceof ProductRecognizeImagePrepError
        ? error.message
        : 'Das Foto konnte nicht verarbeitet werden.'

    return {
      status: 'error',
      ...emptyResultBase(),
      sources,
      missingRequiredFields: ['image'],
      nextAction: { type: 'none', message: null },
      diagnostics: {
        model,
        latencyMs: Date.now() - startedAt,
        estimatedCost: null,
        warnings: [message],
        pipelineLatencies: {
          ...pipelineLatencies,
          imagePrepMs: Date.now() - prepStartedAt,
          totalMs: Date.now() - startedAt,
        },
      },
      steps,
      spike: true,
    }
  }

  pipelineLatencies.imagePrepMs = Date.now() - prepStartedAt

  updateStep(steps, 'image_prep', {
    status: 'completed',
    summary: prepared.prep.converted
      ? `HEIC → JPEG (${prepared.prep.conversionMs} ms)`
      : 'Keine Konvertierung nötig',
    detail: `${prepared.prep.originalFormat} (${prepared.prep.originalBytes} B) → ${prepared.prep.processedFormat} (${prepared.prep.processedBytes} B)`,
  })

  updateStep(steps, 'image_analysis', { status: 'running', summary: 'Bildanalyse läuft…' })

  let imageAnalysis: ProductRecognizeImageAnalysis
  const analysisStartedAt = Date.now()

  try {
    logProductRecognizePipeline('openai_analysis_start', {
      mimeType: prepared.mimeType,
      processedBytes: prepared.prep.processedBytes,
    })
    imageAnalysis = await deps.analyzeImage({
      base64: prepared.base64,
      mimeType: prepared.mimeType,
    })
    logProductRecognizePipeline('openai_analysis_complete', {
      durationMs: Date.now() - analysisStartedAt,
    })
  } catch (error) {
    logProductRecognizePipelineError('openai_analysis_failed', {
      durationMs: Date.now() - analysisStartedAt,
      message: error instanceof Error ? error.message : String(error),
    })
    updateStep(steps, 'image_analysis', {
      status: 'failed',
      summary: 'Bildanalyse fehlgeschlagen',
      detail: error instanceof Error ? error.message : 'Unbekannter Fehler',
    })

    return {
      status: 'error',
      ...emptyResultBase(),
      sources,
      missingRequiredFields: ['productName'],
      nextAction: { type: 'none', message: null },
      diagnostics: {
        model,
        latencyMs: Date.now() - startedAt,
        estimatedCost: null,
        warnings: ['OpenAI-Bildanalyse fehlgeschlagen.'],
        imagePrep: prepared.prep,
        searchProvider: deps.searchProvider.name,
        pipelineLatencies: {
          ...pipelineLatencies,
          imagePrepMs: pipelineLatencies.imagePrepMs,
          imageAnalysisMs: Date.now() - analysisStartedAt,
          totalMs: Date.now() - startedAt,
        },
      },
      steps,
      spike: true,
    }
  }

  pipelineLatencies.imageAnalysisMs = Date.now() - analysisStartedAt

  sources.push({
    type: 'image',
    title: 'Vorderseitenfoto',
    url: null,
    retrievedAt: now(),
  })

  updateStep(steps, 'image_analysis', {
    status: 'completed',
    summary: summarizeIdentity(recognitionFromImageAnalysis(imageAnalysis)),
  })

  let recognition = recognitionFromImageAnalysis(imageAnalysis)
  const sanitizedAnalysis = sanitizeImageAnalysis(imageAnalysis)

  updateStep(steps, 'catalog_search', { status: 'running', summary: 'Katalog wird durchsucht…' })

  const catalogStartedAt = Date.now()
  const catalog = await deps.loadCatalog()
  const catalogResult = resolveCatalogMatch(catalog, sanitizedAnalysis)
  const ambiguousVariant =
    catalogResult.ambiguousProductIds.length > 1 ||
    namesArePlausibleVariantConflict(
      sanitizedAnalysis,
      catalog,
      catalogResult.ambiguousProductIds,
    )

  pipelineLatencies.catalogSearchMs = Date.now() - catalogStartedAt

  updateStep(steps, 'catalog_search', {
    status: 'completed',
    summary: summarizeCatalogMatch(catalogResult),
  })

  if (catalogResult.match.matched && catalogResult.match.productId) {
    const item = catalog.find((entry) => entry.id === catalogResult.match.productId)

    if (item) {
      recognition = mergeCatalogIntoRecognition(
        recognition,
        item,
        catalogResult.match.confidence,
      )

      sources.push({
        type: 'verified_catalog',
        title: `${item.manufacturer} – ${item.officialName}`,
        url: item.manufacturerUrl ?? null,
        retrievedAt: now(),
      })
    }
  }

  let webExtraction: ProductRecognizeWebExtraction | null = null

  if (!catalogResult.match.matched) {
    updateStep(steps, 'web_enrichment', {
      status: 'running',
      summary: 'Webquellen werden recherchiert…',
    })

    const queries = buildWebSearchQueries(sanitizedAnalysis, recognition)
    const webStartedAt = Date.now()

    try {
      webExtraction = await Promise.race([
        deps.searchProvider.searchAndExtract({
          analysis: sanitizedAnalysis,
          recognition,
          queries,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Web-Anreicherung Timeout')),
            PRODUCT_RECOGNIZE_WEB_ENRICHMENT_TIMEOUT_MS,
          )
        }),
      ])

      if (webExtraction.fields.length > 0) {
        recognition = mergeWebExtractionIntoRecognition(recognition, webExtraction)
      }

      sources.push(...webSourcesToRecords(webExtraction))
    } catch (error) {
      webExtraction = {
        fields: [],
        sources: [],
        conflicts: [],
        provider: deps.searchProvider.name,
        failed: true,
      }
      warnings.push(
        error instanceof Error
          ? `Web-Anreicherung fehlgeschlagen: ${error.message}`
          : 'Web-Anreicherung fehlgeschlagen.',
      )
    }

    pipelineLatencies.webEnrichmentMs = Date.now() - webStartedAt
    pipelineLatencies.enrichmentMs = pipelineLatencies.webEnrichmentMs

    updateStep(steps, 'web_enrichment', {
      status: webExtraction.failed ? 'failed' : 'completed',
      summary: summarizeWebEnrichment(webExtraction),
      detail: webExtraction.conflicts.join(' · ') || undefined,
    })
  } else {
    updateStep(steps, 'web_enrichment', {
      status: 'skipped',
      summary: 'Übersprungen — ausreichender Katalogtreffer.',
    })
  }

  const identityConfidence = computeIdentityConfidence(recognition)
  const dataCompleteness = computeDataCompleteness(recognition)
  const contradictorySources = hasContradictorySources(webExtraction, recognition)
  const missingIdentityFields = collectMissingIdentityFields(recognition)

  const decisionStartedAt = Date.now()

  const status = determineRecognitionStatus({
    recognition,
    identityConfidence,
    ambiguousVariant,
    webExtraction,
    contradictorySources,
  })

  const nextAction = determineNextAction({
    status,
    identityConfidence,
    ambiguousVariant,
    contradictorySources,
    missingIdentityFields,
    recognition,
  })

  const stockCapture = evaluateStockCapture({
    identityConfidence,
    ambiguousVariant,
  })

  pipelineLatencies.decisionMs = Date.now() - decisionStartedAt
  pipelineLatencies.totalMs = Date.now() - startedAt
  pipelineLatencies.enrichmentMs = pipelineLatencies.webEnrichmentMs

  logProductRecognizePipeline('pipeline_complete', {
    totalMs: pipelineLatencies.totalMs,
    imagePrepMs: pipelineLatencies.imagePrepMs,
    imageAnalysisMs: pipelineLatencies.imageAnalysisMs,
    enrichmentMs: pipelineLatencies.enrichmentMs,
  })

  updateStep(steps, 'decision', {
    status: 'completed',
    summary:
      nextAction.type === 'request_back_photo'
        ? 'Rückseitenfoto empfohlen'
        : status === 'identified'
          ? 'Produkt identifiziert'
          : 'Weitere Klärung nötig',
    detail: nextAction.message ?? undefined,
  })

  if (webExtraction?.conflicts.length) {
    warnings.push(...webExtraction.conflicts.map((conflict) => `Widerspruch: ${conflict}`))
  }

  if (webExtraction?.failed) {
    warnings.push('Web-Anreicherung fehlgeschlagen — optionale Felder bleiben unbekannt.')
  }

  return {
    status,
    identityConfidence,
    dataCompleteness,
    recognition,
    catalogMatch: catalogResult.match,
    sources,
    missingRequiredFields: missingIdentityFields,
    nextAction,
    stockCapture,
    diagnostics: {
      model,
      latencyMs: pipelineLatencies.totalMs,
      estimatedCost: null,
      warnings,
      imagePrep: prepared.prep,
      searchProvider: deps.searchProvider.name,
      pipelineLatencies,
    },
    steps,
    spike: true,
  }
}
