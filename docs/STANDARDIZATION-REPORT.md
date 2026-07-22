# Standardisierungsbericht – Dokumentationskopf

**Datum:** 2026-07-22  
**Ziel:** Einheitlicher Dokumentkopf, Statusdefinitionen, Verlinkungsregeln und Produkt-Grundsatz in `docs/README.md`.

**Regel:** Keine fachlichen Inhalte, IDs oder Status geändert — nur Struktur und Standards.

---

## 1. Zusammenfassung

| Bereich | Stand |
|---------|--------|
| Dokumentkopf GK, GA, GM, DL | ✅ 32 Einzeldokumente ergänzt |
| Dokumentkopf GP, CM | ✅ 12 GP + 10 CM Abschnitte ergänzt |
| Vorlagen | ✅ 6 Templates + Referenzdokument |
| `docs/README.md` | ✅ Statusdefinitionen, Verlinkungsregeln, Produkt-Grundsatz |
| Vollständig standardisiert | ⚠️ **Weitgehend** — siehe offene Schritte |

---

## 2. Angepasste Dateien

### Einzeldokumente (32)

**Ideas (14):** `gk-001.md` … `gk-014.md` (ohne `gk-quellenpaket.md`)

**Architecture (8):** `ga-001.md` … `ga-008.md`

**Model (6):** `gm-001.md` … `gm-006.md`

**Decisions (4):** `dl-001.md` … `dl-004.md`

### Sammeldateien (2)

| Datei | Einträge mit Kopf |
|-------|-------------------|
| `playbook/ux-principles.md` | GP-001 … GP-012 |
| `playbook/conversation-model.md` | CM-001 … CM-010 |

### README und Referenz

| Datei | Änderung |
|-------|----------|
| `docs/README.md` | Produkt-Grundsatz, Dokumentkopf, Statusdefinitionen, Verlinkungsregeln |
| `docs/templates/document-header.md` | **Neu** — verbindlicher Kopf-Standard |

### Hilfsskript

| Datei | Zweck |
|-------|--------|
| `scripts/add-doc-headers.py` | Automatisches Ergänzen des Kopfblocks (Wiederverwendung für neue Einträge) |

---

## 3. Erweiterte Vorlagen

| Template | Ort |
|----------|-----|
| GK | `docs/ideas/templates/gk-template.md` |
| GA | `docs/architecture/templates/ga-template.md` |
| GM | `docs/model/gm-template.md` |
| DL | `docs/decisions/templates/dl-template.md` |
| GP | `docs/playbook/templates/gp-template.md` (**neu**) |
| CM | `docs/playbook/templates/cm-template.md` (**neu**) |

Alle verweisen auf `docs/templates/document-header.md`.

---

## 4. Dokumentkopf — übernommene Werte

| Feld | Herkunft |
|------|----------|
| ID, Titel, Status, Priorität | Aus bestehenden Abschnitten (`## Titel`, `## Status`, …) |
| Kurzbeschreibung | Erster Satz aus `## Beschreibung` / `## Entscheidung` / Prinzipstext |
| Verwandte Dokumente | Aus `## Verwandte Ideen` / `## Verwandte Dokumente` oder Inline-Links (GP/CM) |
| Erstellt, Zuletzt geändert, Verantwortlich | `—` (Platzhalter bis manuell gepflegt) |

Bestehende Abschnitte unter dem Kopf wurden **nicht entfernt oder umgeschrieben**.

---

## 5. Ist die Dokumentation vollständig standardisiert?

**Kernstruktur (GK, GA, GM, DL, GP, CM):** Ja — alle nummerierten Einträge haben den einheitlichen Kopf.

**Noch nicht einbezogen:**

| Bereich | Grund |
|---------|--------|
| `gk-quellenpaket.md` | Migrationsquelle, kein GK-Einzelindex |
| `greenkeeper-data-model.md` | Sammeldokument (Entitäten), keine GM-Einzeldatei-Struktur im Kopf |
| `product-governance.md`, Playbook-Kapitel (Onboarding, Design, …) | Keine ID-Präfix-Einträge |
| **HE-**, **GWP-** | Noch nicht in eigene Index-Struktur migriert |
| Historische Berichte | `MIGRATION-AUDIT.md`, `CONSOLIDATION-REPORT.md`, … bewusst unverändert |

---

## 6. Offene manuelle Schritte

1. **Erstellt / Zuletzt geändert / Verantwortlich** in Einträgen nach und nach befüllen (derzeit `—`).
2. **Verwandte Dokumente** bei GP/CM vollständiger verknüpfen (viele Einträge noch `—` im Kopf, obwohl Querverweise im Fließtext existieren).
3. **Index-Dateien** (`ideas/index.md`, `architecture/index.md`, …) optional um Kopf-Felder erweitern — derzeit Tabellenübersicht ohne Metadatenblock.
4. **HE / GWP** bei Migration in dieselbe Kopf-Struktur überführen.
5. Bei jeder **Statusänderung** Kopf **Zuletzt geändert** und ggf. Index aktualisieren.

---

## 7. Verweise

- [docs/README.md](./README.md) — Statusdefinitionen, Verlinkungsregeln, Produkt-Grundsatz
- [templates/document-header.md](./templates/document-header.md) — Format und Pflichtfelder
- [MIGRATION-GM.md](./MIGRATION-GM.md) — vorheriger GM-Struktur-Schritt
