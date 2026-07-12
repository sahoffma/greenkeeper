import { plusMenuItems } from '../data/areas'
import type { PlusMenuAction } from '../types/area'
import styles from './PlusMenu.module.css'

interface PlusMenuProps {
  open: boolean
  onClose: () => void
  onSelect: (action: PlusMenuAction) => void
}

export function PlusMenu({ open, onClose, onSelect }: PlusMenuProps) {
  if (!open) return null

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plus-menu-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className={styles.handle} aria-hidden="true" />
        <h2 id="plus-menu-title" className={styles.title}>
          Neue Eintragung
        </h2>
        <p className={styles.subtitle}>
          Wähle eine Kategorie. Die Erfassung folgt in einem späteren Meilenstein.
        </p>

        <div className={styles.grid}>
          {plusMenuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.item}
              onClick={() => onSelect(item.id)}
            >
              <span className={styles.itemIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <button type="button" className={styles.cancel} onClick={onClose}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}
