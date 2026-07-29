import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { clearFertilizerCaptureSavedReceipt } from '../../lib/fertilizerCaptureSession'
import { FERTILIZER_ROUTES } from '../../lib/fertilizerRoutes'

/** Löscht den Abschlusszustand nur bei Navigation weg von der Capture-Route — nicht bei Tabwechsel. */
export function FertilizerCaptureRouteLifecycle() {
  const location = useLocation()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const previousPathRef = useRef(location.pathname)

  useEffect(() => {
    const previousPath = previousPathRef.current

    if (
      previousPath === FERTILIZER_ROUTES.capture &&
      location.pathname !== FERTILIZER_ROUTES.capture
    ) {
      clearFertilizerCaptureSavedReceipt(userId)
    }

    previousPathRef.current = location.pathname
  }, [location.pathname, userId])

  return null
}
