import { NavLink } from 'react-router-dom'
import styles from './BottomNavigation.module.css'

const tabs = [
  { id: 'journal', label: 'Journal', path: '/journal', icon: '📖' },
  { id: 'home', label: 'Greenkeeper', path: '/', icon: '🌱', featured: true },
  { id: 'garden', label: 'Garten', path: '/garten', icon: '🌿' },
] as const

export function BottomNavigation() {
  return (
    <nav className={styles.nav} aria-label="Hauptnavigation">
      <div className={styles.inner}>
        {tabs.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.path}
            end={tab.path === '/'}
            className={({ isActive }) =>
              [
                styles.tab,
                'featured' in tab && tab.featured ? styles.tabFeatured : '',
                isActive ? styles.tabActive : '',
              ]
                .filter(Boolean)
                .join(' ')
            }
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
