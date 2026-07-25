import { FormEvent, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  buildLawnCountStepUrl,
  buildMultipleCareStepUrl,
  buildSingleAreaSizeStepUrl,
  isValidCustomMultipleLawnCount,
  MULTIPLE_LAWN_COUNT_VALIDATION_MESSAGE,
  parseOnboardingLawnCount,
} from '../../lib/onboardingFlow'
import layoutStyles from './onboardingScreen.module.css'
import themeStyles from './onboardingTheme.module.css'
import styles from './OnboardingLawnAreasPage.module.css'

const fixedCountOptions = [
  { value: 1, label: '1 Rasenfläche' },
  { value: 2, label: '2 Rasenflächen' },
  { value: 3, label: '3 Rasenflächen' },
] as const

export function OnboardingLawnAreasPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedCount = parseOnboardingLawnCount(searchParams.get('count'))
  const [customMode, setCustomMode] = useState(selectedCount !== null && selectedCount >= 4)
  const [customCount, setCustomCount] = useState(
    selectedCount !== null && selectedCount >= 4 ? String(selectedCount) : '',
  )
  const [showValidation, setShowValidation] = useState(false)

  const customCountIsValid = isValidCustomMultipleLawnCount(customCount)

  const selectedFixedCount = useMemo(() => {
    if (selectedCount === 1 || selectedCount === 2 || selectedCount === 3) {
      return selectedCount
    }

    return null
  }, [selectedCount])

  function handleSingleLawnSelect() {
    navigate(buildSingleAreaSizeStepUrl())
  }

  function handleMultipleLawnSelect(count: number) {
    navigate(buildLawnCountStepUrl(count), { replace: true })
    navigate(buildMultipleCareStepUrl(count))
  }

  function handleFixedCountSelect(count: 1 | 2 | 3) {
    if (count === 1) {
      navigate(buildLawnCountStepUrl(1), { replace: true })
      handleSingleLawnSelect()
      return
    }

    handleMultipleLawnSelect(count)
  }

  function handleMoreThanThreeSelect() {
    setCustomMode(true)
    setShowValidation(false)

    if (selectedCount !== null && selectedCount >= 4) {
      setCustomCount(String(selectedCount))
    }
  }

  function handleCustomSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!customCountIsValid) {
      setShowValidation(true)
      return
    }

    const count = Number(customCount.trim())
    handleMultipleLawnSelect(count)
  }

  function handleCustomInputChange(value: string) {
    setCustomCount(value.replace(/\D/g, ''))
    setShowValidation(false)
  }

  return (
    <div className={`app-shell ${themeStyles.shell}`}>
      <main className={`${layoutStyles.screen} ${themeStyles.screen}`}>
        <div className={`${layoutStyles.content} ${themeStyles.content} ${styles.content}`}>
          <h1 className={`${themeStyles.title} ${styles.title}`}>
            Wie viele Rasenflächen hat dein Garten?
          </h1>

          <div className={styles.options} role="group" aria-label="Anzahl Rasenflächen">
            {fixedCountOptions.map((option) => {
              const isSelected = selectedFixedCount === option.value

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`${styles.optionCard} ${styles.compactCard} ${isSelected ? styles.optionCardSelected : ''}`}
                  onClick={() => handleFixedCountSelect(option.value)}
                  aria-pressed={isSelected}
                >
                  <span className={styles.optionTitle}>{option.label}</span>
                  <span className={styles.optionChevron} aria-hidden="true">
                    ›
                  </span>
                </button>
              )
            })}

            <button
              type="button"
              className={`${styles.optionCard} ${styles.compactCard} ${customMode || (selectedCount !== null && selectedCount >= 4) ? styles.optionCardSelected : ''}`}
              onClick={handleMoreThanThreeSelect}
              aria-pressed={customMode || (selectedCount !== null && selectedCount >= 4)}
              aria-expanded={customMode}
            >
              <span className={styles.optionTitle}>Mehr als 3</span>
              <span className={styles.optionChevron} aria-hidden="true">
                ›
              </span>
            </button>
          </div>

          {customMode && (
            <form className={styles.customCountSection} onSubmit={handleCustomSubmit}>
              <div className={styles.customCountField}>
                <input
                  className={styles.customCountInput}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="off"
                  enterKeyHint="done"
                  value={customCount}
                  onChange={(event) => handleCustomInputChange(event.target.value)}
                  aria-label="Anzahl der Rasenflächen"
                  placeholder="4"
                />
              </div>

              {((showValidation && !customCountIsValid) ||
                (customCount.length > 0 && !customCountIsValid)) && (
                <p className={styles.validationMessage} role="status">
                  {MULTIPLE_LAWN_COUNT_VALIDATION_MESSAGE}
                </p>
              )}

              <div className={styles.footer}>
                <button
                  type="submit"
                  className={layoutStyles.primaryButton}
                  disabled={!customCountIsValid}
                >
                  Weiter
                </button>
              </div>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}
