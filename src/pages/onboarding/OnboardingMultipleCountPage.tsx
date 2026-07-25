import { Navigate, useSearchParams } from 'react-router-dom'
import { resolveLegacyCountRoute } from '../../lib/onboardingFlow'

export function OnboardingMultipleCountPage() {
  const [searchParams] = useSearchParams()

  return <Navigate to={resolveLegacyCountRoute(searchParams)} replace />
}
