import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { FertilizerCaptureButton } from '../components/equipment/FertilizerCaptureButton'
import { SubpageHeader } from '../components/layout/SubpageHeader'
import { layoutStockListByProductForm } from '../lib/fertilizerCaptureCore'
import {
  getFertilizerApplicationIneligibilityMessage,
  isFertilizerStockListItemApplicationEligible,
} from '../lib/fertilizerApplicationFlowCore'
import { fetchFertilizerStockList } from '../lib/fertilizerInventory'
import { FERTILIZER_ROUTES, fertilizerApplicationPath } from '../lib/fertilizerRoutes'
import type { FertilizerStockListItem } from '../types/fertilizerInventory'
import styles from './FertilizerCategoryPage.module.css'

function formatBalance(item: FertilizerStockListItem): string {
  const unit = item.baseUnit ?? item.unit
  const value = item.balance
  const formatted = Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('de-DE', { maximumFractionDigits: 4 })
  return `${formatted} ${unit}`
}

function formatPackageSize(value: number, unit: string): string {
  const formatted = Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('de-DE', { maximumFractionDigits: 4 })
  return `${formatted} ${unit}`
}

function StockListItem({ item }: { item: FertilizerStockListItem }) {
  const eligible = isFertilizerStockListItemApplicationEligible(item)
  const applyPath = fertilizerApplicationPath(item.id)

  return (
    <li>
      <div className={styles.stockItem}>
        <div className={styles.stockItemMain}>
          <span className={styles.stockItemName}>{item.productLabel}</span>
          {item.packageSizeValue != null && item.packageSizeUnit && (
            <span className={styles.stockItemMeta}>
              Gebinde {formatPackageSize(item.packageSizeValue, item.packageSizeUnit)}
            </span>
          )}
          {!eligible && item.balance > 0 && (
            <span className={styles.stockItemHint}>
              {getFertilizerApplicationIneligibilityMessage(item)}
            </span>
          )}
        </div>

        <div className={styles.stockItemActions}>
          <span className={styles.stockItemBalance}>{formatBalance(item)}</span>
          {eligible ? (
            <Link className={styles.applyAction} to={applyPath}>
              Anwenden
            </Link>
          ) : (
            <span className={styles.applyActionDisabled} aria-disabled="true">
              Anwenden
            </span>
          )}
        </div>
      </div>
    </li>
  )
}

function StockList({ items }: { items: FertilizerStockListItem[] }) {
  return (
    <ul className={styles.stockList}>
      {items.map((item) => (
        <StockListItem key={item.id} item={item} />
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
