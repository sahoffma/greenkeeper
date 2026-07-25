import styles from './AuthLoadingScreen.module.css'

export function AuthLoadingScreen() {
  return (
    <div className="app-shell">
      <main className={`page page--home ${styles.screen}`} aria-busy="true" aria-live="polite">
        <p className={styles.message}>Greenkeeper wird geladen …</p>
      </main>
    </div>
  )
}
