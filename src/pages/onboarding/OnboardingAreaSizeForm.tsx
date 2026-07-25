import { FormEvent, useRef, useState } from 'react'
import { getOnboardingSubmitLabel } from '../../lib/onboardingPersist'
import layoutStyles from './onboardingScreen.module.css'
import themeStyles from './onboardingTheme.module.css'
import styles from './OnboardingSingleAreaSizePage.module.css'

function HintInfoIcon() {
  return (
    <svg
      className={styles.hintIcon}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="6.25" r="0.9" fill="currentColor" />
    </svg>
  )
}

export interface OnboardingAreaSizeFormProps {
  title: string
  description?: string
  progressLabel?: string
  initialSize?: string
  isFinalStep?: boolean
  completionHint?: string
  submitError?: string | null
  isSubmitting?: boolean
  onSubmit: (size: string | null) => void | Promise<void>
  onBack?: () => void
}

export function isValidOnboardingAreaSize(value: string): boolean {
  const trimmed = value.trim()

  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return false
  }

  return Number(trimmed) > 0
}

export function OnboardingAreaSizeForm({
  title,
  description = 'Gib die Größe deiner Rasenfläche in Quadratmetern an.',
  progressLabel,
  initialSize = '',
  isFinalStep = false,
  completionHint,
  submitError = null,
  isSubmitting = false,
  onSubmit,
  onBack,
}: OnboardingAreaSizeFormProps) {
  const footerRef = useRef<HTMLDivElement>(null)
  const [areaSize, setAreaSize] = useState(initialSize)
  const isValid = isValidOnboardingAreaSize(areaSize)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isValid || isSubmitting) {
      return
    }

    void onSubmit(areaSize)
  }

  function handleSkipSize() {
    if (isSubmitting) {
      return
    }

    void onSubmit(null)
  }

  function handleInputChange(value: string) {
    setAreaSize(value.replace(/\D/g, ''))
  }

  function handleInputFocus() {
    window.setTimeout(() => {
      footerRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }, 300)
  }

  return (
    <div className={`app-shell ${themeStyles.shell}`}>
      <main className={`${layoutStyles.screen} ${themeStyles.screen}`}>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={`${layoutStyles.content} ${themeStyles.content} ${styles.content}`}>
            {onBack && (
              <button type="button" className="back-link" onClick={onBack}>
                ← Zurück
              </button>
            )}

            {progressLabel && <p className={styles.progressLabel}>{progressLabel}</p>}

            <h1 className={`${themeStyles.title} ${styles.title}`}>{title}</h1>
            <p className={`${themeStyles.description} ${styles.description}`}>{description}</p>

            <div className={styles.sizeFieldWrap}>
              <div className={styles.sizeField}>
                <div className={styles.sizeValueGroup}>
                  <div className={styles.sizeInputWrap}>
                    {areaSize === '' && (
                      <span className={styles.sizePlaceholder} aria-hidden="true">
                        50
                      </span>
                    )}
                    <input
                      className={styles.sizeInput}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="off"
                      enterKeyHint="done"
                      value={areaSize}
                      size={Math.max(2, areaSize.length || 2)}
                      onChange={(event) => handleInputChange(event.target.value)}
                      onFocus={handleInputFocus}
                      aria-label="Größe der Rasenfläche in Quadratmetern"
                    />
                  </div>
                  <span className={styles.unit} aria-hidden="true">
                    m²
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.hint}>
              <HintInfoIcon />
              <p className={styles.hintText}>
                Größe unbekannt? Mit einer Flächenmessungs-App lässt sich die Rasenfläche einfach
                bestimmen.
              </p>
            </div>
          </div>

          <div ref={footerRef} className={styles.footerDock}>
            <div className={`${layoutStyles.footer} ${themeStyles.footer} ${styles.footer}`}>
              {completionHint && (
                <p className={styles.completionHint} role="status">
                  {completionHint}
                </p>
              )}

              {submitError && (
                <p className={styles.submitError} role="alert">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                className={layoutStyles.primaryButton}
                disabled={!isValid || isSubmitting}
              >
                {getOnboardingSubmitLabel(isFinalStep)}
              </button>
              <button
                type="button"
                className={styles.skipLink}
                onClick={handleSkipSize}
                disabled={isSubmitting}
              >
                Später eingeben
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}
