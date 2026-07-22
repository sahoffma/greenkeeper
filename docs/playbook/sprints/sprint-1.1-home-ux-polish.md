# Sprint 1.1 – Home Experience UX Polish

Abnahmedokumentation für den UX-Polish-Sprint der Startseite.

**Scope:** Nur UI/Design. Keine neuen Funktionen, keine KI, keine API, keine Datenbank.

**Screenshot:** [`screenshots/home-experience-mobile.png`](./screenshots/home-experience-mobile.png)

---

## Umgesetzte Anforderungen

| Bereich | Umsetzung |
|---------|-----------|
| Hero | Ruhiger Bild-Placeholder (weiche Naturtöne, leichte Tiefe), 50 % Viewport-Höhe, Overlay-Text ohne Upload-/Plus-Button |
| Mikrofon | 128×128 px, überlappt Hero (`margin-top: -64px`), weißer Ring verbindet Garten und Gesprächsbereich |
| Beispieltexte | Vier Prompts als Chat-Blase mit 💬, rotierend alle 4,5 s |
| Letzte Aktivitäten | Transparent, kleinere Typografie, mehr Abstand, kein Schatten |
| Rasenflächen | Leicht harmonisierte Abstände und Kartengrößen (Sprint 1.1.1) |
| Navigation | Journal · Greenkeeper (hervorgehoben) · Garten |

---

## Designentscheidungen

### 1. Hero-Placeholder statt Stockfoto

**Entscheidung:** Mehrschichtiger CSS-Gradient mit radialen Lichtpunkten in neutralen Grün-/Beigetönen.

**Begründung:** Kein externes Bild nötig; wirkt ruhiger als der frühere flache Grünverlauf und passt zum Premium-Anspruch ohne Ladezeit oder Lizenzfragen.

**Alternative verworfen:** Unsplash-URL – externe Abhängigkeit, nicht offline, nicht kontrollierbar.

---

### 2. Hero als `<button>` ohne sichtbare Aktion

**Entscheidung:** Gesamter Hero-Bereich ist ein Button ohne Upload-Label; Klick derzeit ohne Handler.

**Begründung:** Sprint fordert spätere Antippbarkeit, aber keinen Upload-Button. Button-Semantik bereitet Foto-Upload vor.

**TODO:** `HeroSection.tsx` – Handler für Foto-Upload anbinden.

---

### 3. Mikrofongröße 128 px

**Entscheidung:** Durchmesser von 96 px auf 128 px erhöht; Icon 48 px; 4 px Rand in App-Hintergrundfarbe.

**Begründung:** Deutlich dominantere zentrale Interaktion; Rand trennt Mikrofon visuell vom Hero und verstärkt Überlappungseffekt.

**Alternative verworfen:** 112 px – wirkte im Vergleich noch zu nah an Sprint 1, nicht „deutlich größer“.

---

### 4. Beispieltexte als Chat-Blase

**Entscheidung:** Weiße, leicht transparente Blase mit 💬-Prefix und `aria-live="polite"`; visuell getrennt von Aktivitätszeilen.

**Begründung:** Prompts sollen nicht wie echte Journal-Einträge wirken; Sprechblasen-Metapher entspricht Conversation Model.

**Inhalt:** Nur Funktionen, die existieren oder unmittelbar folgen (Maßnahme, Produkt, Historie, zweite Fläche). Keine KI-Wissensfragen.

**Entfernt:** „Welchen Dünger aus meinem Bestand würdest du jetzt empfehlen?“ – deutet nicht implementierte Wissensfunktion an.

---

### 5. Keine Fade-Animation bei Prompt-Wechsel

**Entscheidung:** `@keyframes promptFade` entfernt; Text wechselt statisch.

**Begründung:** Sprint schließt Animationen aus; ruhigere Lösung bevorzugt („Weniger ist mehr“).

**Beibehalten:** Rotations-Intervall (4,5 s) – funktional für Inspiration, kein dekorativer Effekt.

---

### 6. Letzte Aktivitäten maximal zurückgenommen

**Entscheidung:** Kein Kartenhintergrund, keine Schatten, tertiary Textfarbe, größere Zeilenabstände.

**Begründung:** Aktivitäten unterstützen, konkurrieren nicht mit Mikrofon.

---

### 7. Bottom Navigation – mittlerer Tab

**Entscheidung:** Reihenfolge Journal | Greenkeeper | Garten; Center-Tab leicht erhöht (`margin-top: -6px`), größeres Icon.

**Begründung:** Spiegelt Produktphilosophie (Vergangenheit · Gegenwart · Verwaltung) ohne Plus-Button oder zusätzliche Tabs.

---

### 8. Marketing-Begriffe vermieden

**Entscheidung:** Dummy-Aktivität „Dünger ausgebracht“ statt „Herbstdünger“.

**Begründung:** Explizite Sprint-Vorgabe; fachlich neutral.

---

## Offene TODOs

| Datei | TODO |
|-------|------|
| `src/components/home/HeroSection.tsx` | Gesamten Hero-Bereich antippbar machen (Foto-Upload) |
| `src/components/home/ConversationSection.tsx` | Spracheingabe anbinden (separater Sprint) |
| `src/components/home/LawnCarouselSection.tsx` | Flächen-Mikrofone anbinden (separater Sprint) |
| `src/pages/JournalPage.tsx` | Journal-Inhalt (separater Sprint) |
| `src/pages/GardenPage.tsx` | Gartenverwaltung (separater Sprint) |

---

## Screenshot erzeugen

```bash
npm install -D playwright
npx playwright install chromium
npm run screenshot:home
```

Ausgabe: `docs/playbook/sprints/screenshots/home-experience-mobile.png`

Der Screenshot-Harness (`scripts/screenshot/`) rendert `HomeScreen` ohne Auth – nur für Dokumentation, nicht Teil der App.

---

## Nicht umgesetzt (bewusst)

- Spracheingabe, KI, API, Datenbank
- Wetter, Sensoren, Journal-/Garten-Funktionen
- Zusätzliche Animationen
- Weitere UX-Ideen über die Spezifikation hinaus

**Nächster Schritt:** UX-Review – erst danach Sprint 2.
