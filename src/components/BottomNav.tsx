import { NavLink } from 'react-router-dom'
import type { NavTab } from '../types/area'
import styles from './BottomNav.module.css'

interface BottomNavProps {
  areaId: string
  onPlusClick: () => void
}

const tabs: { id: NavTab; label: string; path: string }[] = [
  { id: 'dashboard', label: 'Dashboard', path: '' },
  { id: 'timeline', label: 'Timeline', path: 'timeline' },
  { id: 'assistant', label: 'Assistent', path: 'assistant' },
  { id: 'more', label: 'Mehr', path: 'more' },
]

export function BottomNav({ areaId, onPlusClick }: BottomNavProps) {
  const basePath = `/area/${areaId}`

  return (
    <nav className={styles.nav} aria-label="Hauptnavigation">
      <div className={styles.inner}>
        {tabs.slice(0, 2).map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.path ? `${basePath}/${tab.path}` : basePath}
            end={tab.path === ''}
            className={({ isActive }) =>
              `${styles.tab} ${isActive ? styles.tabActive : ''}`
            }
          >
            <span className={styles.icon} aria-hidden="true">
              {tab.id === 'dashboard' ? '▦' : '◷'}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}

        <button
          type="button"
          className={styles.plusButton}
          aria-label="Neue Maßnahme"
          onClick={onPlusClick}
        >
          +
        </button>

        {tabs.slice(2).map((tab) => (
          <NavLink
            key={tab.id}
            to={`${basePath}/${tab.path}`}
            className={({ isActive }) =>
              `${styles.tab} ${isActive ? styles.tabActive : ''}`
            }
          >
            <span className={styles.icon} aria-hidden="true">
              {tab.id === 'assistant' ? '◌' : '⋯'}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
