import { useAuth } from '../contexts/AuthContext'
import { LogoutButton } from '../components/LogoutButton'

export function MorePage() {
  const { user } = useAuth()

  return (
    <div className="surface-card placeholder-panel" style={{ textAlign: 'left' }}>
      <h1 style={{ marginTop: 0, letterSpacing: '-0.03em' }}>Mehr</h1>
      <p style={{ marginBottom: 'var(--space-lg)' }}>
        Dieser Bereich ist im ersten Meilenstein noch nicht umgesetzt.
      </p>

      {user?.email && (
        <p style={{ marginBottom: 'var(--space-md)', color: 'var(--color-text-secondary)' }}>
          Angemeldet als {user.email}
        </p>
      )}

      <LogoutButton />
    </div>
  )
}
