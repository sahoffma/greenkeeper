import { useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { getAreaById } from '../data/areas'
import { BottomNav } from './BottomNav'
import { PlusMenu } from './PlusMenu'
import type { PlusMenuAction } from '../types/area'

export function AreaShell() {
  const { areaId = '' } = useParams()
  const navigate = useNavigate()
  const area = getAreaById(areaId)
  const [plusOpen, setPlusOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

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

  if (!area.dashboard) {
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

  function handlePlusSelect(action: PlusMenuAction) {
    setPlusOpen(false)
    const label = {
      fertilization: 'Düngung',
      mowing: 'Mahd',
      watering: 'Bewässerung',
      care: 'Pflegemaßnahme',
      photo: 'Foto',
      observation: 'Beobachtung',
      note: 'Notiz',
      voice: 'Einfach erzählen',
    }[action]
    setNotice(`${label} – Erfassung folgt in einem späteren Meilenstein.`)
    window.setTimeout(() => setNotice(null), 3200)
  }

  return (
    <div className="app-shell">
      <main className="page">
        <button type="button" className="back-link" onClick={() => navigate('/')}>
          ← Meine Flächen
        </button>
        {notice && (
          <div className="surface-card" style={{ padding: '14px 16px', marginBottom: 16, color: 'var(--color-text-secondary)' }}>
            {notice}
          </div>
        )}
        <Outlet context={{ area }} />
      </main>
      <BottomNav areaId={area.id} onPlusClick={() => setPlusOpen(true)} />
      <PlusMenu
        open={plusOpen}
        onClose={() => setPlusOpen(false)}
        onSelect={handlePlusSelect}
      />
    </div>
  )
}
