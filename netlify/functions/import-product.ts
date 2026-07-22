import type { Handler } from '@netlify/functions'
import {
  parseProductImportBody,
  ProductImportValidationError,
} from '../../src/lib/productImportCore'
import { importProductWithServiceRole } from '../../src/lib/productImportServer'

function jsonResponse(statusCode: number, payload: Record<string, unknown>) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Nur POST-Anfragen sind erlaubt.' })
  }

  let body: unknown

  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return jsonResponse(400, { error: 'Ungültiger JSON-Body.' })
  }

  try {
    const input = parseProductImportBody(body)
    const result = await importProductWithServiceRole(input)

    return jsonResponse(result.created ? 201 : 200, {
      product: result.product,
      created: result.created,
    })
  } catch (error) {
    if (error instanceof ProductImportValidationError) {
      return jsonResponse(400, { error: error.message })
    }

    const message =
      error instanceof Error ? error.message : 'Der Produktimport ist fehlgeschlagen.'

    if (
      message.includes('SUPABASE_URL') ||
      message.includes('SUPABASE_SERVICE_ROLE_KEY')
    ) {
      return jsonResponse(500, { error: message })
    }

    return jsonResponse(500, { error: message })
  }
}
