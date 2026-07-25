import { saveSingleLawnOnboarding } from '../../lib/onboardingPersist'
import { useOnboardingFinish } from '../../hooks/useOnboardingFinish'
import { OnboardingAreaSizeForm } from './OnboardingAreaSizeForm'

export function OnboardingSingleAreaSizePage() {
  const { finish, submitError, isSubmitting } = useOnboardingFinish()

  async function completeOnboarding(size: string | null) {
    await finish(async () => {
      await saveSingleLawnOnboarding(size ? Number(size.trim()) : null)
    })
  }

  return (
    <OnboardingAreaSizeForm
      title="Wie groß ist deine Rasenfläche?"
      isFinalStep
      submitError={submitError}
      isSubmitting={isSubmitting}
      onSubmit={completeOnboarding}
    />
  )
}
