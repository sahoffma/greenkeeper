import { useParams } from 'react-router-dom'
import { HomeAppShell } from '../components/home/HomeAppShell'
import { SubpageHeader } from '../components/layout/SubpageHeader'
import { FERTILIZER_ROUTES } from '../lib/fertilizerRoutes'
import styles from './FertilizerProductDetailPage.module.css'

export function FertilizerProductDetailPage() {
  const { productId } = useParams<{ productId: string }>()

  return (
    <HomeAppShell>
      <main className={styles.screen}>
        <SubpageHeader
          title="Dünger"
          backTo={FERTILIZER_ROUTES.hub}
          backLabel="Zurück zu Dünger"
        />

        <div className={styles.placeholderId} aria-hidden="true">
          {productId}
        </div>

        <section className={styles.section} aria-labelledby="fertilizer-stock-detail-heading">
          <h2 id="fertilizer-stock-detail-heading" className={styles.sectionHeading}>
            Dein Bestand
          </h2>
          <div className={styles.panel}>
            <p className={styles.panelMessage}>
              Gebinde, Restmengen und Bewegungen werden hier angezeigt, sobald die
              Inventarführung angebunden ist.
            </p>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="fertilizer-optional-heading">
          <h2 id="fertilizer-optional-heading" className={styles.sectionHeading}>
            Weitere Angaben
          </h2>
          <div className={styles.panel}>
            <p className={styles.panelLead}>
              Hier kannst Du später optionale Informationen ergänzen — ohne die
              Bestandserfassung erneut zu starten.
            </p>
            <dl className={styles.optionalList}>
              <div className={styles.optionalRow}>
                <dt>Gebindegröße</dt>
                <dd>Noch nicht hinterlegt</dd>
              </div>
              <div className={styles.optionalRow}>
                <dt>Anzahl</dt>
                <dd>Noch nicht hinterlegt</dd>
              </div>
              <div className={styles.optionalRow}>
                <dt>Herkunft</dt>
                <dd>Gekauft, geschenkt oder übernommen</dd>
              </div>
              <div className={styles.optionalRow}>
                <dt>Kaufdatum</dt>
                <dd>Noch nicht hinterlegt</dd>
              </div>
              <div className={styles.optionalRow}>
                <dt>Kaufpreis</dt>
                <dd>Noch nicht hinterlegt</dd>
              </div>
              <div className={styles.optionalRow}>
                <dt>Händler</dt>
                <dd>Noch nicht hinterlegt</dd>
              </div>
              <div className={styles.optionalRow}>
                <dt>Rechnung oder Beleg</dt>
                <dd>Später per Upload oder Foto</dd>
              </div>
              <div className={styles.optionalRow}>
                <dt>Notiz</dt>
                <dd>Noch nicht hinterlegt</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="fertilizer-product-info-heading">
          <h2 id="fertilizer-product-info-heading" className={styles.sectionHeading}>
            Produktinformationen
          </h2>
          <div className={styles.panel}>
            <p className={styles.panelMessage}>
              Allgemeine Angaben wie NPK und Nährstoffe erscheinen hier am identifizierten
              Produkt — Dein persönlicher Bestand bleibt oben im Fokus.
            </p>
          </div>
        </section>
      </main>
    </HomeAppShell>
  )
}
