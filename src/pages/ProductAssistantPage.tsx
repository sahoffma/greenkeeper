import { useEffect, useState } from 'react'
import { ProductLearnAssistant } from '../components/ProductLearnAssistant/ProductLearnAssistant'
import { fetchProducts } from '../lib/products'
import { getErrorMessage } from '../lib/errors'
import type { Product } from '../types/product'
import styles from './ProductAssistantPage.module.css'

export function ProductAssistantPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [error, setError] = useState<string | null>(null)
  const [completionMessage, setCompletionMessage] = useState<string | null>(null)
  const [assistantKey, setAssistantKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadProducts() {
      try {
        const data = await fetchProducts()
        if (!cancelled) {
          setProducts(data)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(getErrorMessage(loadError, 'Produktbibliothek konnte nicht geladen werden.'))
        }
      }
    }

    void loadProducts()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className={styles.productAssistant}>
      <section className={styles.hero}>
        <h1>Produkt-Assistent</h1>
        <p>
          Wenn Greenkeeper ein Produkt noch nicht kennt, hilfst du ihm hier beim Kennenlernen.
          Wähle die Quelle, die für dich am einfachsten ist – neue Vorschläge werden zur Prüfung
          eingereicht und können sofort im persönlichen Journal genutzt werden.
        </p>
      </section>

      {error && <div className={styles.errorBox}>{error}</div>}
      {completionMessage && <div className={styles.successBox}>{completionMessage}</div>}

      <ProductLearnAssistant
        key={assistantKey}
        spokenProductName=""
        products={products}
        variant="page"
        onComplete={(result) => {
          setCompletionMessage(
            result.submissionMessage ??
              'Produktvorschlag eingereicht. Du kannst das Produkt sofort in deinem Journal verwenden.',
          )
        }}
      />

      {completionMessage && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => {
              setCompletionMessage(null)
              setAssistantKey((current) => current + 1)
            }}
          >
            Weiteres Produkt prüfen
          </button>
        </div>
      )}
    </div>
  )
}
