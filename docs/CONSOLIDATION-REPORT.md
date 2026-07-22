# Konsolidierungsbericht – Projektdokumentation

Stand: 2026-07-22 · Folgearbeit zum [Migrations-Audit](./MIGRATION-AUDIT.md)

---

## Zusammenfassung

- **GA/GM-Doppelbelegung aufgelöst:** Fachmodell-Entscheidungen heißen künftig **GM-001 … GM-006**; **GA** bleibt für `docs/architecture/`.
- **Status-Taxonomie vereinheitlicht** auf sechs Werte mit Emoji-Präfix.
- **`docs/README.md`** erweitert um alle Präfixe, Taxonomie und Workflow.

---

## 1. ID-Umbenennungen (Fachmodell)

| Alt (Fachmodell) | Neu (GM) | Inhalt (unverändert) |
|------------------|----------|----------------------|
| GA-001 | **GM-001** | Maßnahmen-Journal, kein Düngejournal |
| GA-002 | **GM-002** | Spracheingabe primärer Einstieg |
| GA-003 | **GM-003** | Produkte nur über Governance |
| GA-004 | **GM-004** | Product-Learn-Assistent bei unbekannten Produkten |
| GA-005 | **GM-005** | Konkrete Maßnahmentypen |
| GA-006 | **GM-006** | Orientierung an Greenkeeper-Arbeitsweise |

Abschnitt in `greenkeeper-data-model.md`: „Architekturentscheidungen“ → **„Modellentscheidungen (GM)“**.

**GA-001 … GA-008** in `docs/architecture/` unverändert inhaltlich und nummerisch.

---

## 2. Status-Anpassungen

### Mapping (Alt → Neu)

| Alt | Neu |
|-----|-----|
| Idee | 💡 Idee |
| Prüfen | 💡 Idee |
| Idee mit hoher Priorität | 💡 Idee |
| Geplant | 📋 Geplant |
| Entwurf / vorgeschlagen | 📋 Geplant |
| angenommen / Aktiv (GA, DL) | ✅ Umgesetzt |
| In Umsetzung | 🚧 In Umsetzung *(unverändert, wo bereits verwendet)* |
| ersetzt | ❌ Verworfen *(mit Nachfolger in Text)* |

### Betroffene GK-Status (canonical: `docs/ideas/`)

| ID | Neuer Status |
|----|--------------|
| GK-001, GK-004, GK-006, GK-007, GK-008, GK-009, GK-012 | 💡 Idee |
| GK-002, GK-003, GK-005, GK-010, GK-011 | 📋 Geplant |

### Betroffene GA-Status

| ID | Neuer Status |
|----|--------------|
| GA-001 … GA-007 | ✅ Umgesetzt |
| GA-008 | 📋 Geplant |

### Betroffene DL-Status

| ID | Neuer Status |
|----|--------------|
| DL-001, DL-002, DL-003 | ✅ Umgesetzt |

---

## 3. Geänderte Dateien

### Kern

- `docs/README.md` — Präfixe (GP, CM, GK, GA, GM, DL), Taxonomie, Workflow, GA/GM-Abgrenzung
- `docs/greenkeeper-data-model.md` — GM-001 … GM-006, Abschnittsüberschrift, Verwandte Dokumente

### Architecture

- `docs/architecture/README.md`
- `docs/architecture/index.md`
- `docs/architecture/ga-001.md` … `ga-008.md` (Status)
- `docs/architecture/ga-006.md` (GM-Verweis)
- `docs/architecture/templates/ga-template.md`

### Ideas

- `docs/ideas/README.md`
- `docs/ideas/index.md`
- `docs/ideas/gk-001.md` … `gk-012.md` (Status)
- `docs/ideas/templates/gk-template.md`

### Decisions

- `docs/decisions/README.md`
- `docs/decisions/index.md`
- `docs/decisions/dl-001.md` … `dl-003.md` (Status)
- `docs/decisions/dl-003.md` (GM-003-Verweis)
- `docs/decisions/templates/dl-template.md`

### Playbook (Alt-Dubletten aktualisiert, nicht gelöscht)

- `docs/playbook/README.md`
- `docs/playbook/ideas.md`
- `docs/playbook/architecture-decisions.md`
- `docs/playbook/roadmap.md`

### Neu

- `docs/CONSOLIDATION-REPORT.md` (diese Datei)

**Nicht geändert:** `docs/MIGRATION-AUDIT.md` (historischer Audit-Stand).

---

## 4. Querverweise

- `dl-003.md`: GM-003 ergänzt; Alternativen-Tabelle nennt GM-003 statt fachlicher GA-003.
- `architecture/index.md` und `ga-006.md`: Verweise auf GM-006.
- `architecture-decisions.md`: Hinweis auf GM-Präfix statt „ältere GA-Nummerierung“.
- `roadmap.md`: Links auf `ideas/index.md` und `architecture/index.md`.

---

## 5. Offene Konflikte / Restarbeit

| Thema | Status |
|-------|--------|
| GA/GM-Nummernkollision | **Aufgelöst** (GM im Fachmodell) |
| GK/GA/DL-Dubletten in `playbook/ideas.md` und `architecture-decisions.md` | **Offen** — Dateien aktualisiert, aber nicht archiviert |
| `MIGRATION-AUDIT.md` beschreibt noch alten Konflikt | **Offen** — Audit bewusst unverändert als Snapshot |
| HE-003 vs. Home-Code (letzte Aktivitäten) | **Offen** — keine Änderung in diesem Schritt |
| GWP-/HE-Präfixe | **Offen** — in `docs/README.md` erwähnt, noch nicht in eigene Index-Struktur migriert |
| `scripts/docs/playbook/` Spiegelverzeichnis | **Offen** — nicht geprüft |
| Root-`README.md` veralteter Ist-Stand | **Offen** — außerhalb `/docs` |
| `knowledge/principles.md` verweist auf fehlende `taxonomy.md` etc. | **Offen** |

---

## 6. Bewusst nicht geändert

- Keine neuen GK-, GA- oder DL-Einträge angelegt.
- Keine inhaltlichen Produktentscheidungen getroffen.
- Keine Dateien gelöscht.
- Quellcode unberührt.
