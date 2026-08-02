import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { FertilizerCaptureButton } from '../components/equipment/FertilizerCaptureButton'
import { SubpageHeader } from '../components/layout/SubpageHeader'
import { layoutStockListByProductForm } from '../lib/fertilizerCaptureCore'
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

function StockList({ items }: { items: FertilizerStockListItem[] }) {
  return (
    <ul className={styles.stockList}>
      {items.map((item) => (
        <li key={item.id}>
          <Link className={styles.stockItem} to={FERTILIZER_ROUTES.hub}>
            <span className={styles.stockItemName}>{item.productLabel}</span>
            <span className={styles.stockItemBalance}>
              {formatBalance(item.balance, item.unit)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

function StockListSection({ items }: { items: FertilizerStockListItem[] }) {
  if (items.length === 0) {
    return null
  }

  const layout = layoutStockListByProductForm(items)

  if (layout.mode === 'flat') {
    return <StockList items={layout.items} />
  }

  return (
    <div className={styles.formGroupList}>
      {layout.groups.map((group) => (
        <section key={group.key} className={styles.formGroup} aria-label={group.label}>
          <h3 className={styles.formGroupHeading}>{group.label}</h3>
          <StockList items={group.items} />
        </section>
      ))}
    </div>
  )
}

export function FertilizerCategoryPage() {
  const [inStock, setInStock] = useState<FertilizerStockListItem[]>([])
  const [outOfStock, setOutOfStock] = useState<FertilizerStockListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void fetchFertilizerStockList()
      .then((data) => {
        if (!cancelled) {
          setInStock(data.inStock)
          setOutOfStock(data.outOfStock)
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
          <h2 id="fertilizer-in-stock-heading" className={styles.sectionHeading}>
            Im Bestand
          </h2>

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

          {!loading && !error && inStock.length === 0 && (
            <div className={styles.panel}>
              <p className={styles.emptyMessage}>Noch kein Dünger im Bestand.</p>
              <p className={styles.emptyHint}>
                Erfasse deinen ersten Dünger, um deinen Bestand zu verwalten.
              </p>
            </div>
          )}

          {!loading && !error && inStock.length > 0 && <StockListSection items={inStock} />}
        </section>

        {!loading && !error && (
          <details className={styles.collapsible}>
            <summary className={styles.collapsibleSummary}>Nicht mehr im Bestand</summary>
            <div className={styles.collapsibleBody}>
              {outOfStock.length === 0 ? (
                <div className={styles.panel}>
                  <p className={styles.emptyHint}>Keine leeren Bestände.</p>
                </div>
              ) : (
                <StockListSection items={outOfStock} />
              )}
            </div>
          </details>
        )}
      </main>
    </HomeAppShell>
  )
}
