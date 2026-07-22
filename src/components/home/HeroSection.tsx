import styles from './HeroSection.module.css'

export function HeroSection() {
  return (
    <section className={styles.hero} aria-label="Mein Garten">
      {/* TODO: Gesamten Hero-Bereich antippbar machen (Foto-Upload) */}
      <button type="button" className={styles.heroSurface}>
        <div className={styles.image} role="img" aria-label="Gartenfoto Platzhalter" />
        <div className={styles.overlay}>
          <p className={styles.title}>Füge ein Foto deines Gartens hinzu</p>
          <p className={styles.hint}>
            Dieses Foto begrüßt dich jedes Mal beim Öffnen von Greenkeeper.
          </p>
        </div>
      </button>
    </section>
  )
}
