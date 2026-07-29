import { NavLink } from 'react-router-dom'
import styles from './BottomNavigation.module.css'

const tabs = [
  { id: 'home', label: 'Home', path: '/', icon: '🏠', end: true },
  { id: 'journal', label: 'Journal', path: '/journal', icon: '📖' },
  { id: 'greenkeeper', label: 'Greenkeeper', path: '/greenkeeper', icon: '🌱' },
  { id: 'equipment', label: 'Ausrüstung', path: '/ausruestung', icon: '🧰' },
] as const

export function BottomNavigation() {
  return (
    <nav className={styles.nav} aria-label="Hauptnavigation">
      <div className={styles.inner}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.path}
            end={'end' in tab ? tab.end : false}
            className={({ isActive }) => [styles.tab, isActive ? styles.tabActive : ''].filter(Boolean).join(' ')}
          >
            <span className={styles.icon} aria-hidden="true">
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
