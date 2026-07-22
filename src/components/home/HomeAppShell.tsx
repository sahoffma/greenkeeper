import type { ReactNode } from 'react'
import { BottomNavigation } from './BottomNavigation'

interface HomeAppShellProps {
  children: ReactNode
}

export function HomeAppShell({ children }: HomeAppShellProps) {
  return (
    <div className="app-shell">
      {children}
      <BottomNavigation />
    </div>
  )
}
