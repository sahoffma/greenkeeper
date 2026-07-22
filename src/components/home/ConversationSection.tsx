import { useEffect, useState } from 'react'
import { conversationPrompts } from '../../data/homeDummyData'
import styles from './ConversationSection.module.css'

export function ConversationSection() {
  const [promptIndex, setPromptIndex] = useState(0)

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPromptIndex((current) => (current + 1) % conversationPrompts.length)
    }, 4500)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  return (
    <section className={styles.section} aria-label="Mit Greenkeeper sprechen">
      <button type="button" className={styles.micButton} aria-label="Spracheingabe">
        <span className={styles.micIcon} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M12 14.5a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5.5a3 3 0 0 0 3 3Z"
              fill="currentColor"
            />
            <path
              d="M19 11.5a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-2.58A7 7 0 0 0 19 11.5Z"
              fill="currentColor"
            />
          </svg>
        </span>
      </button>

      <p className={styles.prompt} key={promptIndex} aria-live="polite">
        <span className={styles.promptBubble}>
          <span className={styles.promptIcon} aria-hidden="true">
            💬
          </span>
          <span className={styles.promptText}>{conversationPrompts[promptIndex]}</span>
        </span>
        <span className="visually-hidden">Beispiel für eine mögliche Eingabe</span>
      </p>
    </section>
  )
}
