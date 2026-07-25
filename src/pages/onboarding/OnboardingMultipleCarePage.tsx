import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import {
  buildCareSelectionNavigation,
  buildLawnCountStepUrl,
  parseLawnCarePreference,
  parseMultipleLawnCount,
  type LawnCarePreference,
} from '../../lib/onboardingFlow'
import { LawnCareOptionIcon } from './LawnCareOptionIcons'
import cardStyles from './OnboardingLawnAreasPage.module.css'
import layoutStyles from './onboardingScreen.module.css'
import themeStyles from './onboardingTheme.module.css'
import styles from './OnboardingMultipleCarePage.module.css'

const options: {
  id: LawnCarePreference
  title: string
  description: string
}[] = [
  {
    id: 'together',
    title: 'Meistens gemeinsam',
    description:
      'Sinnvoll, wenn du deine Rasenflächen in der Regel gleichzeitig mähst, bewässerst und pflegst.',
  },
  {
    id: 'separate',
    title: 'Lieber einzeln',
    description:
      'Sinnvoll, wenn du bei deinen Rasenflächen unterschiedliche Bedingungen und Pflegebedürfnisse berücksichtigen möchtest.',
  },
]

export function OnboardingMultipleCarePage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const selectedCare = parseLawnCarePreference(searchParams.get('care'))
  const count = parseMultipleLawnCount(searchParams.get('count'))

  if (!count) {
    return <Navigate to="/onboarding/2" replace />
  }

  const lawnCount = count

  function handleSelect(preference: LawnCarePreference) {
    const { careStepUrl, nextStepUrl } = buildCareSelectionNavigation(preference, lawnCount)
    navigate(careStepUrl, { replace: true })
    navigate(nextStepUrl)
  }

  function handleBack() {
    navigate(buildLawnCountStepUrl(lawnCount))
  }

  return (
    <div className={`app-shell ${themeStyles.shell}`}>
      <main className={`${layoutStyles.screen} ${themeStyles.screen}`}>
        <div className={`${layoutStyles.content} ${themeStyles.content} ${styles.content}`}>
          <div className={styles.header}>
            <button type="button" className="back-link" onClick={handleBack}>
              ← Zurück
            </button>
          </div>

          <h1 className={`${themeStyles.title} ${styles.title}`}>
            Wie pflegst du deine Rasenflächen?
          </h1>

          <div className={styles.options} role="group" aria-label="Pflege deiner Rasenflächen">
            {options.map((option) => {
              const isSelected = selectedCare === option.id

              return (
                <button
                  key={option.id}
                  type="button"
                  className={`${cardStyles.optionCard} ${isSelected ? cardStyles.optionCardSelected : ''}`}
                  onClick={() => handleSelect(option.id)}
                  aria-pressed={isSelected}
                  aria-label={`${option.title}. ${option.description}`}
                >
                  <LawnCareOptionIcon variant={option.id} className={cardStyles.optionIcon} />
                  <span className={cardStyles.optionTitle}>{option.title}</span>
                  <span className={cardStyles.optionDescription}>{option.description}</span>
                  <span className={cardStyles.optionChevron} aria-hidden="true">
                    ›
                  </span>
                </button>
              )
            })}
          </div>

          <p className={styles.hint}>Du kannst das später jederzeit ändern.</p>
        </div>
      </main>
    </div>
  )
}
