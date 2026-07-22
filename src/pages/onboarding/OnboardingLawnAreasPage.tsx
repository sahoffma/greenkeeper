import { useNavigate } from 'react-router-dom'
import { LawnAreaOptionIcon, type LawnAreaIconVariant } from './LawnAreaOptionIcons'
import layoutStyles from './onboardingScreen.module.css'
import themeStyles from './onboardingTheme.module.css'
import styles from './OnboardingLawnAreasPage.module.css'

type LawnAreaChoice = LawnAreaIconVariant

const options: {
  id: LawnAreaChoice
  title: string
  description: string
}[] = [
  {
    id: 'single',
    title: 'Eine Rasenfläche',
    description: 'Mein Garten hat eine zusammenhängende Rasenfläche.',
  },
  {
    id: 'multiple',
    title: 'Mehrere Rasenflächen',
    description: 'Mein Garten hat mehrere getrennte Rasenflächen.',
  },
]

export function OnboardingLawnAreasPage() {
  const navigate = useNavigate()

  function handleSelect(choice: LawnAreaChoice) {
    navigate(`/onboarding/3?areas=${choice}`)
  }

  return (
    <div className={`app-shell ${themeStyles.shell}`}>
      <main className={`${layoutStyles.screen} ${themeStyles.screen}`}>
        <div className={`${layoutStyles.content} ${themeStyles.content} ${styles.content}`}>
          <h1 className={`${themeStyles.title} ${styles.title}`}>
            Wie viele Rasenflächen hat dein Garten?
          </h1>

          <div className={styles.options} role="group" aria-label="Anzahl Rasenflächen">
            {options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={styles.optionCard}
                onClick={() => handleSelect(option.id)}
              >
                <LawnAreaOptionIcon variant={option.id} className={styles.optionIcon} />
                <span className={styles.optionTitle}>{option.title}</span>
                <span className={styles.optionDescription}>{option.description}</span>
                <span className={styles.optionChevron} aria-hidden="true">
                  ›
                </span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
