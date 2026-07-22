import type {
  Product,
  ProductImportInput,
  ProductImportResult,
  ProductImportSource,
} from '../types/product'

const IMPORT_PRODUCT_URL = '/.netlify/functions/import-product'

function mapClientError(status: number, message: string): string {
  if (status === 400) {
    return message
  }

  if (status === 405) {
    return 'Die Import-Route ist nicht erreichbar.'
  }

  if (status >= 500) {
    return message || 'Der Produktimport ist serverseitig fehlgeschlagen.'
  }

  return message || 'Der Produktimport ist fehlgeschlagen.'
}

/**
 * Importiert ein Produkt über die serverseitige Netlify Function.
 * Schreibt nicht direkt in Supabase aus dem Browser.
 */
export async function importProduct(input: ProductImportInput): Promise<ProductImportResult> {
  let response: Response

  try {
    response = await fetch(IMPORT_PRODUCT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
  } catch {
    throw new Error('Netzwerkfehler beim Produktimport. Bitte prüfe deine Verbindung.')
  }

  let payload: { error?: string; product?: Product; created?: boolean } = {}

  try {
    payload = (await response.json()) as typeof payload
  } catch {
    throw new Error('Die Serverantwort war ungültig.')
  }

  if (!response.ok) {
    throw new Error(mapClientError(response.status, payload.error ?? ''))
  }

  if (!payload.product || typeof payload.created !== 'boolean') {
    throw new Error('Die Serverantwort war ungültig.')
  }

  return {
    product: payload.product,
    created: payload.created,
  }
}

/** Importiert mehrere Produkte nacheinander. */
export async function importProducts(inputs: ProductImportInput[]): Promise<ProductImportResult[]> {
  const results: ProductImportResult[] = []

  for (const input of inputs) {
    results.push(await importProduct(input))
  }

  return results
}

/**
 * Führt einen registrierten Import-Adapter aus.
 * Quellen implementieren ProductImportSource und liefern normalisierte ProductImportInput-Datensätze.
 */
export async function importFromSource(source: ProductImportSource): Promise<ProductImportResult[]> {
  const records = await source.fetchRecords()

  return importProducts(
    records.map((record) => ({
      ...record,
      sourceName: record.sourceName ?? source.sourceName,
    })),
  )
}

export type { ProductImportInput, ProductImportResult, ProductImportSource, Product }
