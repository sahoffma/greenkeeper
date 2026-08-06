import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { SubpageHeader } from '../components/layout/SubpageHeader'
import { fetchFertilizerProductStockRow } from '../lib/fertilizerInventory'
import {
  FERTILIZER_PRODUCT_DETAIL_NOT_FOUND_MESSAGE,
  resolveFertilizerProductDetailPageState,
} from '../lib/fertilizerProductDetailPageCore'
import {
  FERTILIZER_ROUTES,
  fertilizerStockIntakePath,
  fertilizerStockOutboundPath,
  isValidFertilizerInventoryItemRouteId,
} from '../lib/fertilizerRoutes'
import styles from './FertilizerProductDetailPage.module.css'

export function FertilizerProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('Dünger')
  const [detailRows, setDetailRows] = useState<Array<{ label: string; value: string }>>([])
  const [showStockActions, setShowStockActions] = useState(false)

  useEffect(() => {
    if (!productId || !isValidFertilizerInventoryItemRouteId(productId)) {
      setError(FERTILIZER_PRODUCT_DETAIL_NOT_FOUND_MESSAGE)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void fetchFertilizerProductStockRow(productId)
      .then((row) => {
        if (cancelled) {
          return
        }

        if (!row) {
          setError(FERTILIZER_PRODUCT_DETAIL_NOT_FOUND_MESSAGE)
          return
        }

        const resolved = resolveFertilizerProductDetailPageState({ productId, row })
        if (resolved.kind !== 'ready') {
          setError(resolved.message)
          return
        }

        setDetailRows(resolved.rows)
        setTitle(resolved.title)
        setShowStockActions(row.baseUnit === 'kg' || row.baseUnit === 'ml')
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'Die Produktdaten konnten nicht geladen werden.',
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
  }, [productId])

  const stockSection = useMemo(() => {
    if (loading) {
      return <p className={styles.panelMessage}>Produktdaten werden geladen…</p>
    }

    if (error) {
      return (
        <p className={styles.panelMessage} role="alert">
          {error}
        </p>
      )
    }

    if (detailRows.length === 0) {
      return (
        <p className={styles.panelMessage}>
          Für dieses Produkt sind noch keine bestätigten Angaben verfügbar.
        </p>
      )
    }

    return (
      <dl className={styles.optionalList}>
        {detailRows.map((row) => (
          <div key={row.label} className={styles.optionalRow}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    )
  }, [detailRows, error, loading])

  return (
    <HomeAppShell>
      <main className={styles.screen}>
        <SubpageHeader
          title={title}
          backTo={FERTILIZER_ROUTES.hub}
          backLabel="Zurück zu Meine Dünger"
        />

        {showStockActions && productId && !loading && !error && (
          <div className={styles.actions}>
            <Link className={styles.actionLink} to={fertilizerStockIntakePath(productId)}>
              Zugang erfassen
            </Link>
            <Link className={styles.actionLink} to={fertilizerStockOutboundPath(productId)}>
              Abgang erfassen
            </Link>
          </div>
        )}

        <section className={styles.section} aria-labelledby="fertilizer-product-info-heading">
          <h2 id="fertilizer-product-info-heading" className={styles.sectionHeading}>
            Produktinformationen
          </h2>
          <div className={styles.panel}>{stockSection}</div>
        </section>
      </main>
    </HomeAppShell>
  )
}
