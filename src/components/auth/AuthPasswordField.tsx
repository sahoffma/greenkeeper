import { useId, useState } from 'react'
import styles from './AuthPasswordField.module.css'

interface AuthPasswordFieldProps {
  label: string
  value: string
  autoComplete?: string
  required?: boolean
  minLength?: number
  onChange: (value: string) => void
}

export function AuthPasswordField({
  label,
  value,
  autoComplete = 'new-password',
  required = true,
  minLength = 6,
  onChange,
}: AuthPasswordFieldProps) {
  const inputId = useId()
  const [visible, setVisible] = useState(false)

  return (
    <label className={styles.passwordField} htmlFor={inputId}>
      <span className={styles.label}>{label}</span>

      <div className={styles.inputWrap}>
        <input
          id={inputId}
          className={styles.input}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required={required}
          minLength={minLength}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />

        <button
          type="button"
          className={styles.toggle}
          aria-label={visible ? 'Passwort ausblenden' : 'Passwort anzeigen'}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          <span className={styles.icon} aria-hidden="true">
            {visible ? (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M3.27 4.27 2 5.54l2.73 2.73C2.66 9.66 1.36 11.2.5 12c1.54 2.04 4.53 5 7.5 5 1.34 0 2.6-.45 3.73-1.12l2.2 2.2 1.27-1.27L3.27 4.27ZM12 17c-2.97 0-5.96-2.96-7.5-5 .56-.75 1.36-1.68 2.3-2.53l1.57 1.57c-.18.45-.28.94-.28 1.46 0 2.21 1.79 4 4 4 .52 0 1.01-.1 1.46-.28l1.57 1.57C13.6 16.55 12.34 17 12 17Z"
                  fill="currentColor"
                />
                <path
                  d="M12 7c2.21 0 4 1.79 4 4 0 .52-.1 1.01-.28 1.46l2.06 2.06c1.05-1.01 1.95-2.2 2.72-3.52-1.54-2.04-4.53-5-7.5-5-.87 0-1.72.18-2.52.5l1.77 1.77c.24-.06.49-.1.75-.1Z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M12 5C7 5 2.73 8.11.5 12c2.23 3.89 6.5 7 11.5 7s9.27-3.11 11.5-7C21.27 8.11 17 5 12 5Zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z"
                  fill="currentColor"
                />
                <circle cx="12" cy="12" r="2.25" fill="currentColor" />
              </svg>
            )}
          </span>
        </button>
      </div>
    </label>
  )
}
