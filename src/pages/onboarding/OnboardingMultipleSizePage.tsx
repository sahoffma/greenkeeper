import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import {
  getMultipleSizeHeadline,
  getMultipleSizeProgressLabel,
  parseLawnCarePreference,
  parseMultipleLawnCount,
  parseMultipleLawnIndex,
  readMultipleLawnNames,
  readMultipleLawnSizes,
  resolveMultipleSizeBackUrl,
  resolveMultipleSizeNavigation,
} from '../../lib/onboardingFlow'
import { useOnboardingFinish } from '../../hooks/useOnboardingFinish'
import {
  isLastMultipleSizeStep,
  saveMultipleLawnOnboarding,
} from '../../lib/onboardingPersist'
import { OnboardingAreaSizeForm } from './OnboardingAreaSizeForm'

export function OnboardingMultipleSizePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { finish, submitError, isSubmitting } = useOnboardingFinish()
  const care = parseLawnCarePreference(searchParams.get('care'))
  const count = parseMultipleLawnCount(searchParams.get('count'))
  const index = parseMultipleLawnIndex(searchParams.get('index'))

  if (!care || !count || !index || index > count) {
    return <Navigate to="/onboarding/2" replace />
  }

  const carePreference = care
  const lawnCount = count
  const lawnIndex = index
  const isFinalStep = isLastMultipleSizeStep(lawnIndex, lawnCount)

  const names = readMultipleLawnNames(searchParams, lawnCount)
  const sizes = readMultipleLawnSizes(searchParams, lawnCount)
  const currentName = names[lawnIndex - 1]
  const currentSize = sizes[lawnIndex - 1]
  const initialSize = currentSize !== null ? String(currentSize) : ''

  async function handleSubmit(size: string | null) {
    const nextSize = size ? Number(size.trim()) : null
    const nextSizes = [...sizes]
    nextSizes[lawnIndex - 1] = nextSize

    if (!isFinalStep) {
      navigate(
        resolveMultipleSizeNavigation({
          care: carePreference,
          count: lawnCount,
          names,
          sizes,
          index: lawnIndex,
          nextSize,
        }),
      )
      return
    }

    await finish(async () => {
      await saveMultipleLawnOnboarding({
        names,
        sizes: nextSizes,
        carePreference: carePreference,
      })
    })
  }

  function handleBack() {
    navigate(
      resolveMultipleSizeBackUrl({
        care: carePreference,
        count: lawnCount,
        names,
        sizes,
        index: lawnIndex,
      }),
    )
  }

  return (
    <OnboardingAreaSizeForm
      key={`multiple-size-${lawnIndex}`}
      title={getMultipleSizeHeadline(lawnIndex)}
      progressLabel={getMultipleSizeProgressLabel(lawnIndex, lawnCount, currentName)}
      initialSize={initialSize}
      isFinalStep={isFinalStep}
      submitError={submitError}
      isSubmitting={isSubmitting}
      onSubmit={handleSubmit}
      onBack={handleBack}
    />
  )
}
