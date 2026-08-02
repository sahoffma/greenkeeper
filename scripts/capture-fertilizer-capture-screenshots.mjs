import { readFileSync, statSync } from 'node:fs'
import { mkdir as mkdirAsync } from 'node:fs/promises'
import { createServer as createHttpServer } from 'node:http'
import { dirname, extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { build } from 'vite'
import screenshotConfig from '../vite.screenshot.config.mjs'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const outputDir = resolve(rootDir, 'docs/playbook/sprints/screenshots')
const distDir = resolve(rootDir, 'scripts/screenshot/.screenshot-capture-dist')
const captureHtml = resolve(rootDir, 'scripts/screenshot/fertilizer-capture.html')

const CAPTURES = [
  {
    mode: 'find',
    filename: 'fertilizer-capture-find.png',
    waitFor: 'Eigenes Produkt anlegen',
  },
  {
    mode: 'clarify-package',
    filename: 'fertilizer-capture-clarify-package.png',
    waitFor: 'Waren es 7 kg oder 25 kg',
  },
  {
    mode: 'free-quantity',
    filename: 'fertilizer-capture-free-quantity.png',
    waitFor: 'Wie viel hast Du aktuell?',
  },
  {
    mode: 'summary',
    filename: 'fertilizer-capture-summary.png',
    waitFor: 'Zum Bestand hinzufügen',
  },
]

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function serveStatic(root) {
  return createHttpServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    let pathname = decodeURIComponent(url.pathname)

    if (pathname === '/') {
      pathname = '/fertilizer-capture.html'
    }

    const filePath = resolve(root, `.${pathname}`)

    if (!filePath.startsWith(root)) {
      response.writeHead(403)
      response.end()
      return
    }

    try {
      const stats = statSync(filePath)

      if (!stats.isFile()) {
        response.writeHead(404)
        response.end()
        return
      }

      const ext = extname(filePath)
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
      })
      response.end(readFileSync(filePath))
    } catch {
      response.writeHead(404)
      response.end()
    }
  })
}

async function captureFertilizerCaptureScreenshots() {
  await mkdirAsync(outputDir, { recursive: true })

  await build({
    ...screenshotConfig,
    build: {
      outDir: distDir,
      emptyOutDir: true,
      rollupOptions: {
        input: captureHtml,
      },
    },
  })

  const server = serveStatic(distDir)

  await new Promise((resolvePromise) => {
    server.listen(5197, '127.0.0.1', resolvePromise)
  })

  const browser = await chromium.launch()

  try {
    for (const capture of CAPTURES) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
        deviceScaleFactor: 1,
      })

      try {
        await page.goto(`http://127.0.0.1:5197/fertilizer-capture.html?mode=${capture.mode}`, {
          waitUntil: 'networkidle',
        })
        await page.waitForSelector(`text=${capture.waitFor}`, { timeout: 15_000 })
        await page.waitForTimeout(300)

        const outputPath = resolve(outputDir, capture.filename)
        await page.screenshot({
          path: outputPath,
          fullPage: true,
        })

        console.log(`Screenshot gespeichert: ${outputPath}`)
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
    await new Promise((resolvePromise, reject) => {
      server.close((error) => (error ? reject(error) : resolvePromise()))
    })
  }
}

captureFertilizerCaptureScreenshots().catch((error) => {
  console.error(error)
  process.exit(1)
})
