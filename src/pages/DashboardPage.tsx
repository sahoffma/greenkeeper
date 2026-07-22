import { useOutletContext } from 'react-router-dom'
import type { AreaOutletContext } from '../types/area'
import styles from './DashboardPage.module.css'

function formatNutrient(value: number): string {
  return value.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function DashboardPage() {
  const { area } = useOutletContext<AreaOutletContext>()
  const dashboard = area.dashboard!

  return (
    <div className={styles.dashboard}>
      <header className={styles.hero}>
        <p className={styles.eyebrow}>Dashboard</p>
        <h1 className={styles.title}>{area.name}</h1>
        <p className={styles.size}>{area.sizeLabel}</p>

        <div className={styles.scoreRow}>
          <div className={styles.scoreCircle} aria-label={`Flächenzustand ${dashboard.score} von 100`}>
            <span className={styles.scoreValue}>{dashboard.score}</span>
            <span className={styles.scoreMax}>/100</span>
          </div>
          <div>
            <p className={styles.scoreLabel}>Flächenzustand</p>
            <p className={styles.status}>{dashboard.statusLabel}</p>
          </div>
        </div>
      </header>

      <section className={`surface-card ${styles.section}`} aria-labelledby="briefing-heading">
        <h2 id="briefing-heading" className={styles.sectionTitle}>
          Tagesbriefing
        </h2>
        <p className={styles.briefing}>{dashboard.briefing}</p>
      </section>

      <section className={`surface-card ${styles.section}`} aria-labelledby="fertilization-heading">
        <h2 id="fertilization-heading" className={styles.sectionTitle}>
          Letzte Düngung
        </h2>
        <div className={styles.fertilizationMeta}>
          <div>
            <span className="metric-label">Datum</span>
            <span className="metric-value">{dashboard.lastFertilization.date}</span>
          </div>
          <div>
            <span className="metric-label">Produkt</span>
            <span className="metric-value">{dashboard.lastFertilization.product}</span>
          </div>
        </div>
      </section>

      <section className={`surface-card ${styles.section}`} aria-labelledby="nutrients-heading">
        <h2 id="nutrients-heading" className={styles.sectionTitle}>
          Nährstoffbilanz 2026
        </h2>
        <div className="metric-grid">
          <div className="metric-item">
            <span className="metric-label">Stickstoff 2026</span>
            <span className="metric-value">
              {formatNutrient(dashboard.nutrients2026.nitrogen)} g/m²
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Phosphat P₂O₅ 2026</span>
            <span className="metric-value">
              {formatNutrient(dashboard.nutrients2026.phosphate)} g/m²
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Kalium K₂O 2026</span>
            <span className="metric-value">
              {formatNutrient(dashboard.nutrients2026.potassium)} g/m²
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Phosphor-Ziel</span>
            <span className="metric-value">
              {formatNutrient(dashboard.nutrients2026.phosphorusTarget)} g/m²
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}
