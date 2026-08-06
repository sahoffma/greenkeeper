import OpenAI from 'openai'
import { createSupabaseAdminClient } from './supabaseAdmin'
import { mapProductRow, PRODUCT_SELECT, type ProductRow } from './productMapping'
import {
  buildImageAnalysisInstruction,
  parseImageAnalysisResponse,
  PRODUCT_RECOGNIZE_IMAGE_MODEL,
  productRecognizeImageSchema,
} from './productRecognizeImageCore'
import {
  buildRecognitionPackageParseDiagnostics,
} from './productRecognizeImagePackageDiagnosticsCore'
import { productToCatalogItem } from './productRecognizeCatalogCore'
import type { ProductRecognizeCatalogItem } from '../types/productRecognize'
import type { ProductRecognizeDeps } from './productRecognizeCore'
import {
  buildWebSearchPrompt,
  parseWebSearchExtraction,
  productRecognizeWebSearchSchema,
  type ProductRecognizeSearchProvider,
} from './productRecognizeSearchCore'
import {
  logProductRecognizePipeline,
} from './productRecognizePipelineLogCore'

export async function loadRecognizeCatalog(): Promise<ProductRecognizeCatalogItem[]> {
  const supabase = createSupabaseAdminClient()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_SELECT)
    .is('soft_deleted_at', null)

  if (error) {
    throw new Error(error.message || 'Katalog konnte nicht geladen werden.')
  }

  return (data ?? []).map((row) => productToCatalogItem(mapProductRow(row as unknown as ProductRow)))
}

export function createOpenAiWebSearchProvider(openai: OpenAI): ProductRecognizeSearchProvider {
  return {
    name: 'openai_web_search',
    searchAndExtract: async ({ analysis, recognition, queries }) => {
      const retrievedAt = new Date().toISOString()

      try {
        const response = await openai.responses.create({
          model: PRODUCT_RECOGNIZE_IMAGE_MODEL,
          tools: [{ type: 'web_search' }],
          input: [
            {
              role: 'system',
              content:
                'Du recherchierst Düngerprodukte für Greenkeeper. Nutze das Web-Search-Tool. Bevorzuge offizielle Hersteller- oder Markenseiten. Keine Erfindungen.',
            },
            {
              role: 'user',
              content: buildWebSearchPrompt(queries, analysis, recognition),
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'product_recognize_web_search',
              strict: true,
              schema: productRecognizeWebSearchSchema,
            },
          },
        })

        const outputText = response.output_text

        if (!outputText) {
          return {
            fields: [],
            sources: [],
            conflicts: [],
            provider: 'openai_web_search',
            failed: true,
          }
        }

        return parseWebSearchExtraction(
          JSON.parse(outputText) as Record<string, unknown>,
          retrievedAt,
          'openai_web_search',
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Web-Suche fehlgeschlagen'
        throw new Error(message)
      }
    },
  }
}

export function createOpenAiProductRecognizeDeps(apiKey: string): ProductRecognizeDeps {
  const openai = new OpenAI({ apiKey })

  return {
    model: PRODUCT_RECOGNIZE_IMAGE_MODEL,
    analyzeImage: async ({ base64, mimeType }) => analyzeImageWithOpenAi(openai, base64, mimeType),
    loadCatalog: loadRecognizeCatalog,
    searchProvider: createOpenAiWebSearchProvider(openai),
  }
}

async function analyzeImageWithOpenAi(
  openai: OpenAI,
  base64: string,
  mimeType: string,
) {
  const response = await openai.responses.create({
    model: PRODUCT_RECOGNIZE_IMAGE_MODEL,
    input: [
      {
        role: 'system',
        content:
          'Du analysierst die Vorderseite von Düngerverpackungen für Greenkeeper. Trenne brand, productLine, productName/variant, productDescriptor und manufacturer (nur wenn sichtbar). Extrahiere packageSizeValue und packageSizeUnit (kg, g, l, ml) separat aus der sichtbaren Netto-Gebindeangabe. Keine Halluzinationen.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_image',
            image_url: `data:${mimeType};base64,${base64}`,
            detail: 'high',
          },
          {
            type: 'input_text',
            text: buildImageAnalysisInstruction(),
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'product_recognize_image',
        strict: true,
        schema: productRecognizeImageSchema,
      },
    },
  })

  const outputText = response.output_text

  if (!outputText) {
    throw new Error('Die KI-Antwort war leer.')
  }

  let rawRecord: Record<string, unknown> | null = null
  let rawVisionJsonParsed = false

  try {
    rawRecord = JSON.parse(outputText) as Record<string, unknown>
    rawVisionJsonParsed = true
  } catch {
    logProductRecognizePipeline('vision_package_parse_diagnostic', {
      ...buildRecognitionPackageParseDiagnostics({
        rawVisionJsonParsed: false,
        rawRecord: null,
        parsed: null,
      }),
    })
    throw new Error('Die KI-Antwort konnte nicht gelesen werden.')
  }

  const parsed = parseImageAnalysisResponse(rawRecord)
  logProductRecognizePipeline('vision_package_parse_diagnostic', {
    ...buildRecognitionPackageParseDiagnostics({
      rawVisionJsonParsed,
      rawRecord,
      parsed,
    }),
  })

  return parsed
}
