# Onboarding

Verbindliche Regeln für die **Ersteinrichtung** von Greenkeeper. Technische Routen und Ist-Stand des Codes können sich entwickeln – die **Produktlogik** hier bleibt maßgeblich.

Verwandte Dokumente:

- [UX-Prinzipien](./ux-principles.md) – GP-001, GP-010
- [Design System](./design-system.md)
- [Entscheidung DL-001](../decisions/dl-001.md) – optionale Flächengröße
- [Entscheidung DL-004](../decisions/dl-004.md) – Anzahl Flächen vs. gemeinsame Pflege
- [Entscheidung DL-005](../decisions/dl-005.md) – Pflegepräferenz bei mehreren Flächen
- [Entscheidung DL-006](../decisions/dl-006.md) – Mehrflächen-Anzahl, Namen, Größe je Fläche
- [Entscheidung DL-007](../decisions/dl-007.md) – Pflegegruppen, atomarer Abschluss

---

## Ziel

Greenkeeper soll **ohne unnötige Hürden** nutzbar sein. Onboarding führt den Nutzer in den Garten ein – es prüft nicht wie ein Formular-Audit.

- Wenige, klare Schritte
- Freiwillige Angaben dort, wo sie nicht zwingend sind
- Kein Gefühl von „unvollständig“ oder Fehler bei legitimen Abkürzungen

---

## Ablauf (Ist-Stand)

| Schritt | Route | Inhalt |
|---------|-------|--------|
| 1 – Willkommen | `/onboarding` | Einstieg, Claim, „Garten einrichten“ |
| 2 – Anzahl | `/onboarding/2` | **Einmalig:** 1, 2, 3 oder mehr als 3 Rasenflächen |
| 2b – Pflegepräferenz | `/onboarding/2/care` | Nur bei 2–20 Flächen: gemeinsam vs. einzeln pflegen |
| 3 – Größe | `/onboarding/3?areas=single\|multiple&…` | Größe (single); Größe je Fläche (multiple); **Abschluss mit „Los geht’s“** |
| 4 – Legacy | `/onboarding/4` | Nur noch Abwärtskompatibilität für alte URLs (Speichern → Startseite) |

Die frühere Route `/onboarding/2/count` leitet auf den passenden Schritt weiter (Abwärtskompatibilität).

Query-Parameter transportieren den **laufenden** Onboarding-State (`areas`, `count`, `care`, `index`, `name1…`, optional `size` / `size1…`). Nach erfolgreichem Abschluss werden die Flächen in Supabase gespeichert und der Nutzer gelangt zur Startseite (`/`).

---

## Schritt 2 – Anzahl Rasenflächen (gemeinsamer Auswahl-Schritt)

Headline: **„Wie viele Rasenflächen hat dein Garten?“**

Direkte Auswahl:

- **1 Rasenfläche** → Größeneingabe (Einzelfläche)
- **2**, **3 Rasenflächen** → Pflegefrage
- **Mehr als 3** → Eingabe **4–20**, danach Pflegefrage

Die frühere Unterscheidung „Eine Rasenfläche“ / „Mehrere Rasenflächen“ und der separate spätere Anzahl-Schritt entfallen.

Siehe [DL-004](../decisions/dl-004.md), [DL-006](../decisions/dl-006.md).

---

## Schritt 3 – Flächengröße (single)

### Headline und Ton

- Headline: **„Wie groß ist deine Rasenfläche?“**
- Untertitel erklärt Quadratmeter – sachlich, ohne Druck
- Hinweis zur Flächenmessungs-App bleibt **informativ**, nicht warnend

### Eingabe

- Nur **positive Ganzzahlen** (Quadratmeter)
- Placeholder **„50“** in Eingabe-Typografie, reduzierte Deckkraft (~28 %)
- Zahl und **m²** als gemeinsame, zentrierte Einheit
- Feste, kompakte Unterstreichung – unabhängig von Eingabelänge
- **Kein Autofokus** – Tastatur öffnet erst beim Tippen
- Bei Fokus: sanftes Scrollen, damit Button sichtbar bleibt

### Weiter-Button

- Aktiv nur bei gültiger positiver Ganzzahl
- Auf dem **letzten Schritt** heißt der Button **„Los geht’s“** (statt „Weiter“)
- Speichert atomar über **`complete_onboarding`** (Flächen, Pflegegruppen, Abschlussstatus) und navigiert zur **Startseite** (`/`)

### Später eingeben

- Dezenter Textlink **„Später eingeben“** unter dem Button
- Auf dem letzten Schritt ebenfalls **Abschluss** — ohne gespeicherte Größe für diese Fläche
- Flächengröße = `null` / unbekannt → später unter **Meine Flächen** ergänzbar
- **Keine** Warnung, kein Hinweis auf „unvollständiges“ Onboarding

### Speicherfehler

- Ruhige Meldung: **„Das hat gerade nicht geklappt. Bitte versuche es noch einmal.“**
- Eingaben bleiben erhalten; erneuter Versuch über denselben Button

Siehe [DL-001](../decisions/dl-001.md).

---

## Mehrere Rasenflächen – Produktlogik (DL-004, DL-005, DL-006)

1. Nutzer wählt **einmalig** die Anzahl: **1**, **2**, **3** oder **mehr als 3** (4–20) — [DL-006](../decisions/dl-006.md)
2. Bei **1 Fläche** → direkt freiwillige Größenangabe ([DL-001](../decisions/dl-001.md))
3. Bei **2–20 Flächen** → **„Wie pflegst du deine Rasenflächen?“** ([DL-005](../decisions/dl-005.md))
   - **Meistens gemeinsam** (`together`)
   - **Lieber einzeln** (`separate`)
   - Hinweis: **Du kannst das später jederzeit ändern.**
4. **Automatische Namen** — `Rasenfläche 1`, `Rasenfläche 2`, … (keine Namenseingabe; Umbenennung nach Onboarding geplant)
5. **Größe je Fläche** — nacheinander, freiwillig, mit Orientierung „Rasenfläche X von Y“ und **Später eingeben** pro Fläche
6. **Abschluss** — auf dem letzten Größen-Screen mit **„Los geht’s“** direkt zur Startseite (`/`); keine sichtbare Zusammenfassung — [DL-007](../decisions/dl-007.md)
7. Jede Rasenfläche bleibt **fachlich eigenständig**. `together` / `separate` sind **Onboarding-Eingaben** und werden in **Pflegegruppen** übersetzt (internes Modell, keine sichtbare UX).

**Begründung:** Mehrere räumlich getrennte Flächen können identisch gepflegt werden. Die Anzahl wird nur einmal abgefragt — ohne Wiederholung.

Entwurfsidee: [GK-013](../ideas/gk-013.md)

---

## Schritt 1 – Willkommen

- Premium, ruhige Gestaltung (Cormorant + Inter, warmes Off-White)
- Primäraktion: **Garten einrichten**
- Sekundärlink: Login für bestehende Nutzer

---

## Was Onboarding nicht ist

- Kein Pflicht-Formular für alle Stammdaten
- Keine Produkt- oder Geräte-Erfassung in den ersten Schritten
- Keine Social- oder Marketing-Funnel-Logik

---

## Offene Punkte

- Freundliche Erinnerung bei fehlender Flächengröße nach Onboarding – siehe [GK-014](../ideas/gk-014.md)
- Onboarding nur mit Session / Route-Guards — siehe Folgearbeit
- Umbenennung von Rasenflächen nach dem Onboarding
- Sichtbare Verwaltung von Pflegegruppen (Zusammenführen/Trennen)
- Home-Experience: Startseite (`/`) zeigt noch Dummy-Daten statt gespeicherter Flächen

Neue Onboarding-Ideen → [ideas/](../ideas/index.md). Getroffene Entscheidungen → [decisions/](../decisions/index.md).
