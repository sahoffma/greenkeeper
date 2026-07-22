import { useEffect, useState } from 'react'
import { AreaCard } from '../components/AreaCard'
import { LogoutButton } from '../components/LogoutButton'
import { fetchAreas } from '../lib/areas'
import { getErrorMessage } from '../lib/errors'
import type { Area } from '../types/area'

export function AreasPage() {
  const [areas, setAreas] = useState<Area[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAreas() {
      setLoading(true)
      setError(null)

      try {
        const data = await fetchAreas()

        if (cancelled) {
          return
        }

        setAreas(data)
        setError(null)
      } catch (loadError) {
        if (cancelled) {
          return
        }

        setAreas([])
        setError(getErrorMessage(loadError, 'Flächen konnten nicht geladen werden.'))
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadAreas()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="app-shell">
      <main className="page page--home">
        <header className="page-header">
          <div className="page-header-row">
            <div>
              <h1 className="page-title">Greenkeeper</h1>
              <p className="page-subtitle">Meine Flächen</p>
            </div>
            <LogoutButton />
          </div>
        </header>

        <section aria-labelledby="areas-heading">
          <h2 id="areas-heading" className="section-title">
            Flächen
          </h2>

          {loading && (
            <p style={{ color: 'var(--color-text-secondary)' }}>Flächen werden geladen …</p>
          )}

          {error && (
            <div className="surface-card" style={{ padding: '16px', color: 'var(--color-text-secondary)' }}>
              {error}
            </div>
          )}

          {!loading && !error && areas.length === 0 && (
            <div className="surface-card" style={{ padding: '16px', color: 'var(--color-text-secondary)' }}>
              Noch keine Flächen vorhanden.
            </div>
          )}

          {!loading && !error && areas.length > 0 && (
            <div className="card-grid">
              {areas.map((area) => (
                <AreaCard key={area.id} area={area} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
