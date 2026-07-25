import { Navigate, useSearchParams } from 'react-router-dom'
import { parseLawnAreaCount } from '../../lib/onboardingFlow'
import { OnboardingMultipleSizePage } from './OnboardingMultipleSizePage'
import { OnboardingSingleAreaSizePage } from './OnboardingSingleAreaSizePage'

export function OnboardingStep3Page() {
  const [searchParams] = useSearchParams()
  const areas = parseLawnAreaCount(searchParams.get('areas'))

  if (areas === 'single') {
    return <OnboardingSingleAreaSizePage />
  }

  if (areas === 'multiple') {
    return <OnboardingMultipleSizePage />
  }

  return <Navigate to="/onboarding/2" replace />
}
