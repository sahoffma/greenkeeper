# Onboarding

Verbindliche Regeln für die **Ersteinrichtung** von Greenkeeper. Technische Routen und Ist-Stand des Codes können sich entwickeln – die **Produktlogik** hier bleibt maßgeblich.

Verwandte Dokumente:

- [UX-Prinzipien](./ux-principles.md) – GP-001, GP-010
- [Design System](./design-system.md)
- [Entscheidung DL-001](../decisions/dl-001.md) – optionale Flächengröße
- [Entscheidung DL-004](../decisions/dl-004.md) – Anzahl Flächen vs. gemeinsame Pflege

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
| 2 – Rasenflächen | `/onboarding/2` | Eine oder mehrere Rasenflächen wählen |
| 3 – Größe | `/onboarding/3?areas=single\|multiple` | Größe der Fläche(n); `multiple` noch Platzhalter |
| 4 – Folgeschritt | `/onboarding/4` | Weiterer Onboarding-Schritt (in Umsetzung) |

Query-Parameter transportieren den Zwischenstand (`areas`, optional `size`), bis persistente Onboarding-Speicherung implementiert ist.

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
- Navigiert zu Schritt 4 mit `size` in der URL

### Später eingeben

- Dezenter Textlink **„Später eingeben“** unter dem Button
- Gleicher nächster Schritt wie „Weiter“, **ohne** gespeicherte Größe
- Flächengröße = `null` / unbekannt → später unter **Meine Flächen** ergänzbar
- **Keine** Warnung, kein Hinweis auf „unvollständiges“ Onboarding

Siehe [DL-001](../decisions/dl-001.md).

---

## Schritt 2 – Anzahl Rasenflächen

- Zwei vertikale Auswahlkarten: **eine** vs. **mehrere** Rasenflächen
- Klare visuelle Hierarchie, Karten interaktiv (Hover/Active)
- Navigation per Query-Parameter `areas=single|multiple`

Siehe [DL-004](../decisions/dl-004.md): Die **Anzahl** der Flächen und die Frage nach **gleicher Pflege** sind getrennte Sachverhalte.

---

## Mehrere Rasenflächen – Produktlogik (DL-004)

1. Nutzer wählt zunächst **eine oder mehrere** Rasenflächen (Schritt 2).
2. Bei **mehreren** Flächen werden die Flächen **einzeln erfasst** (Onboarding noch in Umsetzung für `areas=multiple`).
3. **Erst danach** folgt die Frage: **„Pflegst du alle Rasenflächen gleich?“**
4. **Ja** → ein gemeinsamer Pflegeplan für alle erfassten Flächen
5. **Nein** → getrennte Pflegepläne pro Fläche bzw. Pflegekontext

**Begründung:** Mehrere räumlich getrennte Flächen können identisch gepflegt werden. Die bloße Anzahl darf nicht automatisch mehrere Pflegepläne erzeugen.

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

- Onboarding für **mehrere** Rasenflächen (Schritt 3 `multiple`) – siehe [DL-004](../decisions/dl-004.md), [GK-013](../ideas/gk-013.md)
- Freundliche Erinnerung bei fehlender Flächengröße nach Onboarding – siehe [GK-014](../ideas/gk-014.md)
- Persistente Speicherung statt Query-Parameter
- Abschluss und Übergang in Home-Experience nach Schritt 4

Neue Onboarding-Ideen → [ideas/](../ideas/index.md). Getroffene Entscheidungen → [decisions/](../decisions/index.md).
