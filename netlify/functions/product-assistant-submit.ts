import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '../../src/lib/supabaseAdmin'
import { submitNewProduct } from '../../src/lib/productGovernanceService'
import { mapAssistantChannel } from '../../src/types/productAssistant'
import type { ProductAssistantSubmitRequest } from '../../src/types/productAssistant'
import { parseProductImportBody, ProductImportValidationError } from '../../src/lib/productImportCore'
import { inferAiFieldConfidence } from '../../src/lib/productAssistantCore'
import type { ProductAssistantAnalysisResult } from '../../src/types/productAssistant'

function jsonResponse(statusCode: number, payload: Record<string, unknown>) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }
}

async function resolveUserId(authHeader: string | undefined): Promise<string | null> {
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return null
  }

  const supabaseUrl = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!supabaseUrl || !serviceRoleKey) {
    return null
  }

  const authClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await authClient.auth.getUser(token)

  if (error || !data.user) {
    return null
  }

  return data.user.id
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Nur POST-Anfragen sind erlaubt.' })
  }

  const userId = await resolveUserId(event.headers.authorization)

  if (!userId) {
    return jsonResponse(401, { error: 'Anmeldung erforderlich.' })
  }

  let body: ProductAssistantSubmitRequest

  try {
    body = JSON.parse(event.body ?? '{}') as ProductAssistantSubmitRequest
  } catch {
    return jsonResponse(400, { error: 'Ungültiger JSON-Body.' })
  }

  if (!body.payload || typeof body.payload !== 'object') {
    return jsonResponse(400, { error: 'Produktvorschlag fehlt.' })
  }

  const allowedChannels = ['photo_upload', 'manual_entry', 'url_import', 'pdf_upload'] as const

  if (!allowedChannels.includes(body.channel as (typeof allowedChannels)[number])) {
    return jsonResponse(400, { error: 'Ungültiger Einreichungskanal.' })
  }

  const clientChannel = body.channel as (typeof allowedChannels)[number]
  const sourceTypeFromSources =
    body.sources?.[0]?.sourceType === 'retailer_page' ? 'shop_url' : 'manufacturer_url'

  try {
    const importInput = parseProductImportBody(body.payload)
    const supabase = createSupabaseAdminClient()

    const aiFieldConfidence =
      body.aiFieldConfidence ??
      inferAiFieldConfidence({
        devMode: false,
        manufacturer: importInput.manufacturer,
        officialName: importInput.officialName,
        productForm: importInput.productForm ?? null,
        npk: importInput.npk ?? null,
        nPercent: importInput.nPercent ?? null,
        p2o5Percent: importInput.p2o5Percent ?? null,
        k2oPercent: importInput.k2oPercent ?? null,
        mgoPercent: importInput.mgoPercent ?? null,
        so3Percent: importInput.so3Percent ?? null,
        fePercent: importInput.fePercent ?? null,
        mnPercent: importInput.mnPercent ?? null,
        recommendedRateMin: importInput.recommendedRateMin ?? null,
        recommendedRateMax: importInput.recommendedRateMax ?? null,
        recommendedRateUnit: importInput.recommendedRateUnit ?? null,
        liquidRateMin: importInput.liquidRateMin ?? null,
        liquidRateMax: importInput.liquidRateMax ?? null,
        densityKgPerL: importInput.densityKgPerL ?? null,
        nutrientBasis: importInput.nutrientBasis ?? null,
        applicationMethod: importInput.applicationMethod ?? null,
        longevityWeeksMin: importInput.longevityWeeksMin ?? null,
        longevityWeeksMax: importInput.longevityWeeksMax ?? null,
        sourceDescription: body.sources?.[0]?.sourceName ?? null,
        missingFields: [],
        uncertainFields: [],
        warnings: [],
      } satisfies ProductAssistantAnalysisResult)

    const submissionChannel = mapAssistantChannel(
      clientChannel,
      clientChannel === 'url_import' ? sourceTypeFromSources : undefined,
    )

    const sourceKind =
      clientChannel === 'photo_upload'
        ? 'user_photo'
        : clientChannel === 'pdf_upload'
          ? 'manufacturer_pdf'
          : clientChannel === 'url_import'
            ? sourceTypeFromSources === 'shop_url'
              ? 'retailer_page'
              : 'manufacturer_website'
            : 'other'

    const submission = await submitNewProduct(
      {
        submittedBy: userId,
        payload: importInput,
        submissionChannel,
        sources: body.sources?.map((source) => ({
          sourceType: source.sourceType as 'user_submission',
          sourceName: source.sourceName,
          sourceUrl: source.sourceUrl ?? null,
          retrievedAt: source.retrievedAt,
          evidence: source.evidence ?? null,
          sourceKind,
        })),
        aiFieldConfidence,
      },
      supabase,
    )

    return jsonResponse(201, {
      submissionId: submission.id,
      status: submission.status,
      message:
        'Dein Produktvorschlag wurde eingereicht. Du kannst das Produkt sofort in deinem Journal verwenden – die Freigabe für die öffentliche Datenbank erfolgt nach dem Review.',
    })
  } catch (error) {
    if (error instanceof ProductImportValidationError) {
      return jsonResponse(400, { error: error.message })
    }

    const message = error instanceof Error ? error.message : 'Einreichung fehlgeschlagen.'
    return jsonResponse(500, { error: message })
  }
}
