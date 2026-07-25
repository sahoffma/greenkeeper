# Bericht – Umbenennung GPT-DRAFT → GPT-INSTRUCTIONS

**Datum:** 2026-07-23  
**Auftrag:** Repository auf Verweise zu `GPT-DRAFT.md` prüfen und auf `GPT-INSTRUCTIONS.md` aktualisieren.

---

## Ergebnis der Repository-Prüfung

| Status | Details |
|--------|---------|
| **Datei `GPT-DRAFT.md`** | Nicht mehr vorhanden (bereits entfernt oder ersetzt) |
| **Datei `GPT-INSTRUCTIONS.md`** | Vorhanden unter `docs/GPT-INSTRUCTIONS.md` (Version 1.2) |
| **Verweise auf `GPT-DRAFT.md`** | 8 Treffer in 3 Dateien — alle aktualisiert |

Keine Treffer außerhalb von `docs/`.

---

## Angepasste Dateien

| Datei | Anzahl geänderter Verweise |
|-------|----------------------------|
| [GREENKEEPER-ARCHITECT.md](./GREENKEEPER-ARCHITECT.md) | 3 |
| [PROJECT-HANDBOOK.md](./PROJECT-HANDBOOK.md) | 1 |
| [GREENKEEPER-ARCHITECT-CONSISTENCY-REPORT.md](./GREENKEEPER-ARCHITECT-CONSISTENCY-REPORT.md) | 4 (Empfehlungen und historische Verweise) |

**Neu:** [GPT-INSTRUCTIONS-REPORT.md](./GPT-INSTRUCTIONS-REPORT.md) (dieser Bericht)

---

## Geänderte Verweise (Detail)

### GREENKEEPER-ARCHITECT.md

| Stelle | Alt | Neu |
|--------|-----|-----|
| Proaktives Arbeiten | `./GPT-DRAFT.md` | `./GPT-INSTRUCTIONS.md` |
| Abgrenzung (Tabelle) | `./GPT-DRAFT.md` (Entwurf) | `./GPT-INSTRUCTIONS.md` |
| Abgrenzung (Abschlusssatz) | `./GPT-DRAFT.md` | `./GPT-INSTRUCTIONS.md` |

### PROJECT-HANDBOOK.md

| Stelle | Alt | Neu |
|--------|-----|-----|
| Kapitel 3 – Greenkeeper Architect | `./GPT-DRAFT.md` | `./GPT-INSTRUCTIONS.md` |

Formulierung angepasst: „spätere dedizierte GPT-Konfiguration“ → „GPT-Konfiguration wird aus … abgeleitet“ (da `GPT-INSTRUCTIONS.md` existiert).

### GREENKEEPER-ARCHITECT-CONSISTENCY-REPORT.md

| Stelle | Änderung |
|--------|----------|
| Empfehlung 3, 6; Tabellenzeilen; Querverweise-Hinweis | Aktualisiert auf `GPT-INSTRUCTIONS.md` |

---

## Weitere Änderungen erforderlich?

| Thema | Status | Empfehlung |
|-------|--------|------------|
| [docs/README.md](./README.md) | ⚠️ Offen | Abschnitt Greenkeeper Architect verweist noch allgemein auf „GPT-Konfiguration aus Manifest, Handbook, Architect“ — optional Link auf `GPT-INSTRUCTIONS.md` ergänzen |
| [docs/GREENKEEPER-ARCHITECT-REPORT.md](./GREENKEEPER-ARCHITECT-REPORT.md) | ✅ OK | Erwähnt bereits `GPT-INSTRUCTIONS.md` (kein GPT-DRAFT-Verweis) |
| [Root README.md](../README.md) | ⚠️ Offen | Kein Verweis auf GPT-Instructions — optional für Onboarding |
| `GPT-INSTRUCTIONS.md` interne Links | ⚠️ Optional | Verwendet derzeit Dateinamen ohne Markdown-Links zu Manifest/Handbook/Architect — konsistent, aber verlinkbar |
| GPT Builder / Custom GPT | ⚠️ Manuell | Inhalt aus `GPT-INSTRUCTIONS.md` in die GPT-Konfiguration übernehmen (außerhalb Repository) |

**Fazit:** Alle **broken links** zu `GPT-DRAFT.md` sind behoben. Optionale Verbesserungen betreffen README-Querverweise und die manuelle GPT-Konfiguration — keine weiteren zwingenden Repository-Änderungen.

---

## Version 1.2 (2026-07-23)

### Anlass der Änderung

Im Projektalltag waren Antworten des Greenkeeper Architect teils ausführlicher als nötig — mit Wiederholungen, Routinenfragen nach weiteren Details und verzögertem Einstieg in die Kernaussage. Version 1.2 regelt **Antworttiefe und Struktur** explizit, ohne Umsetzungsorientierung oder Vollständigkeit bei Cursor-Prompts einzuschränken.

### Neuer Abschnitt

**`# Antworttiefe und Struktur`** — eingefügt nach `# Kommunikation` in [GPT-INSTRUCTIONS.md](./GPT-INSTRUCTIONS.md).

Regelt unter anderem: kompakte Standardantworten, Detail nur bei Bedarf, keine unnötigen Wiederholungen, Kernaussage zuerst, ein klarer nächster Schritt bei umsetzungsbezogenen Antworten, kürzeste belastbare Antwort statt maximaler Länge.

### Auswirkungen auf das Antwortverhalten

| Bereich | Verhalten ab 1.2 |
|---------|------------------|
| **Allgemeine Dialoge** | Kürzer, bedarfsgerecht, Einstieg mit Kernaussage |
| **Größere Entscheidungen** | Ausführlicher, wenn Risiken, Zielkonflikte oder Dokumentationsbedarf es erfordern |
| **Umsetzung** | Weiterhin konsequent in den nächsten Schritt führen — ein Schritt pro Antwort |
| **Cursor-Prompts & Codeblöcke** | Unverändert: vollständig, kopierbar, ohne Platzhalter (`# Ausgabeformat`, `# Arbeitsweise`) |

Kompakte Antworten gelten für **Erklärungen und Beratung**, nicht für **Lieferobjekte**, die in Cursor oder das Repository übernommen werden.

### Ergebnis der Konsistenzprüfung

| Prüfpunkt | Ergebnis |
|-----------|----------|
| Umsetzungsorientierung (`# Arbeitsweise`) | ✅ Kein Widerspruch — neuer Abschnitt ergänzt „nächster Schritt“; Arbeitsweise unverändert |
| Vollständige kopierbare Inhalte (`# Ausgabeformat`) | ✅ Kein Widerspruch — Ausgabeformat gilt unverändert für übernehmbare Inhalte |
| Keine Teillösungen bei Cursor-Prompts (`# Arbeitsweise`) | ✅ Kein Widerspruch — Kürze bezieht sich auf Gesprächstiefe, nicht auf Prompt-Vollständigkeit |
| Team-Formulierungen (`# Ansprache`) | ✅ Keine neuen — durchgängig „Produktinhaber“ |
| `# Kommunikation` (positiv, konstruktiv) | ✅ Kein Widerspruch — Kürze schließt konstruktives Widersprechen nicht aus |
| `# Qualität` (Klarheit vor Komplexität) | ✅ Bestätigt und präzisiert durch Antworttiefe-Regeln |

**Keine weiteren Abschnitte geändert.** Keine Widersprüche festgestellt, die eine Anpassung anderer Kapitel erfordern würden.

