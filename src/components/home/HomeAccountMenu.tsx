import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import styles from './HomeAccountMenu.module.css'

const PLACEHOLDER_ITEMS = [
  'Greenkeeper Pro',
  'Einstellungen',
  'Impressum',
  'Datenschutz',
] as const

function AccountIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.75" />
      <circle cx="12" cy="10" r="3" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M7 17.5c1.4-2.2 3.1-3.2 5-3.2s3.6 1 5 3.2"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function HomeAccountMenu() {
  const menuId = useId()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const { signOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      const target = event.target

      if (!(target instanceof Node) || !wrapperRef.current?.contains(target)) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.accountButton}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label="Konto-Menü"
        onClick={() => setOpen((current) => !current)}
      >
        <span className={styles.accountIcon} aria-hidden="true">
          <AccountIcon />
        </span>
      </button>

      {open && (
        <div id={menuId} className={styles.menu} role="menu">
          <Link
            to="/rasenflaechen"
            role="menuitem"
            className={styles.menuItem}
            onClick={() => setOpen(false)}
          >
            Meine Rasenflächen
          </Link>

          {PLACEHOLDER_ITEMS.map((label) => (
            <span key={label} role="menuitem" aria-disabled="true" className={styles.menuItemDisabled}>
              {label}
            </span>
          ))}

          <div className={styles.menuDivider} aria-hidden="true" />

          <button
            type="button"
            role="menuitem"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => {
              setOpen(false)
              void signOut()
              navigate('/')
            }}
          >
            Abmelden
          </button>
        </div>
      )}
    </div>
  )
}
