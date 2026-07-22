import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { iclSpringStartProduct } from '../src/data/iclSpringStartProduct.ts'
import { importProductWithServiceRole } from '../src/lib/productImportServer.ts'

function loadEnvFiles() {
  for (const fileName of ['.env.local', '.env']) {
    const filePath = resolve(process.cwd(), fileName)

    if (!existsSync(filePath)) {
      continue
    }

    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim()

      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      const separatorIndex = trimmed.indexOf('=')

      if (separatorIndex === -1) {
        continue
      }

      const key = trimmed.slice(0, separatorIndex).trim()
      const value = trimmed.slice(separatorIndex + 1).trim()

      if (key && process.env[key] == null) {
        process.env[key] = value
      }
    }
  }
}

async function main() {
  loadEnvFiles()

  const result = await importProductWithServiceRole(iclSpringStartProduct)

  console.log(
    result.created
      ? `Produkt angelegt: ${result.product.manufacturer} – ${result.product.officialName}`
      : `Produkt aktualisiert: ${result.product.manufacturer} – ${result.product.officialName}`,
  )
  console.log(`ID: ${result.product.id}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Import.'
  console.error(message)
  process.exitCode = 1
})
