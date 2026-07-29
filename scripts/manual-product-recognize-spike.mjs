#!/usr/bin/env node
/**
 * Manueller Integrationstest für GA-013 Product Recognize Spike.
 * Live-Aufrufe: OpenAI (Vision + Web Search), Supabase-Katalog.
 *
 * Usage:
 *   npx tsx scripts/manual-product-recognize-spike.mjs spike/fixtures/IMG_0081.HEIC
 */

import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { runProductRecognition } from '../src/lib/productRecognizeCore.ts'
import { createOpenAiProductRecognizeDeps } from '../src/lib/productRecognizeServer.ts'

const imagePath = process.argv[2] ?? 'spike/fixtures/IMG_0081.HEIC'
const apiKey = process.env.OPENAI_API_KEY?.trim()

if (!apiKey) {
  console.error('OPENAI_API_KEY fehlt.')
  process.exit(1)
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY werden für den Katalogabruf benötigt.')
  process.exit(1)
}

const ext = extname(imagePath).toLowerCase()
const mimeType =
  ext === '.heic'
    ? 'image/heic'
    : ext === '.heif'
      ? 'image/heif'
      : ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/jpeg'

const buffer = await readFile(imagePath)
const base64 = buffer.toString('base64')

console.log(`\n🔬 Manueller Product-Recognize-Spike`)
console.log(`📷 Bild: ${basename(imagePath)} (${mimeType}, ${buffer.length} bytes)\n`)

const result = await runProductRecognition(
  { imageBase64: base64, mimeType, fileName: basename(imagePath) },
  createOpenAiProductRecognizeDeps(apiKey),
)

console.log(JSON.stringify(result, null, 2))

console.log('\n--- Kurzfassung ---')
console.log(`Status: ${result.status}`)
console.log(`Identity Confidence: ${Math.round(result.identityConfidence * 100)} %`)
console.log(`Data Completeness: ${Math.round(result.dataCompleteness * 100)} %`)
console.log(`Katalog: ${result.catalogMatch.matched ? result.catalogMatch.productId : 'kein Treffer'}`)
console.log(`Bestand möglich: ${result.stockCapture.allowed ? 'ja' : 'nein'}`)
console.log(`Nächster Schritt: ${result.nextAction.type}`)
if (result.nextAction.message) {
  console.log(`Hinweis: ${result.nextAction.message}`)
}
