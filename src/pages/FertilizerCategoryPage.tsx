import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { FertilizerCaptureButton } from '../components/equipment/FertilizerCaptureButton'
import { SubpageHeader } from '../components/layout/SubpageHeader'
import type { FertilizerCaptureProductForm } from '../data/fertilizerCaptureFixtures'
import { shouldShowProductFormFilter } from '../lib/fertilizerCaptureCore'
import { fetchFertilizerStockList } from '../lib/fertilizerInventory'
import type { FertilizerStockListItem } from '../types/fertilizerInventory'
import { FERTILIZER_ROUTES } from '../lib/fertilizerRoutes'
import styles from './FertilizerCategoryPage.module.css'

function formatBalance(value: number, unit: string): string {
  const formatted = Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('de-DE', { maximumFractionDigits: 1 })
  return `${formatted} ${unit}`
}

export function FertilizerCategoryPage() {
  const [items, setItems] = useState<FertilizerStockListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void fetchFertilizerStockList()
      .then((data) => {
        if (!cancelled) {
          setItems(data)
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Der Düngerbestand konnte nicht geladen werden.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const inStockForms = items
    .map((item) => item.productForm)
    .filter((form): form is FertilizerCaptureProductForm => form != null)

  const showInStockFormFilter = shouldShowProductFormFilter(inStockForms)

  return (
    <HomeAppShell>
      <main className={styles.screen}>
        <SubpageHeader
          title="Dünger"
          backTo="/ausruestung"
          backLabel="Zurück zu Ausrüstung"
          hideTitle
        />

        <div className={styles.captureBlock}>
          <FertilizerCaptureButton to={FERTILIZER_ROUTES.capture} />
        </div>

        <section className={styles.section} aria-labelledby="fertilizer-in-stock-heading">
          <div className={styles.sectionHeaderRow}>
            <h2 id="fertilizer-in-stock-heading" className={styles.sectionHeading}>
              Im Bestand
            </h2>
            {showInStockFormFilter && (
              <div className={styles.formFilter} role="group" aria-label="Produktform filtern">
                <button type="button" className={styles.formFilterButton} aria-pressed="true">
                  Granulat
                </button>
                <button type="button" className={styles.formFilterButton} aria-pressed="false">
                  Flüssig
                </button>
              </div>
            )}
          </div>

          {loading && (
            <div className={styles.panel}>
              <p className={styles.emptyMessage}>Bestand wird geladen…</p>
            </div>
          )}

          {error && (
            <div className={styles.panel} role="alert">
              <p className={styles.emptyMessage}>{error}</p>
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className={styles.panel}>
              <p className={styles.emptyMessage}>Noch kein Dünger im Bestand.</p>
              <p className={styles.emptyHint}>
                Erfasse deinen ersten Dünger, um deinen Bestand zu verwalten.
              </p>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <ul className={styles.stockList}>
              {items.map((item) => (
                <li key={item.id}>
                  <Link
                    className={styles.stockItem}
                    to={FERTILIZER_ROUTES.hub}
                  >
                    <span className={styles.stockItemName}>{item.productLabel}</span>
                    <span className={styles.stockItemBalance}>
                      {formatBalance(item.balance, item.unit)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <details className={styles.collapsible}>
          <summary className={styles.collapsibleSummary}>Nicht mehr im Bestand</summary>
        </details>
      </main>
    </HomeAppShell>
  )
}
