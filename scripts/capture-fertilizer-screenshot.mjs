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
const outputPath = resolve(outputDir, 'fertilizer-start-page-final.png')
const distDir = resolve(rootDir, 'scripts/screenshot/.screenshot-dist')
const fertilizerHtml = resolve(rootDir, 'scripts/screenshot/fertilizer.html')

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
      pathname = '/fertilizer.html'
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

async function captureFertilizerScreenshot() {
  await mkdirAsync(outputDir, { recursive: true })

  await build({
    ...screenshotConfig,
    build: {
      outDir: distDir,
      emptyOutDir: true,
      rollupOptions: {
        input: fertilizerHtml,
      },
    },
  })

  const server = serveStatic(distDir)

  await new Promise((resolvePromise) => {
    server.listen(5198, '127.0.0.1', resolvePromise)
  })

  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
  })

  try {
    await page.goto('http://127.0.0.1:5198/fertilizer.html', { waitUntil: 'networkidle' })
    await page.waitForSelector('text=Dünger erfassen', { timeout: 15_000 })
    await page.waitForSelector('text=Im Bestand', { timeout: 15_000 })
    await page.waitForSelector('text=Nicht mehr im Bestand', { timeout: 15_000 })

    const visibleTitle = page.locator('h1:not(.visually-hidden)', { hasText: 'Dünger' })
    if ((await visibleTitle.count()) > 0) {
      throw new Error('Sichtbarer Seitentitel „Dünger“ ist noch vorhanden.')
    }

    await page.waitForTimeout(300)

    await page.screenshot({
      path: outputPath,
      fullPage: true,
    })
  } finally {
    await browser.close()
    await new Promise((resolvePromise, reject) => {
      server.close((error) => (error ? reject(error) : resolvePromise()))
    })
  }

  console.log(`Screenshot gespeichert: ${outputPath}`)
}

captureFertilizerScreenshot().catch((error) => {
  console.error(error)
  process.exit(1)
})
