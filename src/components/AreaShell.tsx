import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { fetchAreaById } from '../lib/areas'
import { BottomNav } from './BottomNav'
import type { Area } from '../types/area'

export function AreaShell() {
  const { areaId = '' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [area, setArea] = useState<Area | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isNewActivityPage = location.pathname.endsWith('/new')
  const isEditActivityPage = /\/edit\/[^/]+$/.test(location.pathname)
  const isFormPage = isNewActivityPage || isEditActivityPage

  const loadArea = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const data = await fetchAreaById(areaId)
      setArea(data)
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Fläche konnte nicht geladen werden.'
      setError(message)
      setArea(null)
    } finally {
      setLoading(false)
    }
  }, [areaId])

  useEffect(() => {
    let cancelled = false

    async function initialLoad() {
      await loadArea()
      if (cancelled) {
        return
      }
    }

    void initialLoad()

    return () => {
      cancelled = true
    }
  }, [loadArea])

  useEffect(() => {
    const state = location.state

    if (
      typeof state === 'object' &&
      state !== null &&
      'notice' in state &&
      typeof state.notice === 'string'
    ) {
      setNotice(state.notice)
      window.setTimeout(() => setNotice(null), 3200)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location.pathname, location.state, navigate])

  const refreshArea = useCallback(async () => {
    try {
      const data = await fetchAreaById(areaId)
      setArea(data)
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : 'Fläche konnte nicht aktualisiert werden.'
      setError(message)
    }
  }, [areaId])

  if (loading) {
    return (
      <div className="app-shell">
        <main className="page">
          <button type="button" className="back-link" onClick={() => navigate('/')}>
            ← Meine Flächen
          </button>
          <p style={{ color: 'var(--color-text-secondary)' }}>Fläche wird geladen …</p>
        </main>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-shell">
        <main className="page">
          <button type="button" className="back-link" onClick={() => navigate('/')}>
            ← Meine Flächen
          </button>
          <div className="surface-card placeholder-panel">
            <p>{error}</p>
          </div>
        </main>
      </div>
    )
  }

  if (!area) {
    return (
      <div className="app-shell">
        <main className="page">
          <button type="button" className="back-link" onClick={() => navigate('/')}>
            ← Meine Flächen
          </button>
          <div className="surface-card placeholder-panel">
            <p>Diese Fläche ist noch nicht verfügbar.</p>
          </div>
        </main>
      </div>
    )
  }

  if (!area.dashboard && !isFormPage) {
    return (
      <div className="app-shell">
        <main className="page">
          <button type="button" className="back-link" onClick={() => navigate('/')}>
            ← Meine Flächen
          </button>
          <div className="surface-card placeholder-panel">
            <h1 style={{ marginTop: 0 }}>{area.name}</h1>
            <p>{area.sizeLabel}</p>
            <p>Das Dashboard für diese Fläche folgt in einem späteren Meilenstein.</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <main className="page">
        <button type="button" className="back-link" onClick={() => navigate('/')}>
          ← Meine Flächen
        </button>
        {notice && (
          <div
            className="surface-card"
            style={{
              padding: '14px 16px',
              marginBottom: 16,
              color: 'var(--color-text-secondary)',
            }}
          >
            {notice}
          </div>
        )}
        <Outlet context={{ area, refreshArea }} />
      </main>
      {!isFormPage && (
        <BottomNav
          areaId={area.id}
          onPlusClick={() => navigate(`/area/${area.id}/new`)}
        />
      )}
    </div>
  )
}
