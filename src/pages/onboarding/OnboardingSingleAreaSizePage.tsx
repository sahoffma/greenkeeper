import { FormEvent, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import layoutStyles from './onboardingScreen.module.css'
import themeStyles from './onboardingTheme.module.css'
import styles from './OnboardingSingleAreaSizePage.module.css'

function isValidAreaSize(value: string): boolean {
  const trimmed = value.trim()

  if (!trimmed || !/^\d+$/.test(trimmed)) {
    return false
  }

  return Number(trimmed) > 0
}

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

export function OnboardingSingleAreaSizePage() {
  const navigate = useNavigate()
  const footerRef = useRef<HTMLDivElement>(null)
  const [areaSize, setAreaSize] = useState('')
  const isValid = isValidAreaSize(areaSize)

  function goToNextStep(size: string | null) {
    if (size) {
      navigate(`/onboarding/4?areas=single&size=${encodeURIComponent(size.trim())}`)
      return
    }

    navigate('/onboarding/4?areas=single')
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!isValid) {
      return
    }

    goToNextStep(areaSize)
  }

  function handleSkipSize() {
    goToNextStep(null)
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
            <h1 className={`${themeStyles.title} ${styles.title}`}>
              Wie groß ist deine Rasenfläche?
            </h1>
            <p className={`${themeStyles.description} ${styles.description}`}>
              Gib die Größe deiner Rasenfläche in Quadratmetern an.
            </p>

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
              <button
                type="submit"
                className={layoutStyles.primaryButton}
                disabled={!isValid}
              >
                Weiter
              </button>
              <button type="button" className={styles.skipLink} onClick={handleSkipSize}>
                Später eingeben
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  )
}
