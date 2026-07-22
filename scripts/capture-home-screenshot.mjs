import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { createServer } from 'vite'
import screenshotConfig from '../vite.screenshot.config.mjs'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const outputDir = resolve(rootDir, 'docs/playbook/sprints/screenshots')

async function captureHomeScreenshot() {
  await mkdir(outputDir, { recursive: true })

  const server = await createServer(screenshotConfig)
  await server.listen()
  const address = server.resolvedUrls?.local[0]

  if (!address) {
    await server.close()
    throw new Error('Screenshot-Server konnte nicht gestartet werden.')
  }

  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  })

  try {
    await page.goto(address, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)

    await page.screenshot({
      path: resolve(outputDir, 'home-experience-mobile.png'),
      fullPage: true,
    })
  } finally {
    await browser.close()
    await server.close()
  }

  await writeFile(
    resolve(outputDir, 'README.md'),
    `# Home Experience Screenshots

Erstellt für Sprint 1.1 (UX Polish).

## Dateien

- \`home-experience-mobile.png\` – Startseite, Viewport 390×844 (iPhone-ähnlich), @2x

## Erneut erzeugen

\`\`\`bash
npm run screenshot:home
\`\`\`
`,
  )
}

captureHomeScreenshot().catch((error) => {
  console.error(error)
  process.exit(1)
})
