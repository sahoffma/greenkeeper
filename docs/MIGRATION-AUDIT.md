# Greenkeeper Dokumentations-Audit

Stand: 2026-07-22 · Erstellt als Bestandsaufnahme vor der Dokumentations-Migration. **Keine bestehenden Einträge wurden verändert.**

Methodik: Volltextsuche projektweit nach ID-Präfixen (GK-, GA-, DL-, GP-, CM-), manuelle Prüfung aller Markdown-Dateien unter `/docs`, Stichproben im Quellcode nur dort, wo Einträge konkrete Funktionen beschreiben.

---

## 1. Zusammenfassung

| Kategorie | Anzahl eindeutiger IDs | Höchste Nummer | Nummernlücken |
|-----------|------------------------|----------------|---------------|
| **GK** (Ideen) | 12 | GK-012 | GK-013 ff. noch nicht vergeben (beabsichtigt laut Index) |
| **GA** (Architektur, neues Handbuch) | 8 | GA-008 | GA-009 ff. noch nicht vergeben |
| **GA** (Fachmodell, alte Nummerierung) | 6 | GA-006 | — (parallele Bedeutung, siehe Abschnitt 8) |
| **DL** (Entscheidungen) | 3 | DL-003 | DL-004 ff. noch nicht vergeben |
| **GP** (UX-Prinzipien) | 12 | GP-012 | GP-013 ff. noch nicht vergeben |
| **CM** (Conversation Model) | 10 | CM-010 | CM-011 ff. noch nicht vergeben |

**Zusätzlich gefunden (nicht in `/docs/README.md` aufgeführt):**

| Präfix | Anzahl | Höchste Nummer | Speicherort |
|--------|--------|----------------|-------------|
| **GWP** (Wissensprinzipien) | 8 | GWP-008 | `docs/playbook/knowledge/principles.md` |
| **HE** (Home Experience) | 7 | HE-007 | `docs/playbook/home-experience.md` |

**Kritische Befunde (Kurz):**

- Jede GK-, GA- und DL-ID existiert **mindestens einmal** als inhaltlicher Eintrag; **keine fehlende ID innerhalb der vergebenen Reihen** (001–012 bzw. 001–008 bzw. 001–003).
- **Schwerwiegendster Konflikt:** GA-001 bis GA-006 im [Fachmodell](./greenkeeper-data-model.md) haben **andere Bedeutungen** als GA-001 bis GA-006 im [Architecture-Handbuch](./architecture/index.md). Bereits in `architecture/README.md` und `architecture-decisions.md` dokumentiert, aber **noch nicht aufgelöst**.
- **Vollständige Dubletten:** GK-001–GK-012 und GA-001–GA-008 jeweils in neuer Struktur **und** in alten Playbook-Sammeldateien.
- **Status-Abweichungen:** GK-006, GK-007, GK-009 zwischen alter und neuer Fassung (siehe Abschnitt 8).

---

## 2. Ideenbuch – GK

| ID | Titel | Status | Priorität | Aktueller Speicherort | Inhalt vollständig? | Mögliche Dublette | Hinweise |
|----|-------|--------|-----------|----------------------|---------------------|-------------------|----------|
| GK-001 | Harnstoff 46 %: Dosierung und Anwendung | Idee | Mittel | `docs/ideas/gk-001.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md` | Ja (neu); alt enthält Entscheidungsnotiz 2026-07-21 | `playbook/ideas.md` | Quelle: Facebook-Gruppe „Rasenfanatiker“ |
| GK-002 | Zentrale Geräteverwaltung | Geplant | Hoch | `docs/ideas/gk-002.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md`, `docs/playbook/roadmap.md` | Ja | `playbook/ideas.md` | Roadmap: „Als Nächstes“ |
| GK-003 | Mehrstufige Geräteklassifizierung | Geplant | Hoch | `docs/ideas/gk-003.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md`, `docs/playbook/roadmap.md` | Ja | `playbook/ideas.md` | Verknüpft mit GA-003 |
| GK-004 | Filterbare Fach-Timelines | Idee | Hoch | `docs/ideas/gk-004.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md`, `docs/playbook/roadmap.md` | Ja | `playbook/ideas.md` | Alt-Status: „Idee mit hoher Priorität“ (inhaltlich ≈ Idee + Hoch) |
| GK-005 | Konkrete Maßnahmen statt Sammelbegriffe | Geplant | Hoch | `docs/ideas/gk-005.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md`, `docs/playbook/roadmap.md` | Ja | `playbook/ideas.md` | Alt verweist auf „teilweise MVP (generische Typen)“ |
| GK-006 | Basismaschinen und Anbaugeräte | Idee | Mittel | `docs/ideas/gk-006.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md`, `docs/playbook/roadmap.md` | Ja | `playbook/ideas.md` | **Status-Konflikt:** alt „Prüfen“, neu „Idee“ |
| GK-007 | Maschinen, Anbaugeräte und Handwerkzeuge | Idee | Mittel | `docs/ideas/gk-007.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md` | Ja | `playbook/ideas.md` | **Status-Konflikt:** alt „Prüfen“, neu „Idee“ |
| GK-008 | Wetterintegration | Idee | Niedrig | `docs/ideas/gk-008.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md`, `docs/playbook/roadmap.md` | Ja | `playbook/ideas.md` | Roadmap: „Später prüfen“ |
| GK-009 | Hydrawise-Integration | Idee | Niedrig | `docs/ideas/gk-009.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md`, `docs/playbook/roadmap.md` | Ja | `playbook/ideas.md` | **Status-Konflikt:** alt „Prüfen“, neu „Idee“ |
| GK-010 | Sprachbasierte Detailergänzung | Geplant | Hoch | `docs/ideas/gk-010.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md`, `docs/playbook/roadmap.md` | Ja | `playbook/ideas.md` | Roadmap: „Als Nächstes“ und „Danach“ |
| GK-011 | Kontextgestützte Bestätigung | Geplant | Hoch | `docs/ideas/gk-011.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md`, `docs/playbook/roadmap.md` | Ja | `playbook/ideas.md` | Abhängigkeit GK-002 in Text genannt |
| GK-012 | Produktgruppe Bodenhilfsstoffe | Idee | Mittel | `docs/ideas/gk-012.md`, `docs/ideas/index.md`, `docs/playbook/ideas.md` | Ja | `playbook/ideas.md` | Governance-Kategorien offen |

**Canonical-Empfehlung (noch nicht umgesetzt):** `docs/ideas/gk-XXX.md` + `docs/ideas/index.md` als maßgebliche Quelle; `docs/playbook/ideas.md` nach Migration archivieren oder als Redirect belassen.

---

## 3. Architekturhandbuch – GA

| ID | Titel | Status | Priorität | Aktueller Speicherort | Inhalt vollständig? | Mögliche Dublette | Hinweise |
|----|-------|--------|-----------|----------------------|---------------------|-------------------|----------|
| GA-001 | Stammdaten vor Freitext | Aktiv | Hoch | `docs/architecture/ga-001.md`, `docs/architecture/index.md`, `docs/playbook/architecture-decisions.md` | Ja | `playbook/architecture-decisions.md` | **Widerspruch Fachmodell:** dort GA-001 = „Maßnahmen-Journal, kein Düngejournal“ |
| GA-002 | Historie stabil; Deaktivieren statt Löschen | Aktiv | Hoch | `docs/architecture/ga-002.md`, `docs/architecture/index.md`, `docs/playbook/architecture-decisions.md` | Ja | `playbook/architecture-decisions.md` | **Widerspruch Fachmodell:** dort GA-002 = „Spracheingabe primärer Einstieg“ |
| GA-003 | Geräteart plus fachlicher Untertyp | Aktiv | Mittel | `docs/architecture/ga-003.md`, `docs/architecture/index.md`, `docs/playbook/architecture-decisions.md` | Ja | `playbook/architecture-decisions.md` | **Widerspruch Fachmodell:** dort GA-003 = „Produkte nur über Governance“ |
| GA-004 | Gemeinsame Timeline mit fachlichen Filtern | Aktiv | Hoch | `docs/architecture/ga-004.md`, `docs/architecture/index.md`, `docs/playbook/architecture-decisions.md` | Ja | `playbook/architecture-decisions.md` | **Widerspruch Fachmodell:** dort GA-004 = „Product-Learn-Assistent“ |
| GA-005 | Wetter und Integrationen als optionale Module | Aktiv | Mittel | `docs/architecture/ga-005.md`, `docs/architecture/index.md`, `docs/playbook/architecture-decisions.md` | Ja | `playbook/architecture-decisions.md` | **Widerspruch Fachmodell:** dort GA-005 = „konkrete Maßnahmentypen“ |
| GA-006 | Datenmodell orientiert sich an Greenkeeper-Arbeit | Aktiv | Hoch | `docs/architecture/ga-006.md`, `docs/architecture/index.md`, `docs/playbook/architecture-decisions.md`, `docs/greenkeeper-data-model.md` | Ja | `playbook/architecture-decisions.md`, Fachmodell | Inhaltlich ähnlich zwischen neuem GA-006 und Fachmodell-GA-006; **Nummern-Kollision** mit anderem GA-001–005 im Fachmodell |
| GA-007 | Konkrete Maßnahmen statt Sammelkategorien | Aktiv | Hoch | `docs/architecture/ga-007.md`, `docs/architecture/index.md`, `docs/playbook/architecture-decisions.md` | Ja | `playbook/architecture-decisions.md` | Kein Eintrag im Fachmodell unter GA-007 |
| GA-008 | Mehrere fachliche Referenzen pro Maßnahme | Entwurf | Mittel | `docs/architecture/ga-008.md`, `docs/architecture/index.md`, `docs/playbook/architecture-decisions.md` | Ja | `playbook/architecture-decisions.md` | Alt-Status: „vorgeschlagen“ ≈ neu „Entwurf“; offene Fragen im Fachmodell |

**Hinweis:** Das Fachmodell listet GA-001–GA-006 in einer **eigenen, älteren Semantik**. Das Architecture-README erklärt, dass für neue Arbeit der Index unter `docs/architecture/` maßgeblich ist — die Kollision ist bekannt, aber **inhaltlich ungelöst**.

---

## 4. Entscheidungen – DL

| ID | Titel | Status | Aktueller Speicherort | Inhalt vollständig? | Verknüpfte GK-/GA-Einträge | Hinweise |
|----|-------|--------|----------------------|---------------------|-----------------------------|----------|
| DL-001 | Flächengröße im Onboarding optional | Aktiv | `docs/decisions/dl-001.md`, `docs/decisions/index.md`, `docs/playbook/onboarding.md` | Ja | — (Produktentscheidung, kein GK) | Verknüpft GP-001, GP-010 |
| DL-002 | Zusammenfassung vor Speichern statt Formular-Einstieg | Aktiv | `docs/decisions/dl-002.md`, `docs/decisions/index.md` | Ja | GK-010; CM-005, CM-007 | Entspricht Conversation-Model-Regel CM-005 |
| DL-003 | Offizielle Produktdaten nur über Governance-Pipeline | Aktiv | `docs/decisions/dl-003.md`, `docs/decisions/index.md` | Ja | GA-001; GP-011 | Überlappt inhaltlich mit Fachmodell-GA-003 und `product-governance.md` |

Keine DL-Dubletten außerhalb von `docs/decisions/` gefunden.

---

## 5. Playbook und Conversation Model

### GP – UX- und Produktprinzipien

| ID | Titel | Speicherort | Gültigkeit / Status | Überschneidungen | Migrationsbedarf |
|----|-------|-------------|----------------------|------------------|------------------|
| GP-001 | So einfach wie möglich. So intelligent wie nötig. | `docs/playbook/ux-principles.md`, `docs/playbook/product-principles.md` | Verbindlich (Playbook) | DL-001 | `product-principles.md` ist Dublette mit Migrations-Hinweis |
| GP-002 | Kein reines Dünger-App | `ux-principles.md`, `product-principles.md` | Verbindlich | GA-006 (Fachmodell: Journal-Thema) | Wie oben |
| GP-003 | Sprache als primärer Bedienmodus | `ux-principles.md`, `product-principles.md` | Verbindlich | CM-007, DL-002, GK-010 | Wie oben |
| GP-004 | Erinnern und Historie nutzen | `ux-principles.md`, `product-principles.md` | Verbindlich | CM-003, GK-011, GA-002 | Wie oben |
| GP-005 | Nüchtern fragen, nicht spekulieren | `ux-principles.md`, `product-principles.md` | Verbindlich | CM-006, CM-010, GK-011 | Wie oben |
| GP-006 | Vorschlagen statt erneut abfragen | `ux-principles.md`, `product-principles.md` | Verbindlich | CM-003, CM-004, GK-010 | Wie oben |
| GP-007 | Einmal erfassen, wiederverwenden | `ux-principles.md`, `product-principles.md` | Verbindlich | GA-001, GK-002 | Wie oben |
| GP-008 | Stammdaten statt Freitext | `ux-principles.md`, `product-principles.md` | Verbindlich | GA-001, DL-003 | Wie oben |
| GP-009 | Frage hinter den Daten beantworten | `ux-principles.md`, `product-principles.md` | Verbindlich | GA-004, GK-004 | Wie oben |
| GP-010 | Optionale Module blockieren nicht | `ux-principles.md`, `product-principles.md` | Verbindlich | GA-005, GK-008, GK-009, DL-001 | Wie oben |
| GP-011 | Produkte nach Zusammensetzung beurteilen | `ux-principles.md`, `product-principles.md` | Verbindlich | DL-003, GK-001, GK-012, `product-governance.md` | Wie oben |
| GP-012 | Sprache orientiert sich an Greenkeeper-Arbeit | `ux-principles.md`, `product-principles.md` | Verbindlich | GA-006, GA-007, GK-005, CM-Regeln | Wie oben |

**Canonical-Empfehlung:** `docs/playbook/ux-principles.md` · `product-principles.md` vorübergehend behalten (Redirect-Hinweis vorhanden).

### CM – Conversation Model

| ID | Titel | Speicherort | Gültigkeit / Status | Überschneidungen | Migrationsbedarf |
|----|-------|-------------|----------------------|------------------|------------------|
| CM-001 | Arbeitsberichte, nicht Formular | `docs/playbook/conversation-model.md` | Verbindlich | DL-002, GP-003 | Keiner — bereits im Playbook |
| CM-002 | 1:n Spracheingabe → Maßnahmen | `conversation-model.md` | Verbindlich | Parser (`shared/parseActivityCore.ts`) | Keiner |
| CM-003 | Kontext nutzen | `conversation-model.md` | Verbindlich | GP-004, GP-006, GK-011 | Keiner |
| CM-004 | Rückfrageregeln | `conversation-model.md` | Verbindlich | GP-005, GP-006 | Keiner |
| CM-005 | Zusammenfassung vor Speichern | `conversation-model.md` | Verbindlich | DL-002, GK-010 | Keiner |
| CM-006 | Ergänzen, nicht erfinden | `conversation-model.md` | Verbindlich | GP-005 | Keiner |
| CM-007 | Gespräch statt Formular | `conversation-model.md` | Verbindlich | GP-003, DL-002 | Keiner |
| CM-008 | Qualität der ersten Aussage | `conversation-model.md` | Verbindlich | CM-004 | Keiner |
| CM-009 | Komplexe Arbeitsberichte | `conversation-model.md` | Zielvorstellung | CM-002 | Keiner |
| CM-010 | Mitdenken, nicht vorausdenken | `conversation-model.md` | Verbindlich | GP-005, GP-006 | Keiner |

---

## 6. Inhalte außerhalb der neuen Struktur

| Dateipfad | Wissenstyp | Empfohlener Zielort | Empfehlung | Begründung |
|-----------|------------|---------------------|------------|------------|
| `docs/greenkeeper-data-model.md` | Fachmodell, **alte GA-001–GA-006**, Maßnahmen, Geräte | `docs/` (Root) oder später `docs/architecture/` + `docs/playbook/` aufgeteilt | **Vorübergehend behalten**, verlinken | Bewusst nicht verschoben; GA-Nummern kollidieren mit neuem Handbuch |
| `docs/product-governance.md` | Technische Governance, Review-Workflow | `docs/architecture/` oder eigenes `docs/governance/` | **Verlinken** | Tief technisch; DL-003 verweist darauf; funktionaler Quellcode vorhanden |
| `docs/playbook/roadmap.md` | Priorisierte Umsetzungswellen, Ist-Tabelle | `docs/ideas/` (Meta) oder neues `docs/roadmap.md` | **Migrieren** (später) | Enthält GK-/GA-Verknüpfungen und Umsetzungs-Ist-Stand; veraltete Links zu `ideas.md` / `architecture-decisions.md` |
| `docs/playbook/home-experience.md` | HE-001–HE-007 (Startseiten-Regeln) | `docs/playbook/home-experience.md` oder `docs/playbook/home.md` | **Migrieren** ins Playbook (formal) | Gültige Produktregeln, aber nicht in neuer Playbook-README gelistet |
| `docs/playbook/knowledge/principles.md` | GWP-001–GWP-008 (Wissensbasis) | `docs/playbook/knowledge/` oder `docs/playbook/wissensbasis.md` | **Vorübergehend behalten**, verlinken | Eigenes Präfix GWP; nicht in `/docs/README.md` dokumentiert |
| `docs/playbook/product-principles.md` | GP-001–GP-012 (Alt) | — | **Archivieren** nach Bestätigung | Dublette von `ux-principles.md`; Migrations-Hinweis bereits gesetzt |
| `docs/playbook/ideas.md` | GK-001–GK-012 (Alt) | — | **Archivieren** nach Bestätigung | Vollständige Dublette; Entscheidungsnotizen mit Datum nur hier |
| `docs/playbook/architecture-decisions.md` | GA-001–GA-008 (Alt) | — | **Archivieren** nach Bestätigung | Dublette; Status „angenommen/vorgeschlagen“ statt „Aktiv/Entwurf“ |
| `docs/playbook/sprints/sprint-1.1-home-ux-polish.md` | Sprint-Abnahme, Designentscheidungen | `docs/playbook/sprints/` oder `docs/decisions/` (Sprint-DL) | **Vorübergehend behalten** | Historischer Umsetzungskontext; keine IDs |
| `docs/playbook/sprints/screenshots/README.md` | Screenshot-Harness | `docs/playbook/sprints/screenshots/` | **Behalten** | Artefakt-Dokumentation |
| `README.md` (Repository-Root) | Projekt-README, veralteter Ist-Stand | Root | **Aktualisieren** (separater Task) | Behauptet Timeline/Assistent „nicht umgesetzt“ — widerspricht Code (Timeline, NewActivity, Home) |
| `scripts/docs/playbook/` | Duplikat-Pfad? | — | **Prüfen** | Enthält u. a. `sprints/`-Spiegel; möglicher Sync-Artefakt |

**Playbook-Dateien in neuer Struktur (vollständig):**

- `docs/README.md` — vorhanden, inhaltlich vollständig
- `docs/playbook/README.md` — vorhanden
- `docs/playbook/vision.md` — vorhanden (Links teils aktualisiert)
- `docs/playbook/onboarding.md` — vorhanden
- `docs/playbook/ux-principles.md` — vorhanden
- `docs/playbook/design-system.md` — vorhanden
- `docs/playbook/conversation-model.md` — vorhanden

**Nicht im Soll-Playbook, aber produktrelevant:**

- `docs/playbook/home-experience.md` — HE-Regeln
- `docs/playbook/roadmap.md` — Priorisierung
- `docs/playbook/knowledge/principles.md` — GWP-Regeln

---

## 7. Nummernlücken und mögliche verlorene Einträge

| Präfix | Vergebener Bereich | Lücke danach | Bewertung |
|--------|-------------------|--------------|-----------|
| GK | GK-001 … GK-012 | GK-013 ff. | **Kein Verlust vermutet** — Index nennt GK-013 explizit als nächste freie Nummer |
| GA (neu) | GA-001 … GA-008 | GA-009 ff. | **Kein Verlust vermutet** |
| GA (Fachmodell) | GA-001 … GA-006 | GA-007, GA-008 fehlen im Fachmodell | Erwartbar — neuere GAs nur im Architecture-Handbuch |
| DL | DL-001 … DL-003 | DL-004 ff. | **Kein Verlust vermutet** |
| GP | GP-001 … GP-012 | GP-013 ff. | **Kein Verlust vermutet** |
| CM | CM-001 … CM-010 | CM-011 ff. | **Kein Verlust vermutet** |
| GWP | GWP-001 … GWP-008 | GWP-009 ff. | **Kein Verlust vermutet**; Verweise auf nicht existierende Dateien (`taxonomy.md`, `uncertainty.md`) im selben Ordner |
| HE | HE-001 … HE-007 | HE-008 ff. | **Kein Verlust vermutet** |

**Prüfpunkt:** `docs/playbook/knowledge/principles.md` verweist auf `taxonomy.md`, `sources.md`, `uncertainty.md` — diese Dateien **existieren nicht** im Repository (geplante Erweiterungen, keine verlorenen IDs).

---

## 8. Dubletten und Widersprüche

### Mehrfach vorhandene IDs (gleiche Bedeutung)

| ID | Vorkommen |
|----|-----------|
| GK-001 … GK-012 | `docs/ideas/gk-XXX.md` + `docs/playbook/ideas.md` |
| GA-001 … GA-008 | `docs/architecture/ga-XXX.md` + `docs/playbook/architecture-decisions.md` |
| GP-001 … GP-012 | `docs/playbook/ux-principles.md` + `docs/playbook/product-principles.md` |

### Gleiche ID, unterschiedliche Bedeutung (kritisch)

| ID | Neue Bedeutung (`docs/architecture/`) | Alte Bedeutung (`greenkeeper-data-model.md`) |
|----|---------------------------------------|---------------------------------------------|
| GA-001 | Stammdaten vor Freitext | Maßnahmen-Journal, kein Düngejournal |
| GA-002 | Deaktivieren statt Löschen | Spracheingabe primärer Einstieg |
| GA-003 | Geräteart + Untertyp | Produkte nur über Governance |
| GA-004 | Timeline + Filter | Product-Learn-Assistent |
| GA-005 | Optionale Module | Konkrete Maßnahmentypen |
| GA-006 | Greenkeeper-Arbeitsweise | (inhaltlich ähnlich — gleiche Kernidee) |

### Unterschiedliche Statusangaben

| ID | Quelle A | Quelle B |
|----|----------|----------|
| GK-006 | `ideas/gk-006.md`: **Idee** | `playbook/ideas.md`: **Prüfen** |
| GK-007 | `ideas/gk-007.md`: **Idee** | `playbook/ideas.md`: **Prüfen** |
| GK-009 | `ideas/gk-009.md`: **Idee** | `playbook/ideas.md`: **Prüfen** |
| GK-004 | `ideas/index.md`: **Idee / Hoch** | `playbook/ideas.md`: **Idee mit hoher Priorität** (kein Widerspruch, andere Taxonomie) |
| GA-001–GA-007 | `architecture/`: **Aktiv** | `architecture-decisions.md`: **angenommen** (äquivalent) |
| GA-008 | `architecture/`: **Entwurf** | `architecture-decisions.md`: **vorgeschlagen** (äquivalent) |

### Inhaltlich ähnliche Einträge mit unterschiedlichen IDs

| Thema | IDs | Hinweis |
|-------|-----|---------|
| Produkte nur über Governance | Fachmodell-GA-003, DL-003, `product-governance.md` | Drei Dokumente, eine Entscheidung |
| Zusammenfassung vor Speichern | CM-005, DL-002, Roadmap „Kompakte Maßnahmenzusammenfassung“ | Regel + Entscheidung + Roadmap-Eintrag |
| Konkrete Maßnahmentypen | GA-007, GK-005, Fachmodell-GA-005 | Überlappend |
| Onboarding Größe optional | DL-001, `playbook/onboarding.md` | Konsistent |

### Veraltete vs. neue Fassungen

| Thema | Veraltet | Neu / maßgeblich (laut docs) |
|-------|----------|------------------------------|
| UX-Prinzipien | `product-principles.md` | `ux-principles.md` |
| Ideenbuch | `playbook/ideas.md` | `ideas/gk-XXX.md` |
| Architektur | `playbook/architecture-decisions.md` | `architecture/ga-XXX.md` |
| GA-Nummerierung | `greenkeeper-data-model.md` § Architekturentscheidungen | `architecture/index.md` (explizit „authoritative für neue Arbeit“) |
| Home: Letzte Aktivitäten | HE-003 verlangt Aktivitäten unter Spracheingabe | Sprint 1.1 dokumentiert Sektion; aktueller Home-Code (`src/components/home/`) **ohne** Recent-Activities-Section — mögliche Produktänderung vs. veraltete HE-003 |

---

## 9. Umsetzungsstatus

Nur für Einträge mit konkret beschriebener Funktion. Status bezieht sich auf **Code-Ist-Stand**, unabhängig vom Dokument-Status.

### DL

| ID | Audit-Status | Nachweis / Begründung |
|----|--------------|------------------------|
| DL-001 | 🚧 In Umsetzung | **UI:** `OnboardingSingleAreaSizePage.tsx` („Später eingeben“, Navigation ohne `size`). **Fehlt:** Persistenz — Schritt 4 ist Platzhalter (`OnboardingStep4PlaceholderPage.tsx`); kein Schreiben von `size_sqm = null` in DB im Onboarding-Flow |
| DL-002 | 🚧 In Umsetzung | **Teilweise:** `NewActivityPage.tsx` — Parse → `summarySection` → editierbare Felder → Speichern; `parseActivityCore.ts` / `buildActivitySummaryRows`. **Abweichung:** Formularfelder parallel sichtbar; kein reiner „Speichern / Details ergänzen“-Dialog wie CM-005 |
| DL-003 | ✅ Umgesetzt | **Schema:** `supabase/schema.sql` — `product_submissions`, `soft_deleted_at`, Governance-Tabellen. **Code:** `src/lib/productGovernance*.ts`, `ProductLearnAssistant`, `product-assistant-*` Netlify Functions |

### GK (Auswahl mit Code-Bezug)

| ID | Audit-Status | Nachweis / Begründung |
|----|--------------|------------------------|
| GK-001 | 💡 Idee | Kein Harnstoff-Rechner oder Wissensmodul im Code gefunden |
| GK-002 | 💡 Idee | Keine Geräte-Tabelle / -UI in `supabase/schema.sql` oder `src/` |
| GK-003 | 💡 Idee | Wie GK-002 — keine Geräteart/Untertyp-Implementierung |
| GK-004 | 🚧 In Umsetzung | **Basis:** `TimelinePage.tsx`, `fetchTimelineActivities` — chronologische Liste **ohne** Fachfilter und **ohne** kategoriespezifische Kennzahlen |
| GK-005 | 🚧 In Umsetzung | **Teilweise:** `activity_type` enum + `measure_details` (`20250724_measure_activity_types.sql`); Typen u. a. `mowing`, `watering`, `aerating`, `application`, `other`. **Fehlt:** fachliche Typen laut Idee (Spiken, Topdressen, Lüften …); Mapping `aerating` → Label „Vertikutieren“ in `activityLabels.ts` |
| GK-006 | 💡 Idee | Keine Basismaschine/Anbaugerät-Modelle |
| GK-007 | 💡 Idee | Keine Geräteklassifikation im Code |
| GK-008 | 💡 Idee | Keine Wetter-API-Anbindung |
| GK-009 | 💡 Idee | Keine Hydrawise-Integration |
| GK-010 | 💡 Idee | Keine nachträgliche Sprach-Detailergänzung an bestehender Maßnahme |
| GK-011 | 💡 Idee | Keine Historie-basierte Bestätigungs-UX („wie beim letzten Mal“) |
| GK-012 | ❓ Unklar | Bodenhilfsstoffe als Produktgruppe — `products.category` vorhanden, dedizierte Gruppe nicht eindeutig im Code verifiziert |

### GA (Auswahl mit Code-Bezug)

| ID | Audit-Status | Nachweis / Begründung |
|----|--------------|------------------------|
| GA-001 | 🚧 In Umsetzung | **Teilweise:** Flächen/Produkte als Stammdaten (`areas`, `products`); Maßnahmen referenzieren Produkte per Name. **Fehlt:** Geräte-Stammdaten; Freitext-Produktnamen weiterhin in Maßnahmen |
| GA-002 | 🚧 In Umsetzung | **Teilweise:** `products.soft_deleted_at`, `areas.archived_at`; Timeline bleibt lesbar. **Fehlt:** durchgängiges Deaktivieren statt Löschen für alle Stammdaten |
| GA-003 | 💡 Idee | Keine Geräte-Entität |
| GA-004 | 🚧 In Umsetzung | Gemeinsame Timeline ja (`TimelinePage.tsx`); Filter und Sichten nein |
| GA-005 | ✅ Umgesetzt (Kern) | Kern-Journal nutzbar ohne Wetter/Hydrawise/Bodenanalyse — keine Pflicht-Integration im Flow |
| GA-006 | 🚧 In Umsetzung | Fachliche Labels teilweise (`activityLabels.ts`); technische Enums (`application`, `other`) verbleiben |
| GA-007 | 🚧 In Umsetzung | Wie GK-005 — erweiterte Typen, aber nicht vollständig fachlich |
| GA-008 | 💡 Idee | Status Entwurf; keine multi-reference Maßnahmen-Modellierung im Schema |

### Roadmap-Ist-Tabelle vs. Code

| Roadmap-Aussage (`playbook/roadmap.md`) | Audit |
|----------------------------------------|-------|
| „Maßnahmen-Journal (Basis) teilweise“ | 🚧 — stimmig |
| „Product-Learn-Assistent umgesetzt“ | ✅ — `ProductLearnAssistant`, Governance-Flow |
| „Product-Governance V2 umgesetzt“ | ✅ — Schema + Libs |
| „Geräteverwaltung nicht umgesetzt“ | 💡 — stimmig |
| „Timeline-Filter nicht umgesetzt“ | 💡/🚧 — Timeline ja, Filter nein |

---

## 10. Empfohlene nächste Schritte

### 1. Kritisch — fehlende oder unvollständige Einträge

1. **GA-Nummern-Kollision auflösen** — Fachmodell-GA-001–006 umbenennen (z. B. FM-001) oder ins Architecture-Handbuch migrieren und Fachmodell-Tabelle ersetzen.
2. **Entscheidungsnotizen aus `playbook/ideas.md` übernehmen** — Datumsnotizen (2026-07-21) fehlen in `docs/ideas/gk-XXX.md`.
3. **GWP- und HE-Präfixe** in `docs/README.md` und Playbook-README aufnehmen oder bewusst als Unterkapitel definieren.
4. **DL-001 Persistenz** — Onboarding-Ende muss `size_sqm = null` schreiben (aktuell nur Query-Parameter).

### 2. Dubletten

1. Nach Freigabe: `playbook/ideas.md`, `playbook/architecture-decisions.md`, `playbook/product-principles.md` als **archiviert** markieren (nicht löschen).
2. Ein **Canonical-Feld** in jedem Index: „Maßgebliche Datei: …“.

### 3. Widersprüchliche Statuswerte

1. GK-006, GK-007, GK-009: **Prüfen** vs. **Idee** gemeinsam festlegen.
2. HE-003 vs. aktueller Home-Code: Regel anpassen oder UI wieder ergänzen — Entscheidung dokumentieren (evtl. DL-004).

### 4. Notwendige Migrationen

1. `roadmap.md` → Links auf `ideas/index.md` und `architecture/index.md` aktualisieren; optional eigenes Top-Level-Dokument.
2. `home-experience.md` → in Playbook-README aufnehmen.
3. `knowledge/principles.md` (GWP) → Playbook-Verzeichnisstruktur klären; fehlende Dateien (`taxonomy.md`) als GK oder Backlog erfassen.
4. Root-`README.md` an Code-Ist anpassen.

### 5. Gemeinsam bestätigen (Umsetzungsstatus)

| Thema | Frage |
|-------|-------|
| GK-005 / GA-007 | Reicht der aktuelle `activity_type`-Enum als „teilweise umgesetzt“, oder Status dokumentarisch auf 🚧 belassen? |
| DL-002 | Gilt `NewActivityPage` mit Summary + Formular als Erfüllung von CM-005 — oder nur 🚧? |
| Fachmodell-GA vs. Architecture-GA | Welche Nummernreihe wird langfristig authoritative — und wie werden alte Verweise migriert? |

---

*Ende des Audits. Keine Index- oder Eintragsdateien wurden durch diesen Bericht verändert.*
