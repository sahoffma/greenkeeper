import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  GREENKEEPER_HOME_ROUTE,
  ONBOARDING_SAVE_ERROR_MESSAGE,
} from '../lib/onboardingPersist'
import { useAuth } from '../contexts/AuthContext'

export function useOnboardingFinish() {
  const navigate = useNavigate()
  const { refreshProfile } = useAuth()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function finish(save: () => Promise<unknown>) {
    if (isSubmitting) {
      return
    }

    setSubmitError(null)
    setIsSubmitting(true)

    try {
      await save()
      await refreshProfile()
      navigate(GREENKEEPER_HOME_ROUTE)
    } catch (error) {
      if (error instanceof Error && error.message === 'ONBOARDING_ALREADY_COMPLETED') {
        await refreshProfile()
        navigate(GREENKEEPER_HOME_ROUTE)
        return
      }

      setSubmitError(ONBOARDING_SAVE_ERROR_MESSAGE)
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    finish,
    submitError,
    isSubmitting,
  }
}
