# Design System

Visuelle und typografische Regeln für Greenkeeper. Das Design soll **hochwertig, ruhig und vertrauenswürdig** wirken – wie ein erfahrener Begleiter, nicht wie ein generisches SaaS-Dashboard.

Verwandte Dokumente:

- [UX-Prinzipien](./ux-principles.md)
- [Onboarding](./onboarding.md)

---

## Grundhaltung

- Viel Weißraum, wenige visuelle Ebenen
- Warme, natürliche Farben (Grün, Off-White, dezente Erde)
- Typografie mit klarer Rollentrennung: **Headlines emotional**, **UI sachlich**
- Keine lauten Warnfarben ohne fachlichen Grund
- Mobile-first; Touch-Ziele groß genug (Buttons ≥ 52 px Höhe im Onboarding)

---

## Farben

### Onboarding & Premium-Bereiche

| Token | Wert | Verwendung |
|-------|------|------------|
| Hintergrund | `#FAF8F3` | Onboarding-Shell |
| Headline-Text | `#1F3D2B` | Titel, starke Texte |
| Body / sekundär | `rgba(31, 61, 43, 0.74)` | Beschreibungen |
| Akzent / Primary | `#2F6B4F` | Buttons, Links, Fokus |
| Akzent dezent | `rgba(47, 107, 79, 0.24–0.55)` | Linien, Icons, Ränder |
| Placeholder | `#1F3D2B` bei ~28 % Opacity | Beispielzahl im leeren Feld |
| Einheit m² | `rgba(31, 61, 43, 0.68)` | Neben Größeneingabe |

### App (Haupt-UI)

CSS-Variablen in `src/styles/global.css`:

| Token | Wert | Verwendung |
|-------|------|------------|
| `--color-bg` | `#F5F7F4` | Seitenhintergrund |
| `--color-surface` | `#FFFFFF` | Karten, Flächen |
| `--color-accent` | `#2F6B4F` | Primäre Aktionen |
| `--color-text` | `#1C1F1B` | Fließtext |
| `--color-text-secondary` | `#5F6760` | Sekundärtext |
| `--color-excellent` | `#2F6B4F` | Positiver Status |
| `--color-observe` | `#8A7A4A` | Beobachten-Hinweis |

---

## Typografie

| Rolle | Schrift | Gewicht | Einsatz |
|-------|---------|---------|---------|
| Display / Onboarding-Titel | Cormorant Garamond | 700 | Willkommen, Onboarding-Headlines (~40 px) |
| UI / Body | Inter | 400–500 | Buttons, Beschreibungen, Formulare |
| Große Zahleneingabe | Inter | 500 | Flächengröße (~44–56 px responsive) |
| Hinweise | Inter | 400, 13 px | Info-Texte unter Eingaben |
| Sekundärlink | Inter | 400, 15 px | „Später eingeben“, Login-Link |

Letter-Spacing bei großen Zahlen: leicht negativ (`-0.03em`).

---

## Abstände

Spacing-Skala (App): `--space-xs` 8 px bis `--space-2xl` 48 px.

Onboarding:

- Footer-Link unter Primary Button: **~22 px**
- Abstand Zahl ↔ m² in Gruppenanzeige: **~14 px**
- Feste Eingabelinie: **180–200 px**, zentriert

---

## Komponenten

### Primary Button (Onboarding)

- Höhe **52 px**, Radius **16 px**
- Hintergrund `#2F6B4F`, Text weiß, Inter 17 px / 500
- Disabled: ~45 % Opacity, kein aktiver Pressed-State

### Textlink (sekundär)

- Kein Button-Rahmen, **keine Unterstreichung**
- Grünton mit reduzierter Deckkraft (~62 %)
- Mittig unter Primary Actions

### Eingabefeld Größe (Onboarding)

- Unterstreichung statt Rahmen
- Fokus: Linie intensiver (`rgba(47, 107, 79, 0.55)`)
- Placeholder verschwindet beim ersten Tippen

### Auswahlkarten (Onboarding Schritt 2)

- Vertikal, klare Ränder
- Hover/Active-Zustände spürbar
- Chevron unten rechts als Affordance

---

## Sprache in der UI

- Du-Ansprache
- Kurze, sachliche Sätze
- Keine Ausrufezeichen-Flut
- Fehlende optionale Angaben **nicht** als Fehler darstellen

Details: [UX-Prinzipien](./ux-principles.md), [Conversation Model](./conversation-model.md).

---

## Pflege

Neue UI-Bereiche orientieren sich an bestehenden Tokens – keine ad-hoc-Farben in Einzelscreens. Abweichungen bewusst hier dokumentieren.
