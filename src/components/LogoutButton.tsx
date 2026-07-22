import { useAuth } from '../contexts/AuthContext'

interface LogoutButtonProps {
  className?: string
}

export function LogoutButton({ className }: LogoutButtonProps) {
  const { signOut } = useAuth()

  return (
    <button
      type="button"
      className={className ?? 'logout-button'}
      onClick={() => {
        void signOut()
      }}
    >
      Abmelden
    </button>
  )
}
