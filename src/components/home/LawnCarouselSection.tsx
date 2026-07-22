import type { DummyLawnArea } from '../../data/homeDummyData'
import styles from './LawnCarouselSection.module.css'

interface LawnCarouselSectionProps {
  lawnAreas: DummyLawnArea[]
}

function getTrackClassName(count: number): string {
  if (count === 1) {
    return styles.trackSingle
  }

  if (count === 2) {
    return styles.trackPair
  }

  return styles.trackScroll
}

export function LawnCarouselSection({ lawnAreas }: LawnCarouselSectionProps) {
  if (lawnAreas.length === 0) {
    return null
  }

  const trackClassName = getTrackClassName(lawnAreas.length)

  return (
    <section className={styles.section} aria-label="Rasenflächen">
      <div className={trackClassName}>
        {lawnAreas.map((area) => (
          <article key={area.id} className={styles.card}>
            <div
              className={`${styles.image} ${styles[`image--${area.imageVariant}`]}`}
              role="img"
              aria-label={`Foto ${area.name}`}
            />

            <div className={styles.content}>
              <div className={styles.meta}>
                <h3 className={styles.name}>{area.name}</h3>
                <p className={styles.lastActivity}>{area.lastActivity}</p>
              </div>

              <button
                type="button"
                className={styles.micButton}
                aria-label={`Spracheingabe für ${area.name}`}
              >
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path
                    d="M12 14.5a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5.5a3 3 0 0 0 3 3Z"
                    fill="currentColor"
                  />
                  <path
                    d="M19 11.5a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.58A7 7 0 0 0 19 11.5Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
