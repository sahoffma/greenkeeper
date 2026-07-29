import { useMemo, useState } from 'react'
import {
  ProductRecognizeClientError,
  recognizeProductFromImage,
} from '../../lib/productRecognizeClient'
import type { ProductRecognizeResult } from '../../types/productRecognize'
import styles from './ProductRecognizeSpikePage.module.css'

const STEP_LABELS: Record<string, string> = {
  image_prep: 'Bildvorbereitung',
  image_analysis: 'Bildanalyse',
  catalog_search: 'Katalogsuche',
  web_enrichment: 'Web-Anreicherung',
  decision: 'Entscheidung',
}

function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const [, meta, base64] = /^data:([^;]+);base64,(.+)$/.exec(result) ?? []

      resolve({
        mimeType: meta ?? (file.type || 'image/jpeg'),
        base64: base64 ?? result,
      })
    }

    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'))
    reader.readAsDataURL(file)
  })
}

export function ProductRecognizeSpikePage() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ProductRecognizeResult | null>(null)

  const backPhotoRequired = result?.nextAction.type === 'request_back_photo'

  const stepCards = useMemo(() => result?.steps ?? [], [result])

  async function handleAnalyze() {
    if (!selectedFile) {
      setError('Bitte wähle zuerst ein Vorderseitenfoto aus.')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const encoded = await fileToBase64(selectedFile)
      const response = await recognizeProductFromImage({
        imageBase64: encoded.base64,
        mimeType: encoded.mimeType,
        fileName: selectedFile.name,
      })
      setResult(response)
    } catch (caught) {
      if (caught instanceof ProductRecognizeClientError) {
        setError(caught.message)
      } else if (caught instanceof Error) {
        setError(caught.message)
      } else {
        setError('Unbekannter Fehler bei der Produkterkennung.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null
    setSelectedFile(file)
    setResult(null)
    setError(null)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setPreviewUrl(file ? URL.createObjectURL(file) : null)
  }

  return (
    <main className={styles.productRecognizeSpike}>
      <div className={styles.banner}>
        <strong>Technical Spike (GA-013)</strong> — nicht produktiv. Keine Persistierung im
        Katalog oder Bestand. Nur für lokale Entwicklung und Nachweis.
      </div>

      <h1 className={styles.title}>KI-Düngererkennung — Spike</h1>
      <p className={styles.subtitle}>
        Vorderseitenfoto hochladen, Pipeline beobachten, strukturiertes JSON prüfen. Empfohlenes
        Testfoto: Rasendoktor Professional „Frühjahr &amp; Neuansaat“ (5 kg, NPK 14-28-10) unter{' '}
        <code>spike/fixtures/rasendoktor-front.jpg</code>.
      </p>

      <div className={styles.uploadRow}>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          onChange={handleFileChange}
          data-testid="product-recognize-file"
        />
        <button
          type="button"
          className={styles.button}
          onClick={() => void handleAnalyze()}
          disabled={loading || !selectedFile}
        >
          {loading ? 'Analyse läuft…' : 'Analyse starten'}
        </button>
      </div>

      {previewUrl ? (
        <img src={previewUrl} alt="Vorschau Vorderseite" className={styles.preview} />
      ) : null}

      {error ? <div className={styles.error}>{error}</div> : null}

      {stepCards.length > 0 ? (
        <section className={styles.steps} aria-label="Pipeline-Schritte">
          {stepCards.map((step) => (
            <div
              key={step.id}
              className={`${styles.step} ${
                step.status === 'running' ? styles.stepRunning : ''
              } ${step.status === 'failed' ? styles.stepFailed : ''}`}
            >
              <div className={styles.stepTitle}>
                {STEP_LABELS[step.id] ?? step.id} — {step.status}
              </div>
              <div>{step.summary}</div>
              {step.detail ? <div className={styles.stepDetail}>{step.detail}</div> : null}
            </div>
          ))}
        </section>
      ) : null}

      {backPhotoRequired && result?.nextAction.message ? (
        <div className={styles.backPhoto}>{result.nextAction.message}</div>
      ) : null}

      {result?.sources.length ? (
        <section className={styles.sources}>
          <h2>Quellen</h2>
          {result.sources.map((source) => (
            <div key={`${source.type}-${source.title}-${source.retrievedAt}`} className={styles.sourceItem}>
              <strong>{source.type}</strong> — {source.title}
              {source.url ? (
                <>
                  {' '}
                  (<a href={source.url}>{source.url}</a>)
                </>
              ) : null}
              <div className={styles.stepDetail}>{source.retrievedAt}</div>
            </div>
          ))}
        </section>
      ) : null}

      {result ? (
        <section>
          <h2>Strukturiertes Ergebnis</h2>
          <pre className={styles.jsonBlock}>{JSON.stringify(result, null, 2)}</pre>
        </section>
      ) : null}
    </main>
  )
}
