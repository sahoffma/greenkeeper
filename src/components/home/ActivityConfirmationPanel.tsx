import styles from './ActivityConfirmationPanel.module.css'

export interface ConfirmationRow {
  label: string
  value: string
}

interface ActivityConfirmationPanelProps {
  rows: ConfirmationRow[]
  warnings?: string[]
  submitting?: boolean
  onConfirm: () => void
  onEdit: () => void
  onDiscard: () => void
}

export function ActivityConfirmationPanel({
  rows,
  warnings = [],
  submitting = false,
  onConfirm,
  onEdit,
  onDiscard,
}: ActivityConfirmationPanelProps) {
  return (
    <section className={styles.panel} aria-labelledby="home-confirmation-heading">
      <h2 id="home-confirmation-heading" className={styles.title}>
        Ich habe Folgendes verstanden
      </h2>

      <dl className={styles.list}>
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>

      {warnings.length > 0 && (
        <ul className={styles.warnings}>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.primaryAction}
          disabled={submitting}
          onClick={onConfirm}
        >
          {submitting ? 'Bitte warten …' : 'Eintragen'}
        </button>

        <div className={styles.secondaryActions}>
          <button type="button" className={styles.secondaryAction} disabled={submitting} onClick={onEdit}>
            Bearbeiten
          </button>
          <button type="button" className={styles.secondaryAction} disabled={submitting} onClick={onDiscard}>
            Verwerfen
          </button>
        </div>
      </div>
    </section>
  )
}
